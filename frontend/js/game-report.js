/**
 * Game Report Page JavaScript
 * Handles game report display and PDF generation
 */

let gameId = null;
let gameData = null;

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

    if (apiClient.getToken()) {
        signInBtn.style.display = 'none';
        signOutBtn.style.display = 'block';
    } else {
        signInBtn.style.display = 'block';
        signOutBtn.style.display = 'none';
    }

    signInBtn.addEventListener('click', () => {
        window.location.href = '/login.html';
    });

    signOutBtn.addEventListener('click', () => {
        apiClient.logout();
    });
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
}

function renderPlayerReports() {
    const container = document.getElementById('playerReportsContainer');
    container.innerHTML = '';

    const allPlayers = gameData.all_player_ids || [];

    allPlayers.forEach((player, index) => {
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

        const playerTeam = gameData.teams.team_a.some(p => String(p._id || p) === String(player._id)) ? 'team_a' : 'team_b';

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
                    <div class="shot-chart-container">
                        <div class="shot-chart-wrapper">
                            <svg class="shot-overlay" id="overlay-${player._id}" preserveAspectRatio="xMidYMid meet"></svg>
                        </div>
                    </div>
                    <div style="margin-top: 15px; font-size: 0.9rem; color: #6B7280;">
                        <span style="color: #38A169; font-weight: 600;">Made Shots</span> |
                        <span style="color: #E53E3E; font-weight: 600;">Missed Shots</span>
                    </div>
                </div>
            </div>
        `;

        container.innerHTML += reportHtml;

        // Draw shot chart for this player
        drawShotsOnSVG(`overlay-${player._id}`, getPlayerShots(player._id));
    });
}

function getPlayerShots(playerId) {
    const shots = [];
    const events = gameData.events || [];

    events.forEach(event => {
        // Compare player IDs as strings to handle both ObjectId and string formats
        const eventPlayerId = event.player_id?._id ? String(event.player_id._id) : String(event.player_id);
        if (event.type === 'shot' && eventPlayerId === String(playerId)) {
            shots.push({
                x: event.location?.x || 50,
                y: event.location?.y || 50,
                made: event.made || false
            });
        }
    });

    return shots;
}

function drawShotsOnSVG(overlayId, shots) {
    const overlay = document.getElementById(overlayId);
    if (!overlay) return;

    // Set SVG viewBox and dimensions
    overlay.setAttribute('viewBox', '0 0 500 470');
    overlay.setAttribute('width', '500');
    overlay.setAttribute('height', '470');

    // Clear existing content
    overlay.innerHTML = '';

    // Draw court background
    const courtGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    courtGroup.setAttribute('id', 'court');

    // Court outline
    const courtRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    courtRect.setAttribute('x', '0');
    courtRect.setAttribute('y', '0');
    courtRect.setAttribute('width', '500');
    courtRect.setAttribute('height', '470');
    courtRect.setAttribute('fill', '#d2691e');
    courtRect.setAttribute('stroke', '#fff');
    courtRect.setAttribute('stroke-width', '2');
    courtGroup.appendChild(courtRect);

    overlay.appendChild(courtGroup);

    // Create a group for shots
    const shotsGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    shotsGroup.setAttribute('id', 'shots-group');

    shots.forEach(shot => {
        const svgX = (shot.x / 100) * 500;
        const svgY = (shot.y / 100) * 470;

        if (shot.made) {
            // Made shot - green circle
            const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            circle.setAttribute('cx', svgX);
            circle.setAttribute('cy', svgY);
            circle.setAttribute('r', '12');
            circle.setAttribute('fill', 'rgba(56, 161, 105, 0.7)');
            circle.setAttribute('stroke', '#22543d');
            circle.setAttribute('stroke-width', '2');
            shotsGroup.appendChild(circle);
        } else {
            // Missed shot - red X
            const size = 10;
            const line1 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            line1.setAttribute('x1', svgX - size);
            line1.setAttribute('y1', svgY - size);
            line1.setAttribute('x2', svgX + size);
            line1.setAttribute('y2', svgY + size);
            line1.setAttribute('stroke', 'rgba(229, 62, 62, 0.8)');
            line1.setAttribute('stroke-width', '3');
            line1.setAttribute('stroke-linecap', 'round');

            const line2 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            line2.setAttribute('x1', svgX + size);
            line2.setAttribute('y1', svgY - size);
            line2.setAttribute('x2', svgX - size);
            line2.setAttribute('y2', svgY + size);
            line2.setAttribute('stroke', 'rgba(229, 62, 62, 0.8)');
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

function generatePDF() {
    const element = document.querySelector('.report-container');
    const opt = {
        margin: 10,
        filename: `game-report-${gameId}.pdf`,
        image: { type: 'png', quality: 0.98 },
        html2canvas: { scale: 2 },
        jsPDF: { orientation: 'portrait', unit: 'mm', format: 'a4' }
    };
    html2pdf().set(opt).from(element).save();
}
