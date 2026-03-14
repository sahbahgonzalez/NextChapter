let gameId = null;
let gameData = null;
let currentView = 'team';

const LIVE_GAME_STATE_KEY = 'tnc_live_game_state_active_v1';
let backendRefreshTimer = null;
let localRefreshTimer = null;
let chartReplayRegistry = new Map();

const REPLAY_TICK_MS = 1500;

const replayState = {
    chartId: '',
    title: '',
    steps: [],
    currentIndex: -1,
    timer: null,
    isPlaying: false
};

const PLAYER_COLORS = ['#22C55E', '#2563EB', '#EC4899', '#F97316', '#0EA5E9', '#A855F7'];

function getGameIdFromUrl() {
    const params = new URLSearchParams(window.location.search);
    return params.get('id');
}

function isLiveModeFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const liveValue = String(params.get('live') || '').toLowerCase();
    return liveValue === '1' || liveValue === 'true' || liveValue === 'yes';
}

function isLiveStatus(status) {
    return status === 'live' || status === 'in_progress';
}

function getLiveSnapshotForGame() {
    try {
        const raw = localStorage.getItem(LIVE_GAME_STATE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        const snapshotGameId = String(parsed?.gameContext?.gameId || '');
        if (!snapshotGameId || snapshotGameId !== String(gameId || '')) return null;
        return parsed;
    } catch (err) {
        console.warn('Failed to load live snapshot for shot charts.', err);
        return null;
    }
}

function getPlayerId(event) {
    if (!event) return '';
    return event.player_id?._id ? String(event.player_id._id) : String(event.player_id || '');
}

function getPlayerNameMap() {
    const names = new Map();
    (gameData?.all_player_ids || []).forEach((player) => {
        const id = String(player?._id || player?.id || '');
        if (id) names.set(id, player?.name || 'Player');
    });

    const snapshotPlayers = getLiveSnapshotForGame()?.gameContext?.players || {};
    Object.keys(snapshotPlayers).forEach((key) => {
        const player = snapshotPlayers[key];
        const id = String(player?._id || '');
        if (id && !names.has(id)) names.set(id, player?.name || 'Player');
    });

    return names;
}

function buildEventsFromSnapshot(snapshot) {
    if (!snapshot?.state?.history || !Array.isArray(snapshot.state.history)) return [];
    const names = getPlayerNameMap();

    return snapshot.state.history
        .filter((change) => change && (change.kind === 'shot' || change.kind === 'foul'))
        .flatMap((change, idx) => {
            const team = change.team === 'A' ? 'team_a' : 'team_b';
            const playerId = String(change.playerId || '');
            const playerName = names.get(playerId) || 'Player';
            const location = change.pos ? { x: change.pos.xPct, y: change.pos.yPct } : null;

            if (change.kind === 'foul') {
                const committed = {
                    _id: String(change.actionId || `snap_foul_${idx}`),
                    type: 'foul',
                    team,
                    player_id: { _id: playerId, name: playerName },
                    foulRole: 'committed',
                    location,
                    timestamp: change.timestamp || Date.now()
                };

                const secondaryPlayerId = String(change.secondaryPlayerId || '');
                if (!secondaryPlayerId) return [committed];

                const fouledTeam = team === 'team_a' ? 'team_b' : 'team_a';
                const fouledName = names.get(secondaryPlayerId) || 'Player';
                const drawn = {
                    _id: `${committed._id}_drawn`,
                    type: 'foul',
                    team: fouledTeam,
                    player_id: { _id: secondaryPlayerId, name: fouledName },
                    foulRole: 'drawn',
                    location,
                    timestamp: change.timestamp || Date.now()
                };
                return [committed, drawn];
            }

            const isFt = change.shotType === 'ft';
            const points = change.shotType === '4pt' ? 4 : change.shotType === '3pt' ? 3 : change.shotType === '2pt' ? 2 : 1;
            return [{
                _id: String(change.actionId || `snap_shot_${idx}`),
                type: isFt ? 'free_throw' : 'shot',
                team,
                player_id: { _id: playerId, name: playerName },
                made: change.result === 'made',
                points,
                location,
                timestamp: change.timestamp || Date.now()
            }];
        });
}

function getEffectiveEvents() {
    const backendEvents = Array.isArray(gameData?.events) ? gameData.events : [];
    if (backendEvents.length > 0) return backendEvents;
    return buildEventsFromSnapshot(getLiveSnapshotForGame());
}

function rgba(hex, alpha) {
    if (!hex || !hex.startsWith('#')) return `rgba(14, 165, 233, ${alpha})`;
    const norm = hex.length === 4
        ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`
        : hex;
    const r = parseInt(norm.slice(1, 3), 16);
    const g = parseInt(norm.slice(3, 5), 16);
    const b = parseInt(norm.slice(5, 7), 16);
    if ([r, g, b].some(Number.isNaN)) return `rgba(14, 165, 233, ${alpha})`;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function drawShotsOnSvg(svg, shots) {
    if (!svg) return;
    svg.setAttribute('viewBox', '0 0 500 470');
    svg.innerHTML = '';

    const svgNs = 'http://www.w3.org/2000/svg';

    const bg = document.createElementNS(svgNs, 'image');
    bg.setAttribute('href', 'assets/basketballcourt.svg');
    bg.setAttribute('x', '0');
    bg.setAttribute('y', '0');
    bg.setAttribute('width', '500');
    bg.setAttribute('height', '470');
    bg.setAttribute('preserveAspectRatio', 'xMidYMid slice');
    svg.appendChild(bg);

    const g = document.createElementNS(svgNs, 'g');
    if (!shots.length) {
        const t = document.createElementNS(svgNs, 'text');
        t.setAttribute('x', '250');
        t.setAttribute('y', '235');
        t.setAttribute('text-anchor', 'middle');
        t.setAttribute('fill', '#64748b');
        t.setAttribute('font-size', '15');
        t.textContent = 'No shot location data available';
        g.appendChild(t);
        svg.appendChild(g);
        return;
    }

    shots.forEach((shot) => {
        const x = (Number(shot.x || 0) / 100) * 500;
        const y = (Number(shot.y || 0) / 100) * 470;

        if (shot.type === 'foul') {
            if ((shot.foulRole || 'committed') === 'committed') {
                const tri = document.createElementNS(svgNs, 'polygon');
                const size = 24;
                tri.setAttribute('points', `${x},${y - size / 2} ${x - size / 2},${y + size / 2} ${x + size / 2},${y + size / 2}`);
                tri.setAttribute('fill', '#F59E0B');
                tri.setAttribute('stroke', '#92400E');
                tri.setAttribute('stroke-width', '2');
                g.appendChild(tri);
            } else {
                const sq = document.createElementNS(svgNs, 'rect');
                const size = 20;
                sq.setAttribute('x', `${x - size / 2}`);
                sq.setAttribute('y', `${y - size / 2}`);
                sq.setAttribute('width', `${size}`);
                sq.setAttribute('height', `${size}`);
                sq.setAttribute('rx', '3');
                sq.setAttribute('fill', '#F59E0B');
                sq.setAttribute('stroke', '#92400E');
                sq.setAttribute('stroke-width', '2');
                g.appendChild(sq);
            }
            return;
        }

        if (shot.made) {
            const c = document.createElementNS(svgNs, 'circle');
            c.setAttribute('cx', `${x}`);
            c.setAttribute('cy', `${y}`);
            c.setAttribute('r', '8');
            c.setAttribute('fill', rgba(shot.playerColor || '#22C55E', 0.9));
            c.setAttribute('stroke', rgba(shot.playerColor || '#22C55E', 1));
            c.setAttribute('stroke-width', '2');
            g.appendChild(c);
        } else {
            const size = 8;
            const line1 = document.createElementNS(svgNs, 'line');
            line1.setAttribute('x1', `${x - size}`);
            line1.setAttribute('y1', `${y - size}`);
            line1.setAttribute('x2', `${x + size}`);
            line1.setAttribute('y2', `${y + size}`);
            line1.setAttribute('stroke', 'rgba(220, 38, 38, 0.9)');
            line1.setAttribute('stroke-width', '4');
            line1.setAttribute('stroke-linecap', 'round');

            const line2 = document.createElementNS(svgNs, 'line');
            line2.setAttribute('x1', `${x + size}`);
            line2.setAttribute('y1', `${y - size}`);
            line2.setAttribute('x2', `${x - size}`);
            line2.setAttribute('y2', `${y + size}`);
            line2.setAttribute('stroke', 'rgba(220, 38, 38, 0.9)');
            line2.setAttribute('stroke-width', '4');
            line2.setAttribute('stroke-linecap', 'round');

            g.appendChild(line1);
            g.appendChild(line2);
        }
    });

    svg.appendChild(g);
}

function buildReplayLabel(step, idx) {
    const stepNumber = idx + 1;
    const name = step.playerName || 'Player';
    if (step.type === 'foul') {
        if ((step.foulRole || 'committed') === 'committed') {
            return `${stepNumber}. ${name} committed a foul`;
        }
        return `${stepNumber}. ${name} got fouled`;
    }

    const action = step.type === 'free_throw' ? 'free throw' : `${step.points || ''}pt shot`.trim();
    const result = step.made ? 'made' : 'missed';
    return `${stepNumber}. ${name} ${result} a ${action}`;
}

function eventTimestamp(event) {
    if (!event) return Number.MAX_SAFE_INTEGER;
    const raw = event.timestamp || event.createdAt || event.updatedAt || 0;
    const ts = new Date(raw).getTime();
    if (Number.isNaN(ts) || ts <= 0) return Number.MAX_SAFE_INTEGER;
    return ts;
}

function normalizeReplayStep(event, fallbackColor) {
    if (!event?.location || typeof event.location.x !== 'number' || typeof event.location.y !== 'number') return null;
    if (event.type !== 'shot' && event.type !== 'free_throw' && event.type !== 'foul') return null;
    const playerName = String(event.player_id?.name || 'Player');

    if (event.type === 'foul') {
        return {
            x: event.location.x,
            y: event.location.y,
            type: 'foul',
            foulRole: event.foulRole === 'drawn' ? 'drawn' : 'committed',
            playerName,
            sortTs: eventTimestamp(event)
        };
    }

    return {
        x: event.location.x,
        y: event.location.y,
        type: event.type,
        made: !!event.made,
        points: Number(event.points || (event.type === 'free_throw' ? 1 : 2)),
        playerColor: fallbackColor || '#22C55E',
        playerName,
        sortTs: eventTimestamp(event)
    };
}

function buildTeamReplaySteps(teamKey, events, playerColorMap) {
    const steps = events
        .flatMap((event) => {
            if (!event) return [];
            if (event.type === 'foul') {
                if (!event.location || typeof event.location.x !== 'number' || typeof event.location.y !== 'number') return [];
                if (event.team === teamKey) {
                    return [{
                        ...event,
                        foulRole: 'committed'
                    }];
                }
                return [{
                    ...event,
                    foulRole: 'drawn'
                }];
            }
            if (event.team !== teamKey) return [];
            const playerId = getPlayerId(event);
            return [{
                ...event,
                playerColor: playerColorMap.get(playerId) || '#22C55E'
            }];
        })
        .map((event) => normalizeReplayStep(event, event.playerColor))
        .filter(Boolean)
        .sort((a, b) => a.sortTs - b.sortTs);

    return steps.map((step, idx) => ({ ...step, label: buildReplayLabel(step, idx) }));
}

function buildPlayerReplaySteps(playerId, events, color) {
    const steps = events
        .filter((event) => getPlayerId(event) === String(playerId))
        .map((event) => normalizeReplayStep(event, color))
        .filter(Boolean)
        .sort((a, b) => a.sortTs - b.sortTs);

    return steps.map((step, idx) => ({ ...step, label: buildReplayLabel(step, idx) }));
}

function getTeamPlayerIds(teamData) {
    if (!teamData) return [];
    if (Array.isArray(teamData.players)) {
        return teamData.players.map((p) => String(p?._id || p)).filter(Boolean);
    }
    if (Array.isArray(teamData)) {
        return teamData.map((p) => String(p?._id || p)).filter(Boolean);
    }
    return [];
}

function getPlayerColorMap(players) {
    const map = new Map();
    players.forEach((player, idx) => {
        const id = String(player?._id || player?.id || '');
        if (!id) return;
        map.set(id, PLAYER_COLORS[idx % PLAYER_COLORS.length]);
    });
    return map;
}

function getReportPlayers() {
    const backendPlayers = Array.isArray(gameData?.all_player_ids) ? gameData.all_player_ids : [];
    if (backendPlayers.length > 0) return backendPlayers;
    const players = Object.values(getLiveSnapshotForGame()?.gameContext?.players || {}).filter(Boolean);
    const seen = new Set();
    return players.filter((p) => {
        const id = String(p?._id || '');
        if (!id || seen.has(id)) return false;
        seen.add(id);
        return true;
    });
}

function mapShotsForTeam(teamKey, events, playerColorMap) {
    return events
        .filter((event) => !!event && !!event.location && typeof event.location.x === 'number' && typeof event.location.y === 'number')
        .flatMap((event) => {
            if (event.type === 'foul') {
                if (event.team === teamKey) {
                    return [{ x: event.location.x, y: event.location.y, type: 'foul', foulRole: 'committed' }];
                }
                return [{ x: event.location.x, y: event.location.y, type: 'foul', foulRole: 'drawn' }];
            }
            if (event.team !== teamKey) return [];
            const playerId = getPlayerId(event);
            return [{
                x: event.location.x,
                y: event.location.y,
                type: event.type,
                made: !!event.made,
                playerColor: playerColorMap.get(playerId) || '#22C55E'
            }];
        });
}

function mapShotsForPlayer(playerId, events, color) {
    return events
        .filter((event) => {
            if (!event || !event.location || typeof event.location.x !== 'number' || typeof event.location.y !== 'number') return false;
            if (event.type !== 'shot' && event.type !== 'free_throw' && event.type !== 'foul') return false;
            return getPlayerId(event) === String(playerId);
        })
        .map((event) => {
            if (event.type === 'foul') {
                return {
                    x: event.location.x,
                    y: event.location.y,
                    type: 'foul',
                    foulRole: event.foulRole === 'drawn' ? 'drawn' : 'committed'
                };
            }
            return {
                x: event.location.x,
                y: event.location.y,
                type: event.type,
                made: !!event.made,
                playerColor: color
            };
        });
}

function renderTeamView(container, events) {
    const teamAName = gameData?.teams?.team_a?.name || 'Team A';
    const teamBName = gameData?.teams?.team_b?.name || 'Team B';
    const players = getReportPlayers();
    const colorMap = getPlayerColorMap(players);
    const teamAShots = mapShotsForTeam('team_a', events, colorMap);
    const teamBShots = mapShotsForTeam('team_b', events, colorMap);
    const teamASteps = buildTeamReplaySteps('team_a', events, colorMap);
    const teamBSteps = buildTeamReplaySteps('team_b', events, colorMap);

    chartReplayRegistry = new Map();
    chartReplayRegistry.set('team_a', {
        title: `${teamAName} - Team Shot Chart`,
        shots: teamAShots,
        steps: teamASteps
    });
    chartReplayRegistry.set('team_b', {
        title: `${teamBName} - Team Shot Chart`,
        shots: teamBShots,
        steps: teamBSteps
    });

    container.innerHTML = `
        <div class="chart-card" data-chart-id="team_a">
            <h3>${teamAName} - Team Shot Chart</h3>
            <div class="chart-wrapper"><svg id="teamChartA" class="chart-svg" preserveAspectRatio="xMidYMid meet"></svg></div>
        </div>
        <div class="chart-card" data-chart-id="team_b">
            <h3>${teamBName} - Team Shot Chart</h3>
            <div class="chart-wrapper"><svg id="teamChartB" class="chart-svg" preserveAspectRatio="xMidYMid meet"></svg></div>
        </div>
    `;

    drawShotsOnSvg(document.getElementById('teamChartA'), teamAShots);
    drawShotsOnSvg(document.getElementById('teamChartB'), teamBShots);
}

function renderIndividualView(container, events) {
    const players = getReportPlayers();
    const colorMap = getPlayerColorMap(players);

    if (players.length === 0) {
        chartReplayRegistry = new Map();
        container.innerHTML = '<div class="chart-card"><h3>No player data available yet.</h3></div>';
        return;
    }

    chartReplayRegistry = new Map();

    container.innerHTML = players.map((player, index) => {
        const id = String(player?._id || player?.id || index);
        const name = String(player?.name || 'Player');
        return `
            <div class="chart-card" data-chart-id="player_${id}">
                <h3>${name} - Shot Chart</h3>
                <div class="chart-wrapper"><svg id="playerChart_${id}" class="chart-svg" preserveAspectRatio="xMidYMid meet"></svg></div>
                <div class="legend">
                    <span class="legend-item"><span class="dot" style="background:${rgba(colorMap.get(id) || '#22C55E', 0.9)}; border:2px solid ${rgba(colorMap.get(id) || '#22C55E', 1)};"></span>Made</span>
                    <span class="legend-item"><span class="legend-x">X</span>Missed</span>
                    <span class="legend-item">Triangle = Foul Committed</span>
                    <span class="legend-item">Square = Got Fouled</span>
                </div>
            </div>
        `;
    }).join('');

    players.forEach((player, index) => {
        const id = String(player?._id || player?.id || index);
        const color = colorMap.get(id) || '#22C55E';
        const name = String(player?.name || 'Player');
        const svg = document.getElementById(`playerChart_${id}`);
        const shots = mapShotsForPlayer(id, events, color);
        const steps = buildPlayerReplaySteps(id, events, color);
        drawShotsOnSvg(svg, shots);
        chartReplayRegistry.set(`player_${id}`, {
            title: `${name} - Shot Chart`,
            shots,
            steps
        });
    });
}

function stopReplayTimer() {
    if (replayState.timer) {
        clearInterval(replayState.timer);
        replayState.timer = null;
    }
}

function setReplayPlayState(isPlaying) {
    replayState.isPlaying = !!isPlaying;
    const playBtn = document.getElementById('replayPlayBtn');
    if (playBtn) {
        playBtn.textContent = replayState.isPlaying ? 'Pause' : 'Play';
    }
}

function renderReplayList() {
    const list = document.getElementById('replayList');
    if (!list) return;
    const steps = replayState.steps;
    if (!steps.length) {
        list.innerHTML = '<div class="replay-empty">No recorded events for this chart yet.</div>';
        return;
    }

    list.innerHTML = steps.map((step, idx) => {
        const activeClass = idx === replayState.currentIndex ? 'active' : '';
        return `<div class="replay-item ${activeClass}" data-step-index="${idx}">${step.label}</div>`;
    }).join('');

    const active = list.querySelector('.replay-item.active');
    if (active) active.scrollIntoView({ block: 'nearest' });
}

function renderReplayFrame() {
    const svg = document.getElementById('replayChartSvg');
    const label = document.getElementById('replayStepLabel');
    if (!svg || !label) return;

    if (replayState.currentIndex < 0) {
        label.textContent = 'Press Play to start replay';
        drawShotsOnSvg(svg, []);
    } else {
        const upto = replayState.steps.slice(0, replayState.currentIndex + 1);
        drawShotsOnSvg(svg, upto);
        const step = replayState.steps[replayState.currentIndex];
        label.textContent = step?.label || '';
    }

    renderReplayList();
}

function setReplayIndex(nextIndex) {
    const maxIndex = replayState.steps.length - 1;
    if (maxIndex < 0) {
        replayState.currentIndex = -1;
        renderReplayFrame();
        return;
    }
    replayState.currentIndex = Math.max(0, Math.min(nextIndex, maxIndex));
    renderReplayFrame();
}

function replayTick() {
    const maxIndex = replayState.steps.length - 1;
    if (maxIndex < 0) {
        setReplayPlayState(false);
        stopReplayTimer();
        return;
    }

    if (replayState.currentIndex >= maxIndex) {
        setReplayPlayState(false);
        stopReplayTimer();
        return;
    }

    setReplayIndex(replayState.currentIndex + 1);
}

function toggleReplayPlay() {
    if (!replayState.steps.length) return;

    if (replayState.isPlaying) {
        setReplayPlayState(false);
        stopReplayTimer();
        return;
    }

    if (replayState.currentIndex >= replayState.steps.length - 1) {
        setReplayIndex(0);
    }
    setReplayPlayState(true);
    stopReplayTimer();
    replayState.timer = setInterval(replayTick, REPLAY_TICK_MS);
}

function openReplayModal(chartId) {
    const replayData = chartReplayRegistry.get(chartId);
    if (!replayData) return;

    replayState.chartId = chartId;
    replayState.title = replayData.title;
    replayState.steps = Array.isArray(replayData.steps) ? replayData.steps : [];
    replayState.currentIndex = -1;
    setReplayPlayState(false);
    stopReplayTimer();

    const modal = document.getElementById('replayModal');
    const titleEl = document.getElementById('replayTitle');
    if (titleEl) titleEl.textContent = `${replayState.title} - Replay`;
    if (modal) {
        modal.classList.add('open');
        modal.setAttribute('aria-hidden', 'false');
    }

    renderReplayFrame();
}

function closeReplayModal() {
    stopReplayTimer();
    setReplayPlayState(false);
    replayState.chartId = '';
    replayState.steps = [];
    replayState.currentIndex = -1;

    const modal = document.getElementById('replayModal');
    if (modal) {
        modal.classList.remove('open');
        modal.setAttribute('aria-hidden', 'true');
    }
}

function bindChartCardClicks() {
    document.querySelectorAll('.chart-card[data-chart-id]').forEach((card) => {
        card.addEventListener('click', () => {
            const chartId = card.getAttribute('data-chart-id');
            if (!chartId) return;
            openReplayModal(chartId);
        });
    });
}

function setupReplayUi() {
    const modal = document.getElementById('replayModal');
    const closeBtn = document.getElementById('replayCloseBtn');
    const playBtn = document.getElementById('replayPlayBtn');
    const prevBtn = document.getElementById('replayPrevBtn');
    const nextBtn = document.getElementById('replayNextBtn');
    const list = document.getElementById('replayList');

    if (!modal || !closeBtn || !playBtn || !prevBtn || !nextBtn || !list) return;

    closeBtn.addEventListener('click', closeReplayModal);
    playBtn.addEventListener('click', toggleReplayPlay);

    prevBtn.addEventListener('click', () => {
        stopReplayTimer();
        setReplayPlayState(false);
        if (replayState.currentIndex <= 0) {
            setReplayIndex(0);
            return;
        }
        setReplayIndex(replayState.currentIndex - 1);
    });

    nextBtn.addEventListener('click', () => {
        stopReplayTimer();
        setReplayPlayState(false);
        if (replayState.currentIndex < 0) {
            setReplayIndex(0);
            return;
        }
        setReplayIndex(replayState.currentIndex + 1);
    });

    modal.addEventListener('click', (event) => {
        if (event.target === modal) {
            closeReplayModal();
        }
    });

    document.addEventListener('keydown', (event) => {
        const isOpen = modal.classList.contains('open');
        if (!isOpen) return;
        if (event.key === 'Escape') {
            closeReplayModal();
            return;
        }
        if (event.key === 'ArrowRight') {
            stopReplayTimer();
            setReplayPlayState(false);
            if (replayState.currentIndex < 0) {
                setReplayIndex(0);
            } else {
                setReplayIndex(replayState.currentIndex + 1);
            }
            return;
        }
        if (event.key === 'ArrowLeft') {
            stopReplayTimer();
            setReplayPlayState(false);
            if (replayState.currentIndex <= 0) {
                setReplayIndex(0);
            } else {
                setReplayIndex(replayState.currentIndex - 1);
            }
            return;
        }
        if (event.key === ' ') {
            event.preventDefault();
            toggleReplayPlay();
        }
    });

    list.addEventListener('click', (event) => {
        const item = event.target.closest('.replay-item[data-step-index]');
        if (!item) return;
        const nextIndex = Number(item.getAttribute('data-step-index'));
        if (Number.isNaN(nextIndex)) return;
        stopReplayTimer();
        setReplayPlayState(false);
        setReplayIndex(nextIndex);
    });
}

function renderCharts() {
    if (!gameData) return;
    const container = document.getElementById('chartsContainer');
    if (!container) return;

    const events = getEffectiveEvents();
    if (currentView === 'individual') {
        renderIndividualView(container, events);
    } else {
        renderTeamView(container, events);
    }

    bindChartCardClicks();

    const modal = document.getElementById('replayModal');
    if (modal?.classList.contains('open') && replayState.chartId) {
        const refreshed = chartReplayRegistry.get(replayState.chartId);
        if (refreshed) {
            replayState.steps = Array.isArray(refreshed.steps) ? refreshed.steps : [];
            if (replayState.currentIndex >= replayState.steps.length) {
                replayState.currentIndex = replayState.steps.length - 1;
            }
            const titleEl = document.getElementById('replayTitle');
            if (titleEl) titleEl.textContent = `${refreshed.title} - Replay`;
            renderReplayFrame();
        }
    }

    const title = document.getElementById('liveChartTitle');
    const teamAName = gameData?.teams?.team_a?.name || 'Team A';
    const teamBName = gameData?.teams?.team_b?.name || 'Team B';
    if (title) {
        title.textContent = `${teamAName} vs ${teamBName} - Live Shot Charts`;
    }
}

function showError(message) {
    const el = document.getElementById('chartError');
    if (!el) return;
    el.textContent = message;
    el.style.display = message ? 'block' : 'none';
}

async function loadGameData(background = false) {
    try {
        gameData = await apiClient.getGameById(gameId);
        showError('');
        renderCharts();

        if (isLiveStatus(gameData?.status) || isLiveModeFromUrl()) {
            startAutoRefresh();
        } else {
            stopAutoRefresh();
        }
    } catch (err) {
        if (!background) {
            showError(`Failed to load game: ${err.message || 'Unknown error'}`);
        }
    }
}

function stopAutoRefresh() {
    if (backendRefreshTimer) {
        clearInterval(backendRefreshTimer);
        backendRefreshTimer = null;
    }
    if (localRefreshTimer) {
        clearInterval(localRefreshTimer);
        localRefreshTimer = null;
    }
}

function startAutoRefresh() {
    if (!backendRefreshTimer) {
        backendRefreshTimer = setInterval(() => loadGameData(true), 5000);
    }
    if (!localRefreshTimer) {
        localRefreshTimer = setInterval(() => renderCharts(), 1000);
    }
}

function setupNavigation() {
    const signInBtn = document.getElementById('nav-sign-in');
    const signOutBtn = document.getElementById('nav-sign-out');
    const logGameLink = document.getElementById('nav-log-game-link');

    if (apiClient.getToken()) {
        signInBtn.style.display = 'none';
        signOutBtn.style.display = 'block';
        if (logGameLink) logGameLink.style.display = 'inline-block';
    } else {
        signInBtn.style.display = 'block';
        signOutBtn.style.display = 'none';
        if (logGameLink) logGameLink.style.display = 'none';
    }

    signInBtn.addEventListener('click', () => {
        window.location.href = 'index.html';
    });

    signOutBtn.addEventListener('click', () => {
        apiClient.logout();
    });
}

function setupViewToggle() {
    const teamBtn = document.getElementById('teamViewBtn');
    const individualBtn = document.getElementById('individualViewBtn');
    if (!teamBtn || !individualBtn) return;

    teamBtn.addEventListener('click', () => {
        currentView = 'team';
        teamBtn.classList.add('active');
        individualBtn.classList.remove('active');
        renderCharts();
    });

    individualBtn.addEventListener('click', () => {
        currentView = 'individual';
        individualBtn.classList.add('active');
        teamBtn.classList.remove('active');
        renderCharts();
    });
}

function setupSyncListeners() {
    window.addEventListener('storage', (event) => {
        if (event.key === LIVE_GAME_STATE_KEY) {
            renderCharts();
        }
    });

    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) loadGameData(true);
    });

    window.addEventListener('beforeunload', () => {
        closeReplayModal();
        stopAutoRefresh();
    });
}

document.addEventListener('DOMContentLoaded', async () => {
    setupNavigation();
    setupViewToggle();
    setupReplayUi();
    setupSyncListeners();

    gameId = getGameIdFromUrl();
    if (!gameId) {
        showError('No game ID provided');
        return;
    }

    await loadGameData();
});