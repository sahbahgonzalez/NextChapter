/**
 * Game Report Page JavaScript
 * Handles game report display and PDF generation
 */

let gameId = null;
let gameData = null;

const PLAYER_CHART_COLORS = [
    '#1D4ED8',
    '#059669',
    '#D97706',
    '#7C3AED',
    '#DB2777',
    '#0891B2',
    '#9333EA',
    '#14B8A6'
];

function normalizeTeamPlayerIds(teamData) {
    if (!teamData) return [];
    if (Array.isArray(teamData)) {
        return teamData.map((p) => String(p?._id || p)).filter(Boolean);
    }
    if (Array.isArray(teamData.players)) {
        return teamData.players.map((p) => String(p?._id || p)).filter(Boolean);
    }
    return [];
}

function getRgba(hex, alpha) {
    if (!hex || typeof hex !== 'string' || !hex.startsWith('#') || (hex.length !== 7 && hex.length !== 4)) {
        return `rgba(56, 161, 105, ${alpha})`;
    }

    let normalized = hex;
    if (hex.length === 4) {
        normalized = `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
    }

    const r = parseInt(normalized.slice(1, 3), 16);
    const g = parseInt(normalized.slice(3, 5), 16);
    const b = parseInt(normalized.slice(5, 7), 16);

    if ([r, g, b].some(Number.isNaN)) {
        return `rgba(56, 161, 105, ${alpha})`;
    }

    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function getPlayerChartColors(playerColor) {
    return {
        madeFill: getRgba(playerColor, 0.85),
        madeStroke: getRgba(playerColor, 1),
        missFill: 'rgba(229, 62, 62, 0.2)',
        missStroke: 'rgba(229, 62, 62, 0.7)',
        missXStroke: 'rgba(229, 62, 62, 0.95)'
    };
}

function getEventPlayerId(event) {
    if (!event) return '';
    return event.player_id?._id ? String(event.player_id._id) : String(event.player_id || '');
}

function shouldAutoDownloadFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const value = (params.get('autodownload') || '').toLowerCase();
    return value === '1' || value === 'true' || value === 'yes';
}

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    setupNavigation();
    gameId = getGameIdFromUrl();

    if (!gameId) {
        showError('No game ID provided');
        return;
    }

    await loadGameReport();
});

function getGameIdFromUrl() {
    const params = new URLSearchParams(window.location.search);
    return params.get('id');
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
        showLoginModal();
    });

    signOutBtn.addEventListener('click', () => {
        localStorage.removeItem('authToken');
        localStorage.removeItem('user');
        window.location.href = 'index.html';
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

async function loadGameReport() {
    try {
        gameData = await apiClient.getGameById(gameId);

        if (!gameData || gameData.status !== 'finished') {
            showError('Game is not completed or not found');
            return;
        }

        renderReport();
    } catch (error) {
        showError('Failed to load game: ' + (error.message || 'Unknown error'));
    }
}

function renderReport() {
    document.getElementById('loadingContainer').style.display = 'none';
    document.getElementById('reportContent').style.display = 'block';

    // Set game info
    document.getElementById('gameType').textContent = gameData.game_type || '1v1';
    document.getElementById('gameDate').textContent = formatDate(gameData.createdAt);

    // Set scores
    const teamAScore = gameData.final_score?.team_a || 0;
    const teamBScore = gameData.final_score?.team_b || 0;

    document.getElementById('teamAScore').textContent = teamAScore;
    document.getElementById('teamBScore').textContent = teamBScore;

    // Set team labels
    document.getElementById('teamALabel').textContent = gameData.teams?.team_a?.name || 'Team A';
    document.getElementById('teamBLabel').textContent = gameData.teams?.team_b?.name || 'Team B';

    // Set winner
    const winnerLabel = gameData.teams?.[gameData.winner]?.name || 'Team Draw';
    document.getElementById('winnerBadge').textContent = `${winnerLabel} Wins`;

    // Set generated date
    const now = new Date();
    document.getElementById('generatedDate').textContent = `Generated on ${now.toLocaleDateString()} at ${now.toLocaleTimeString()}`;

    // Render player reports
    renderPlayerReports();

    if (shouldAutoDownloadFromUrl()) {
        // Let the browser finish layout before html2pdf snapshots the DOM.
        setTimeout(() => {
            generatePDF(true);
        }, 300);
    }
}

function renderPlayerReports() {
    const container = document.getElementById('playerReportsContainer');
    container.innerHTML = '';

    const allPlayers = gameData.all_player_ids || [];
    const teamAPlayerIds = normalizeTeamPlayerIds(gameData.teams?.team_a);
    const teamBPlayerIds = normalizeTeamPlayerIds(gameData.teams?.team_b);
    const teamMembership = new Map();
    teamAPlayerIds.forEach((id) => teamMembership.set(id, 'team_a'));
    teamBPlayerIds.forEach((id) => teamMembership.set(id, 'team_b'));
    const playerColorMap = new Map();
    const playerNameMap = new Map();

    allPlayers.forEach((player, index) => {
        const playerId = String(player?._id || player?.id || index);
        playerColorMap.set(playerId, PLAYER_CHART_COLORS[index % PLAYER_CHART_COLORS.length]);
        playerNameMap.set(playerId, player?.name || 'Player');
    });

    const shouldShowTeamCombinedCharts = teamAPlayerIds.length > 1 || teamBPlayerIds.length > 1;
    if (shouldShowTeamCombinedCharts) {
        const buildTeamLegend = (playerIds) => {
            return playerIds.map((id) => {
                const color = playerColorMap.get(String(id)) || '#6B7280';
                const name = playerNameMap.get(String(id)) || 'Player';
                return `<span style="display:inline-flex; align-items:center; gap:6px;"><span style="display:inline-block; width:14px; height:14px; border-radius:50%; background:${getRgba(color, 0.9)}; border:2px solid ${getRgba(color, 1)};"></span><span style="font-weight:600; color:#374151;">${name}</span></span>`;
            }).join('');
        };

        const teamAName = gameData.teams?.team_a?.name || 'Team A';
        const teamBName = gameData.teams?.team_b?.name || 'Team B';

        const combinedChartsHtml = `
            <div class="player-report-page" style="page-break-after: always;">
                <div class="player-header">
                    <h2>Team Combined Shot Charts</h2>
                    <div class="player-stats-summary" style="grid-template-columns: 1fr;">
                        <div class="player-stat-box">Each shot keeps the shooter's unique color</div>
                    </div>
                </div>

                <div class="shot-chart-section">
                    <h3>${teamAName} - Team Shot Chart</h3>
                    <div style="margin-bottom: 12px; display:flex; gap:14px; flex-wrap:wrap; justify-content:center;">${buildTeamLegend(teamAPlayerIds)}</div>
                    <div class="shot-chart-container">
                        <div class="shot-chart-wrapper">
                            <svg class="shot-overlay" id="overlay-team_a" preserveAspectRatio="xMidYMid meet"></svg>
                        </div>
                    </div>
                </div>

                <div class="shot-chart-section" style="margin-top: 26px;">
                    <h3>${teamBName} - Team Shot Chart</h3>
                    <div style="margin-bottom: 12px; display:flex; gap:14px; flex-wrap:wrap; justify-content:center;">${buildTeamLegend(teamBPlayerIds)}</div>
                    <div class="shot-chart-container">
                        <div class="shot-chart-wrapper">
                            <svg class="shot-overlay" id="overlay-team_b" preserveAspectRatio="xMidYMid meet"></svg>
                        </div>
                    </div>
                </div>
            </div>
        `;

        container.innerHTML += combinedChartsHtml;
        drawShotsOnSVG('overlay-team_a', getTeamShots('team_a', playerColorMap));
        drawShotsOnSVG('overlay-team_b', getTeamShots('team_b', playerColorMap));
    }

    allPlayers.forEach((player, index) => {
        const playerId = String(player?._id || player?.id || index);
        const playerColor = playerColorMap.get(playerId) || PLAYER_CHART_COLORS[index % PLAYER_CHART_COLORS.length];
        const playerTeam = teamMembership.get(playerId);
        const playerTeamCount = playerTeam === 'team_a'
            ? teamAPlayerIds.length
            : playerTeam === 'team_b'
                ? teamBPlayerIds.length
                : 1;
        const chartLabel = playerTeamCount > 1
            ? '<div style="margin-bottom: 10px; color: #4B5563; font-size: 0.95rem; font-weight: 600;">Individual player shot chart</div>'
            : '';

        // Handle both Map and plain object formats for game_stats_summary
        let stats = {};
        if (gameData.game_stats_summary) {
            if (typeof gameData.game_stats_summary.get === 'function') {
                // It's a Map
                stats = gameData.game_stats_summary.get(player._id) || {};
            } else {
                // It's a plain object
                stats = gameData.game_stats_summary[player._id] || {};
            }
        }

        const reportHtml = `
            <div class="player-report-page" style="page-break-after: ${index < allPlayers.length - 1 ? 'always' : 'avoid'};">
                <div class="player-header">
                    <h2>${player.name || 'Unknown Player'}</h2>
                    <div class="player-stats-summary">
                        <div class="player-stat-box">
                            <div class="player-stat-label">Points</div>
                            <div class="player-stat-value">${stats.pts || 0}</div>
                        </div>
                        <div class="player-stat-box">
                            <div class="player-stat-label">Rebounds</div>
                            <div class="player-stat-value">${(stats.reb || 0) + (stats.oreb || 0) + (stats.dreb || 0)}</div>
                        </div>
                        <div class="player-stat-box">
                            <div class="player-stat-label">Assists</div>
                            <div class="player-stat-value">${stats.ast || 0}</div>
                        </div>
                        <div class="player-stat-box">
                            <div class="player-stat-label">FG%</div>
                            <div class="player-stat-value">${calculateFGPercentage(stats.fgm, stats.fga)}</div>
                        </div>
                    </div>
                </div>

                <div class="stats-section">
                    <h3>Full Stats</h3>
                    <table>
                        <thead>
                            <tr>
                                <th>Statistic</th>
                                <th>Value</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td class="player-name">Points</td>
                                <td class="stat-number">${stats.pts || 0}</td>
                            </tr>
                            <tr>
                                <td class="player-name">Rebounds</td>
                                <td class="stat-number">${(stats.reb || 0) + (stats.oreb || 0) + (stats.dreb || 0)}</td>
                            </tr>
                            <tr>
                                <td class="player-name">Offensive Rebounds</td>
                                <td class="stat-number">${stats.oreb || 0}</td>
                            </tr>
                            <tr>
                                <td class="player-name">Defensive Rebounds</td>
                                <td class="stat-number">${stats.dreb || 0}</td>
                            </tr>
                            <tr>
                                <td class="player-name">Assists</td>
                                <td class="stat-number">${stats.ast || 0}</td>
                            </tr>
                            <tr>
                                <td class="player-name">Steals</td>
                                <td class="stat-number">${stats.stl || 0}</td>
                            </tr>
                            <tr>
                                <td class="player-name">Blocks</td>
                                <td class="stat-number">${stats.blk || 0}</td>
                            </tr>
                            <tr>
                                <td class="player-name">Turnovers</td>
                                <td class="stat-number">${stats.tov || 0}</td>
                            </tr>
                            <tr>
                                <td class="player-name">Fouls</td>
                                <td class="stat-number">${stats.pf || 0}</td>
                            </tr>
                            <tr>
                                <td class="player-name">Field Goals Made</td>
                                <td class="stat-number">${stats.fgm || 0}/${stats.fga || 0}</td>
                            </tr>
                            <tr>
                                <td class="player-name">3-Pointers Made</td>
                                <td class="stat-number">${stats['3pm'] || 0}/${stats['3pa'] || 0}</td>
                            </tr>
                            <tr>
                                <td class="player-name">Free Throws Made</td>
                                <td class="stat-number">${stats.ftm || 0}/${stats.fta || 0}</td>
                            </tr>
                            <tr>
                                <td class="player-name">Plus/Minus</td>
                                <td class="stat-number">${stats.plus_minus >= 0 ? '+' : ''}${stats.plus_minus || 0}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                <div class="shot-chart-section">
                    <h3>Shot Chart</h3>
                    ${chartLabel}
                    <div class="shot-chart-container">
                        <div class="shot-chart-wrapper">
                            <svg class="shot-overlay" id="overlay-${player._id}" preserveAspectRatio="xMidYMid meet"></svg>
                        </div>
                    </div>
                    <div style="margin-top: 15px; font-size: 0.9rem; color: #6B7280; display: flex; justify-content: center; gap: 20px; flex-wrap: wrap;">
                        <span><span style="display: inline-block; width: 20px; height: 20px; background: ${getRgba(playerColor, 0.85)}; border-radius: 50%; vertical-align: middle; margin-right: 5px; border: 2px solid ${getRgba(playerColor, 1)};"></span> <span style="color: ${playerColor}; font-weight: 600;">Made (${player.name || 'Player'})</span></span>
                        <span><span style="display: inline-block; width: 20px; height: 20px; background: rgba(229, 62, 62, 0.2); border-radius: 50%; vertical-align: middle; margin-right: 5px; border: 2px solid rgba(229, 62, 62, 0.7);"></span> <span style="color: #E53E3E; font-weight: 600;">Missed (${player.name || 'Player'})</span></span>
                    </div>
                </div>
            </div>
        `;

        container.innerHTML += reportHtml;

        // Draw shot chart for this player
        drawShotsOnSVG(`overlay-${player._id}`, getPlayerShots(player._id), getPlayerChartColors(playerColor));
    });
}

function getPlayerShots(playerId) {
    const shots = [];
    const events = gameData.events || [];

    events.forEach(event => {
        // Compare player IDs as strings to handle both ObjectId and string formats
        const eventPlayerId = getEventPlayerId(event);

        // Include both shots and free throws
        if ((event.type === 'shot' || event.type === 'free_throw') && eventPlayerId === String(playerId)) {
            // Only include shots that have valid location data
            if (event.location && typeof event.location.x === 'number' && typeof event.location.y === 'number') {
                shots.push({
                    x: event.location.x,
                    y: event.location.y,
                    made: event.made || false,
                    points: event.points || (event.type === 'free_throw' ? 1 : 2),
                    type: event.type
                });
            }
        }
    });

    return shots;
}

function getTeamShots(teamKey, playerColorMap) {
    const shots = [];
    const events = gameData.events || [];

    events.forEach((event) => {
        if ((event.type === 'shot' || event.type === 'free_throw') &&
            event.team === teamKey &&
            event.location && typeof event.location.x === 'number' && typeof event.location.y === 'number') {
            const eventPlayerId = getEventPlayerId(event);
            const playerColor = playerColorMap.get(eventPlayerId) || '#6B7280';

            shots.push({
                x: event.location.x,
                y: event.location.y,
                made: event.made || false,
                points: event.points || (event.type === 'free_throw' ? 1 : 2),
                type: event.type,
                colorSet: getPlayerChartColors(playerColor)
            });
        }
    });

    return shots;
}

function drawShotsOnSVG(overlayId, shots, colorSet = getPlayerChartColors('#38A169')) {
    const overlay = document.getElementById(overlayId);
    if (!overlay) return;

    // Set SVG viewBox and dimensions
    overlay.setAttribute('viewBox', '0 0 500 470');
    overlay.setAttribute('width', '500');
    overlay.setAttribute('height', '470');

    // Clear existing content
    overlay.innerHTML = '';

    // Draw court background using the court image
    const courtImage = document.createElementNS('http://www.w3.org/2000/svg', 'image');
    courtImage.setAttribute('href', 'assets/basketballcourt.svg');
    courtImage.setAttribute('x', '0');
    courtImage.setAttribute('y', '0');
    courtImage.setAttribute('width', '500');
    courtImage.setAttribute('height', '470');
    courtImage.setAttribute('preserveAspectRatio', 'xMidYMid slice');
    overlay.appendChild(courtImage);

    // Create a group for shots
    const shotsGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    shotsGroup.setAttribute('id', 'shots-group');

    // Show message if no shots with location data
    if (shots.length === 0) {
        const noDataText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        noDataText.setAttribute('x', '250');
        noDataText.setAttribute('y', '235');
        noDataText.setAttribute('text-anchor', 'middle');
        noDataText.setAttribute('fill', '#666');
        noDataText.setAttribute('font-size', '16');
        noDataText.textContent = 'No shot location data available';
        shotsGroup.appendChild(noDataText);
    }

    shots.forEach(shot => {
        const shotColors = shot.colorSet || colorSet;
        const svgX = (shot.x / 100) * 500;
        const svgY = (shot.y / 100) * 470;

        if (shot.made) {
            // Made shot - player color circle with point value
            const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            circle.setAttribute('cx', svgX);
            circle.setAttribute('cy', svgY);
            circle.setAttribute('r', '14');
            circle.setAttribute('fill', shotColors.madeFill);
            circle.setAttribute('stroke', shotColors.madeStroke);
            circle.setAttribute('stroke-width', '2');
            shotsGroup.appendChild(circle);

            // Add point value text inside circle
            const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            text.setAttribute('x', svgX);
            text.setAttribute('y', svgY + 5);
            text.setAttribute('text-anchor', 'middle');
            text.setAttribute('fill', 'white');
            text.setAttribute('font-size', '12');
            text.setAttribute('font-weight', 'bold');
            text.textContent = shot.points;
            shotsGroup.appendChild(text);
        } else {
            // Missed shot - player color X with point indicator
            const size = 10;

            // Draw background circle for context
            const bgCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            bgCircle.setAttribute('cx', svgX);
            bgCircle.setAttribute('cy', svgY);
            bgCircle.setAttribute('r', '14');
            bgCircle.setAttribute('fill', shotColors.missFill);
            bgCircle.setAttribute('stroke', shotColors.missStroke);
            bgCircle.setAttribute('stroke-width', '2');
            shotsGroup.appendChild(bgCircle);

            // Draw X
            const line1 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            line1.setAttribute('x1', svgX - size);
            line1.setAttribute('y1', svgY - size);
            line1.setAttribute('x2', svgX + size);
            line1.setAttribute('y2', svgY + size);
            line1.setAttribute('stroke', shotColors.missXStroke);
            line1.setAttribute('stroke-width', '3');
            line1.setAttribute('stroke-linecap', 'round');

            const line2 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            line2.setAttribute('x1', svgX + size);
            line2.setAttribute('y1', svgY - size);
            line2.setAttribute('x2', svgX - size);
            line2.setAttribute('y2', svgY + size);
            line2.setAttribute('stroke', shotColors.missXStroke);
            line2.setAttribute('stroke-width', '3');
            line2.setAttribute('stroke-linecap', 'round');

            shotsGroup.appendChild(line1);
            shotsGroup.appendChild(line2);
        }
    });

    overlay.appendChild(shotsGroup);
}

function calculateFGPercentage(made, attempted) {
    if (!attempted || attempted === 0) return '0%';
    return Math.round((made / attempted) * 100) + '%';
}

function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
}

function showError(message) {
    document.getElementById('loadingContainer').style.display = 'none';
    const errorContainer = document.getElementById('errorContainer');
    errorContainer.innerHTML = `<div class="error">${message}</div>`;
    errorContainer.style.display = 'block';
}

function generatePDF(autoMode = false) {
    const element = document.querySelector('.report-container');
    if (!element) {
        showError('Could not find report content to export.');
        return;
    }

    const opt = {
        margin: 10,
        filename: `game-report-${gameId}.pdf`,
        image: { type: 'png', quality: 0.98 },
        html2canvas: {
            scale: 2,
            useCORS: true,
            logging: false
        },
        pagebreak: { mode: ['css', 'legacy'] },
        jsPDF: { orientation: 'portrait', unit: 'mm', format: 'a4' }
    };

    html2pdf()
        .set(opt)
        .from(element)
        .save()
        .then(() => {
            if (autoMode) {
                // In auto-download flow, close the helper tab after save is triggered.
                setTimeout(() => window.close(), 250);
            }
        })
        .catch((error) => {
            console.error('Failed to generate PDF:', error);
            showError('Failed to generate PDF. Please try again.');
        });
}
