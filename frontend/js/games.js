/**
 * Games Page JavaScript
 * Handles game listing, filtering, and management
 */

let allGames = [];
let currentEditingId = null;
const LIVE_GAME_STATE_KEY = 'tnc_live_game_state_active_v1';
const DEFAULT_COURT_IMAGE_SRC = 'assets/default-court-image.svg';
const MAX_CUSTOM_COURT_IMAGE_BYTES = 1.5 * 1024 * 1024;
let liveGamesRefreshInterval = null;
let liveStatsRefreshInterval = null;
let pendingGamePayload = null;
let selectedCourtImageSrc = DEFAULT_COURT_IMAGE_SRC;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    loadGames();
    setupEventListeners();
    setupNavigation();
    startLiveGamesRefresh();
    startLiveStatsRefresh();
    setupLiveSyncListeners();
});

function startLiveGamesRefresh() {
    if (liveGamesRefreshInterval) clearInterval(liveGamesRefreshInterval);
    liveGamesRefreshInterval = setInterval(() => {
        loadGames();
    }, 5000);
}

function startLiveStatsRefresh() {
    if (liveStatsRefreshInterval) clearInterval(liveStatsRefreshInterval);
    liveStatsRefreshInterval = setInterval(() => {
        // Re-render from current in-memory games + local snapshot to keep live card stats fresh.
        categorizeAndRenderGames();
    }, 1000);
}

function setupLiveSyncListeners() {
    window.addEventListener('storage', (event) => {
        if (event.key === LIVE_GAME_STATE_KEY) {
            categorizeAndRenderGames();
        }
    });

    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            loadGames();
        }
    });

    window.addEventListener('beforeunload', () => {
        if (liveGamesRefreshInterval) clearInterval(liveGamesRefreshInterval);
        if (liveStatsRefreshInterval) clearInterval(liveStatsRefreshInterval);
    });
}

function computePointsFromStats(stats) {
    if (!stats) return 0;
    return ((stats.twoPM || 0) * 2) + ((stats.threePM || 0) * 3) + ((stats.fourPM || 0) * 4) + (stats.ftM || 0);
}

function isGenericTeamName(name, fallbackLabel) {
    const value = String(name || '').trim().toLowerCase();
    const fallback = String(fallbackLabel || '').trim().toLowerCase();
    if (!value) return true;
    return value === fallback;
}

function extractPlayerNames(players = []) {
    if (!Array.isArray(players)) return [];
    return players
        .map((player) => {
            if (!player) return '';
            if (typeof player === 'string') return '';
            return String(player.name || '').trim();
        })
        .filter(Boolean);
}

function resolveTeamDisplayName(teamData, fallbackLabel) {
    const customName = String(teamData?.name || '').trim();
    if (customName && !isGenericTeamName(customName, fallbackLabel)) {
        return customName;
    }

    const playerNames = extractPlayerNames(teamData?.players || []);
    if (playerNames.length > 0) {
        return playerNames.join(' & ');
    }

    return customName || fallbackLabel;
}

function getLiveSnapshotForGame(gameId) {
    try {
        const raw = localStorage.getItem(LIVE_GAME_STATE_KEY);
        if (!raw) return null;
        const snapshot = JSON.parse(raw);
        const snapshotGameId = String(snapshot?.gameContext?.gameId || '');
        if (!snapshotGameId || snapshotGameId !== String(gameId || '')) return null;
        return snapshot;
    } catch (err) {
        console.warn('Failed to parse live game snapshot for games list.', err);
        return null;
    }
}

function getActiveLiveSnapshot() {
    try {
        const raw = localStorage.getItem(LIVE_GAME_STATE_KEY);
        if (!raw) return null;
        const snapshot = JSON.parse(raw);
        if (!snapshot?.runtime?.isGameRunning) return null;
        if (!snapshot?.gameContext?.gameId) return null;
        return snapshot;
    } catch (err) {
        console.warn('Failed to parse active live snapshot.', err);
        return null;
    }
}

function buildSnapshotOnlyGame(snapshot) {
    if (!snapshot?.gameContext?.gameId) return null;

    const teamAPlayers = Object.values(snapshot.gameContext.players || {}).filter(Boolean).filter((player, index) => index < 2);
    const teamBPlayers = Object.values(snapshot.gameContext.players || {}).filter(Boolean).filter((player, index) => index >= 2);

    return {
        _id: snapshot.gameContext.gameId,
        status: 'live',
        game_type: snapshot.gameContext.ruleMode === 'tag-team-1v1' ? 'tag-team-1v1' : '1v1',
        createdAt: snapshot.updatedAt || Date.now(),
        current_score: {
            team_a: computePointsFromStats(snapshot.state?.A),
            team_b: computePointsFromStats(snapshot.state?.B)
        },
        teams: {
            team_a: {
                name: snapshot.gameContext.customTeamNames?.A || '',
                players: teamAPlayers
            },
            team_b: {
                name: snapshot.gameContext.customTeamNames?.B || '',
                players: teamBPlayers
            }
        }
    };
}

function resolveDisplayedScore(game) {
    if (!game) return { teamA: 0, teamB: 0 };

    const status = game.status || '';
    const isLive = status === 'live' || status === 'in_progress';

    if (!isLive) {
        return {
            teamA: game.final_score?.team_a || 0,
            teamB: game.final_score?.team_b || 0
        };
    }

    if (game.current_score && typeof game.current_score === 'object') {
        return {
            teamA: Number(game.current_score.team_a || 0),
            teamB: Number(game.current_score.team_b || 0)
        };
    }

    const snapshot = getLiveSnapshotForGame(game._id);
    if (snapshot?.state) {
        return {
            teamA: computePointsFromStats(snapshot.state.A),
            teamB: computePointsFromStats(snapshot.state.B)
        };
    }

    return {
        teamA: game.final_score?.team_a || 0,
        teamB: game.final_score?.team_b || 0
    };
}

function setupEventListeners() {
    document.getElementById('createGameBtn').addEventListener('click', openCreateGameModal);
    document.getElementById('gameForm').addEventListener('submit', handleGameFormSubmit);
    document.getElementById('searchInput').addEventListener('input', handleSearch);

    const uploadInput = document.getElementById('courtImageUploadInput');
    const confirmBtn = document.getElementById('confirmCourtImageBtn');
    const cancelBtn = document.getElementById('cancelCourtImageBtn');

    if (uploadInput) {
        uploadInput.addEventListener('change', handleCourtImageUpload);
    }
    if (confirmBtn) {
        confirmBtn.addEventListener('click', confirmCourtImageAndSaveGame);
    }
    if (cancelBtn) {
        cancelBtn.addEventListener('click', closeCourtImageModal);
    }

    // Tab switching
    document.querySelectorAll('.tab-button').forEach(button => {
        button.addEventListener('click', (e) => {
            document.querySelectorAll('.tab-button').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            e.target.classList.add('active');
            document.getElementById(e.target.dataset.tab).classList.add('active');
        });
    });
}

function setupNavigation() {
    const signInBtn = document.getElementById('nav-sign-in');
    const signOutBtn = document.getElementById('nav-sign-out');
    const logGameLink = document.getElementById('nav-log-game-link');

    if (apiClient.getToken()) {
        signInBtn.style.display = 'none';
        signOutBtn.style.display = 'block';
        document.getElementById('createGameBtn').style.display = 'block';
        if (logGameLink) logGameLink.style.display = 'inline-block';
    } else {
        signInBtn.style.display = 'block';
        signOutBtn.style.display = 'none';
        document.getElementById('createGameBtn').style.display = 'none';
        if (logGameLink) logGameLink.style.display = 'none';
    }

    signInBtn.addEventListener('click', () => {
        showLoginModal();
    });

    signOutBtn.addEventListener('click', () => {
        apiClient.logout();
    });
}

function showLoginModal() {
    const modal = document.getElementById('login-modal');
    modal.style.display = 'flex';

    const emailInput = document.getElementById('login-email');
    const passInput = document.getElementById('login-password');
    const submitBtn = document.getElementById('login-submit');
    const cancelBtn = document.getElementById('login-cancel');

    emailInput.value = '';
    passInput.value = '';

    const handleSubmit = async () => {
        const email = emailInput.value.trim();
        const password = passInput.value.trim();

        if (!email || !password) {
            return alert('Please enter both fields.');
        }

        try {
            const data = await apiClient.login(email, password);
            console.log("Logged in:", data.user);
            modal.style.display = 'none';
            location.reload();
        } catch (err) {
            alert("Login failed: " + err.message);
        }
    };

    submitBtn.onclick = handleSubmit;

    const handleKeyPress = (e) => {
        if (e.key === 'Enter') {
            handleSubmit();
        }
    };

    emailInput.onkeypress = handleKeyPress;
    passInput.onkeypress = handleKeyPress;

    cancelBtn.onclick = () => {
        modal.style.display = 'none';
    };

    modal.onclick = (e) => {
        if (e.target === modal) modal.style.display = 'none';
    };
}

async function loadGames() {
    try {
        allGames = await apiClient.getAllGames();
        categorizeAndRenderGames();
    } catch (error) {
        console.error('Failed to load games:', error);
        console.error('Error details:', error.message);
        showError('Failed to load games: ' + (error.message || 'Unknown error'));
    }
}

function categorizeAndRenderGames() {
    const live = [];
    const scheduled = [];
    const completed = [];
    const activeSnapshot = getActiveLiveSnapshot();
    const activeSnapshotGameId = String(activeSnapshot?.gameContext?.gameId || '');
    let snapshotMatched = false;

    allGames.forEach(game => {
        const hasActiveSnapshot = activeSnapshotGameId && String(game._id || '') === activeSnapshotGameId;

        if (game.status === 'finished') {
            completed.push(game);
        } else if (game.status === 'live' || game.status === 'in_progress' || hasActiveSnapshot) {
            if (hasActiveSnapshot) snapshotMatched = true;
            live.push(hasActiveSnapshot ? { ...game, status: 'live' } : game);
        } else {
            scheduled.push(game);
        }
    });

    if (activeSnapshot && !snapshotMatched) {
        const snapshotOnlyGame = buildSnapshotOnlyGame(activeSnapshot);
        if (snapshotOnlyGame) {
            live.unshift(snapshotOnlyGame);
        }
    }

    renderGameSection(live, 'liveGamesContainer', 'liveEmptyState');
    renderGameSection(scheduled, 'scheduledGamesContainer', 'scheduledEmptyState');
    renderGameSection(completed, 'completedGamesContainer', 'completedEmptyState');
}

function renderGameSection(games, containerId, emptyStateId) {
    const container = document.getElementById(containerId);
    const emptyState = document.getElementById(emptyStateId);

    if (games.length === 0) {
        container.innerHTML = '';
        emptyState.style.display = 'block';
        return;
    }

    emptyState.style.display = 'none';
    container.innerHTML = games.map(game => createGameCard(game)).join('');
}

function createGameCard(game) {
    const status = game.status || 'scheduled';
    const isLive = status === 'live' || status === 'in_progress';
    const statusClass = status === 'finished' ? 'status-completed' : status === 'live' || status === 'in_progress' ? 'status-live' : 'status-scheduled';
    const statusText = status === 'finished' ? 'Finished' : status === 'live' || status === 'in_progress' ? 'Live' : 'Scheduled';

    const gameDate = new Date(game.createdAt);
    const dateStr = gameDate.toLocaleDateString() + ' ' + gameDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});

    const resolvedScore = resolveDisplayedScore(game);
    const teamAScore = resolvedScore.teamA;
    const teamBScore = resolvedScore.teamB;
    const teamAName = resolveTeamDisplayName(game.teams?.team_a, 'Team A');
    const teamBName = resolveTeamDisplayName(game.teams?.team_b, 'Team B');
    const teamAPlayers = game.teams?.team_a?.players?.length || 0;
    const teamBPlayers = game.teams?.team_b?.players?.length || 0;

    // Determine winner display
    let winnerDisplay = 'Draw';
    if (game.winner === 'team_a') {
        winnerDisplay = teamAName;
    } else if (game.winner === 'team_b') {
        winnerDisplay = teamBName;
    }

    return `
        <div class="game-card ${isLive ? 'live-card-clickable' : ''}" ${isLive ? `onclick="openLiveShotCharts('${game._id}')"` : ''}>
            <div class="game-status ${statusClass}">${statusText}</div>
            <div class="game-header">
                <div class="game-date">${dateStr}</div>
                <div class="game-type" style="font-size: 0.9rem; color: var(--text-muted);">${game.game_type || 'Game'}</div>
            </div>
            <div class="game-teams">
                <div class="team">
                    <div class="team-name">${teamAName}</div>
                    <div class="team-score">${teamAScore}</div>
                    <div class="team-players">${teamAPlayers} players</div>
                </div>
                <div class="vs-divider">VS</div>
                <div class="team">
                    <div class="team-name">${teamBName}</div>
                    <div class="team-score">${teamBScore}</div>
                    <div class="team-players">${teamBPlayers} players</div>
                </div>
            </div>
            ${game.final_score ? `
                <div class="game-stats">
                    <div class="stat-item">
                        <div class="stat-label">Winner</div>
                        <div class="stat-value">${winnerDisplay}</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-label">Diff</div>
                        <div class="stat-value">${Math.abs(teamAScore - teamBScore)}</div>
                    </div>
                </div>
            ` : ''}
            ${apiClient.getToken() ? `
                <div class="game-actions">
                        ${status === 'finished'
                        ? `<button class="btn btn-secondary" onclick="event.stopPropagation(); viewGameDetails('${game._id}')">View</button>`
                        : status === 'live' || status === 'in_progress'
                            ? `<button class="btn btn-primary" onclick="event.stopPropagation(); viewGameDetails('${game._id}')">Resume Game</button><button class="btn btn-secondary" onclick="event.stopPropagation(); viewLiveReport('${game._id}')">Live Report</button><button class="btn btn-secondary" onclick="event.stopPropagation(); openLiveShotCharts('${game._id}')">Shot Charts</button>`
                            : `<button class="btn btn-primary" onclick="event.stopPropagation(); viewGameDetails('${game._id}')">Start Game</button>`
                    }
                    ${game.status !== 'finished' ? `<button class="btn btn-danger" onclick="event.stopPropagation(); deleteGame('${game._id}')">Delete</button>` : ''}
                </div>
            ` : ''}
        </div>
    `;
}

function viewLiveReport(id) {
    window.location.href = `game-report.html?id=${id}&live=1`;
}

function openLiveShotCharts(id) {
    window.location.href = `live-shot-chart.html?id=${id}&live=1`;
}

function openCreateGameModal() {
    currentEditingId = null;
    pendingGamePayload = null;
    selectedCourtImageSrc = DEFAULT_COURT_IMAGE_SRC;
    document.getElementById('modalTitle').textContent = 'Schedule New Game';
    document.getElementById('gameForm').reset();
    document.getElementById('gameModal').classList.add('active');
}

function closeGameModal() {
    document.getElementById('gameModal').classList.remove('active');
    currentEditingId = null;
}

function closeCourtImageModal() {
    document.getElementById('courtImageModal').classList.remove('active');
    const uploadInput = document.getElementById('courtImageUploadInput');
    if (uploadInput) uploadInput.value = '';
    pendingGamePayload = null;
}

function getReusableCourtImages() {
    const unique = new Set();
    const reusable = [];

    // Add default court image
    reusable.push(DEFAULT_COURT_IMAGE_SRC);
    unique.add(DEFAULT_COURT_IMAGE_SRC);

    // Load images from existing games
    allGames.forEach((game) => {
        const value = typeof game?.custom_court_image === 'string' ? game.custom_court_image.trim() : '';
        if (!value || !value.startsWith('data:image/')) return;
        if (unique.has(value)) return;
        unique.add(value);
        reusable.push(value);
    });

    // Load previously uploaded images from localStorage (from game logger)
    try {
        const key = 'tnc_custom_court_images_v1';
        const stored = localStorage.getItem(key);
        if (stored) {
            const images = JSON.parse(stored);
            if (Array.isArray(images)) {
                images.forEach(img => {
                    if (typeof img === 'string' && img.startsWith('data:image/') && !unique.has(img)) {
                        unique.add(img);
                        reusable.push(img);
                    }
                });
            }
        }
    } catch (err) {
        console.error('Failed to load saved court images from storage:', err);
    }

    return reusable;
}

function renderCourtImageOptions() {
    const container = document.getElementById('courtImageOptions');
    if (!container) return;

    const reusableImages = getReusableCourtImages();
    const options = [DEFAULT_COURT_IMAGE_SRC, ...reusableImages];

    container.innerHTML = options.map((src, idx) => {
        const isDefault = idx === 0;
        const selectedClass = src === selectedCourtImageSrc ? ' selected' : '';
        const label = isDefault ? 'Default Court' : `Saved Court ${idx}`;
        return `
            <button type="button" class="court-image-option${selectedClass}" data-court-src="${encodeURIComponent(src)}" title="${label}">
                <img src="${src}" alt="${label}">
                <div class="label">${label}</div>
            </button>
        `;
    }).join('');

    container.querySelectorAll('.court-image-option').forEach((btn) => {
        btn.addEventListener('click', () => {
            const encoded = btn.getAttribute('data-court-src') || '';
            selectedCourtImageSrc = decodeURIComponent(encoded);
            renderCourtImageOptions();
        });
    });
}

function openCourtImageModal(gamePayload) {
    pendingGamePayload = gamePayload;
    selectedCourtImageSrc = DEFAULT_COURT_IMAGE_SRC;
    renderCourtImageOptions();
    document.getElementById('courtImageModal').classList.add('active');
}

function handleCourtImageUpload(event) {
    const file = event.target?.files?.[0];
    if (!file) return;

    if (!String(file.type || '').startsWith('image/')) {
        showError('Please upload a valid image file.');
        event.target.value = '';
        return;
    }

    if (file.size > MAX_CUSTOM_COURT_IMAGE_BYTES) {
        const maxMb = (MAX_CUSTOM_COURT_IMAGE_BYTES / (1024 * 1024)).toFixed(1);
        showError(`Image too large. Please use a file under ${maxMb}MB.`);
        event.target.value = '';
        return;
    }

    const reader = new FileReader();
    reader.onload = () => {
        const result = typeof reader.result === 'string' ? reader.result : '';
        if (!result.startsWith('data:image/')) {
            showError('Failed to read image. Please try another file.');
            event.target.value = '';
            return;
        }
        selectedCourtImageSrc = result;
        renderCourtImageOptions();
        event.target.value = '';
    };
    reader.readAsDataURL(file);
}

async function confirmCourtImageAndSaveGame() {
    if (!pendingGamePayload) {
        closeCourtImageModal();
        return;
    }

    const payload = { ...pendingGamePayload };
    if (selectedCourtImageSrc && selectedCourtImageSrc.startsWith('data:image/')) {
        payload.custom_court_image = selectedCourtImageSrc;
    } else {
        payload.custom_court_image = null;
    }

    try {
        if (currentEditingId) {
            await apiClient.updateGame(currentEditingId, payload);
            showSuccess('Game updated successfully');
        } else {
            await apiClient.createGame(payload);
            showSuccess('Game scheduled successfully');
        }
        closeCourtImageModal();
        closeGameModal();
        loadGames();
    } catch (error) {
        showError(error.message || 'Failed to save game');
    }
}

async function handleGameFormSubmit(e) {
    e.preventDefault();

    const gameData = {
        game_type: document.getElementById('gameType').value,
        teams: {
            team_a: {
                name: document.getElementById('teamAName').value || 'Team A'
            },
            team_b: {
                name: document.getElementById('teamBName').value || 'Team B'
            }
        },
        location: document.getElementById('gameLocation').value,
        notes: document.getElementById('gameNotes').value
    };

    openCourtImageModal(gameData);
}

async function deleteGame(id) {
    if (!confirm('Are you sure you want to delete this game?')) return;

    try {
        await apiClient.deleteGame(id);
        showSuccess('Game deleted successfully');
        loadGames();
    } catch (error) {
        showError(error.message || 'Failed to delete game');
    }
}

function viewGameDetails(id) {
    // Find the game to check its status
    const game = allGames.find(g => g._id === id);

    if (game && game.status === 'finished') {
        // Redirect to game report for completed games
        window.location.href = `game-report.html?id=${id}`;
    } else {
        // Redirect to game logging for live/scheduled games
        window.location.href = `game.html?id=${id}`;
    }
}

function handleSearch(e) {
    // Search functionality can be expanded
    console.log('Search:', e.target.value);
}

function showSuccess(message) {
    const alert = document.getElementById('successAlert');
    alert.textContent = message;
    alert.classList.add('active');
    setTimeout(() => alert.classList.remove('active'), 3000);
}

function showError(message) {
    const alert = document.getElementById('errorAlert');
    alert.textContent = message;
    alert.classList.add('active');
    setTimeout(() => alert.classList.remove('active'), 3000);
}

// Close modal when clicking outside
document.getElementById('gameModal').addEventListener('click', (e) => {
    if (e.target === document.getElementById('gameModal')) {
        closeGameModal();
    }
});

document.getElementById('courtImageModal').addEventListener('click', (e) => {
    if (e.target === document.getElementById('courtImageModal')) {
        closeCourtImageModal();
    }
});
