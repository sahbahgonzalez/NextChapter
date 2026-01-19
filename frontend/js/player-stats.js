/**
 * Player Stats Page JavaScript
 * Handles player stats display and shot chart rendering
 */

let currentPlayerId = null;
let playerData = null;
let playerGames = [];

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    setupNavigation();

    // Get player ID from URL
    const params = new URLSearchParams(window.location.search);
    currentPlayerId = params.get('id');

    if (currentPlayerId) {
        loadPlayerStats();
    } else {
        document.getElementById('playerContent').innerHTML = '<p style="text-align: center;">No player selected. <a href="player.html">Go back to players</a></p>';
    }
});

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

async function loadPlayerStats() {
    try {
        playerData = await apiClient.getPlayerById(currentPlayerId);
        playerGames = await apiClient.getPlayerRecentGames(currentPlayerId);
        renderPlayerStats();
    } catch (error) {
        document.getElementById('playerContent').innerHTML = '<p style="text-align: center; color: red;">Failed to load player stats: ' + error.message + '</p>';
    }
}

function renderPlayerStats() {
    const avatar = playerData.name ? playerData.name.charAt(0).toUpperCase() : 'P';
    const wins = playerData.overall_stats?.wins || 0;
    const losses = playerData.overall_stats?.losses || 0;
    const gamesPlayed = playerData.overall_stats?.games_played || 0;
    const winPercentage = gamesPlayed > 0 ? ((wins / gamesPlayed) * 100).toFixed(1) : 0;

    let html = `
        <div class="player-header">
            <div class="player-avatar-large">${avatar}</div>
            <div class="player-info">
                <h1>${playerData.name || 'Unknown Player'}</h1>
                <div class="player-meta">
                    <div class="meta-item">
                        <span class="meta-label">Instagram</span>
                        <span class="meta-value">${playerData.instagram_handle ? '@' + playerData.instagram_handle : 'N/A'}</span>
                    </div>
                    <div class="meta-item">
                        <span class="meta-label">Height</span>
                        <span class="meta-value">${playerData.height_inches ? playerData.height_inches + '"' : 'N/A'}</span>
                    </div>
                    <div class="meta-item">
                        <span class="meta-label">Weight</span>
                        <span class="meta-value">${playerData.weight_lbs ? playerData.weight_lbs + ' lbs' : 'N/A'}</span>
                    </div>
                    <div class="meta-item">
                        <span class="meta-label">Hometown</span>
                        <span class="meta-value">${playerData.hometown || 'N/A'}</span>
                    </div>
                </div>
                ${playerData.bio ? `<p class="player-bio">${playerData.bio}</p>` : ''}
            </div>
        </div>

        <div class="stats-grid">
            <div class="stat-card">
                <h3>Overall Record</h3>
                <div class="stat-rows">
                    <div class="stat-row">
                        <span class="stat-name">Games Played</span>
                        <span class="stat-number">${gamesPlayed}</span>
                    </div>
                    <div class="stat-row">
                        <span class="stat-name">Wins</span>
                        <span class="stat-number">${wins}</span>
                    </div>
                    <div class="stat-row">
                        <span class="stat-name">Losses</span>
                        <span class="stat-number">${losses}</span>
                    </div>
                    <div class="stat-row">
                        <span class="stat-name">Win %</span>
                        <span class="stat-number">${winPercentage}%</span>
                    </div>
                </div>
            </div>

            <div class="stat-card">
                <h3>Shooting Stats</h3>
                <div class="stat-rows">
                    <div class="stat-row">
                        <span class="stat-name">Total Points</span>
                        <span class="stat-number">${playerData.overall_stats?.pts || 0}</span>
                    </div>
                    <div class="stat-row">
                        <span class="stat-name">Field Goals</span>
                        <span class="stat-number">${playerData.overall_stats?.fgm || 0}/${playerData.overall_stats?.fga || 0}</span>
                    </div>
                    <div class="stat-row">
                        <span class="stat-name">3-Pointers</span>
                        <span class="stat-number">${playerData.overall_stats?.['3pm'] || 0}/${playerData.overall_stats?.['3pa'] || 0}</span>
                    </div>
                    <div class="stat-row">
                        <span class="stat-name">Free Throws</span>
                        <span class="stat-number">${playerData.overall_stats?.ftm || 0}/${playerData.overall_stats?.fta || 0}</span>
                    </div>
                </div>
            </div>

            <div class="stat-card">
                <h3>Game Stats</h3>
                <div class="stat-rows">
                    <div class="stat-row">
                        <span class="stat-name">Rebounds</span>
                        <span class="stat-number">${playerData.overall_stats?.reb || 0}</span>
                    </div>
                    <div class="stat-row">
                        <span class="stat-name">Assists</span>
                        <span class="stat-number">${playerData.overall_stats?.ast || 0}</span>
                    </div>
                    <div class="stat-row">
                        <span class="stat-name">Steals</span>
                        <span class="stat-number">${playerData.overall_stats?.stl || 0}</span>
                    </div>
                    <div class="stat-row">
                        <span class="stat-name">Blocks</span>
                        <span class="stat-number">${playerData.overall_stats?.blk || 0}</span>
                    </div>
                </div>
            </div>
        </div>

        <div class="heatmap-container">
            <div style="width: 100%; max-width: 550px;">
                <h2 style="text-align: center; margin-top: 0;">All-Time Shot Chart</h2>
                <div style="position: relative; width: 100%; display: inline-block;">
                    <img src="assets/basketballcourt.svg" alt="Basketball Court" style="width: 100%; height: auto; display: block; border-radius: 8px;">
                    <svg id="heatmapOverlay" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; cursor: pointer; border-radius: 8px;" viewBox="0 0 550 503" preserveAspectRatio="xMidYMid meet"></svg>
                </div>
                <div class="heatmap-legend">
                    <div class="legend-item">
                        <div class="legend-color" style="background-color: rgba(56, 161, 105, 0.7);"></div>
                        <span>Made Shot</span>
                    </div>
                    <div class="legend-item">
                        <div class="legend-color" style="background-color: rgba(229, 62, 62, 0.7);"></div>
                        <span>Missed Shot</span>
                    </div>
                    <div style="margin-top: 8px; font-size: 0.9rem; color: #666;">
                        <span id="shotStats">Total Shots: 0 | Made: 0 | FG%: 0%</span>
                    </div>
                </div>
            </div>
        </div>
    `;

    if (playerGames && playerGames.length > 0) {
        html += `
            <div class="games-section">
                <h2>Recent Games</h2>
                <table class="games-table">
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th>Type</th>
                            <th>Status</th>
                            <th>Score</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${playerGames.map(game => `
                            <tr>
                                <td>${new Date(game.createdAt).toLocaleDateString()}</td>
                                <td>${game.game_type || 'Game'}</td>
                                <td>${game.status === 'finished' ? 'Finished' : 'In Progress'}</td>
                                <td>${game.final_score?.team_a || 0} - ${game.final_score?.team_b || 0}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    } else {
        html += `
            <div class="games-section">
                <h2>Recent Games</h2>
                <div class="empty-state">
                    <p>No games recorded yet.</p>
                </div>
            </div>
        `;
    }

    document.getElementById('playerContent').innerHTML = html;

    // Draw the shot chart after content is rendered
    setTimeout(async () => {
        await drawShotChart();
    }, 100);
}

async function drawShotChart() {
    const svg = document.getElementById('heatmapOverlay');
    if (!svg) return;

    // Clear SVG
    svg.innerHTML = '';

    try {
        const urlParams = new URLSearchParams(window.location.search);
        const playerId = urlParams.get('id');

        if (!playerId) {
            console.warn('No player ID found');
            return;
        }

        // Use shot-chart endpoint to pull all shots across games
        const shotData = await apiClient.getPlayerShotChart(playerId);
        const shots = (shotData && Array.isArray(shotData.shots) ? shotData.shots : []);

        // Update stats display even if zero
        const madeShots = shots.filter(s => s.made).length;
        const fgPercentage = shots.length > 0 ? Math.round((madeShots / shots.length) * 100) : 0;
        document.getElementById('shotStats').textContent = `Total Shots: ${shots.length} | Made: ${madeShots} | FG%: ${fgPercentage}%`;

        if (shots.length === 0) {
            // Show "No shots logged yet" message
            const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            text.setAttribute('x', '275');
            text.setAttribute('y', '251');
            text.setAttribute('text-anchor', 'middle');
            text.setAttribute('font-size', '16');
            text.setAttribute('fill', 'rgba(255, 255, 255, 0.5)');
            text.textContent = 'No shots logged yet';
            svg.appendChild(text);
            return;
        }


        const clamp = (val, min, max) => Math.min(max, Math.max(min, val));

        // Draw each shot on SVG
        shots.forEach(shot => {
            const loc = shot.location || shot;
            if (loc === undefined || loc === null) return;
            const xVal = loc.x ?? shot.x;
            const yVal = loc.y ?? shot.y;
            if (xVal === undefined || yVal === undefined) return;

            // Convert normalized coordinates (0-1 or 0-100) to SVG (0-550 x 0-503)
            const rawX = xVal <= 1 ? xVal * 550 : xVal <= 100 ? (xVal / 100) * 550 : xVal;
            const rawY = yVal <= 1 ? yVal * 503 : yVal <= 100 ? (yVal / 100) * 503 : yVal;

            // Clamp to viewbox to keep markers on the court
            const svgX = clamp(rawX, 0, 550);
            const svgY = clamp(rawY, 0, 503);

            if (shot.made) {
                // Made shot - green circle
                const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                circle.setAttribute('cx', svgX);
                circle.setAttribute('cy', svgY);
                circle.setAttribute('r', '8');
                circle.setAttribute('fill', 'rgba(56, 161, 105, 0.7)');
                circle.setAttribute('stroke', '#22543d');
                circle.setAttribute('stroke-width', '2');
                svg.appendChild(circle);
            } else {
                // Missed shot - red X
                const size = 6;
                const line1 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                line1.setAttribute('x1', svgX - size);
                line1.setAttribute('y1', svgY - size);
                line1.setAttribute('x2', svgX + size);
                line1.setAttribute('y2', svgY + size);
                line1.setAttribute('stroke', 'rgba(229, 62, 62, 0.8)');
                line1.setAttribute('stroke-width', '2');
                line1.setAttribute('stroke-linecap', 'round');

                const line2 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                line2.setAttribute('x1', svgX + size);
                line2.setAttribute('y1', svgY - size);
                line2.setAttribute('x2', svgX - size);
                line2.setAttribute('y2', svgY + size);
                line2.setAttribute('stroke', 'rgba(229, 62, 62, 0.8)');
                line2.setAttribute('stroke-width', '2');
                line2.setAttribute('stroke-linecap', 'round');

                svg.appendChild(line1);
                svg.appendChild(line2);
            }
        });

    } catch (error) {
        console.error('Error loading shot chart:', error);
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', '275');
        text.setAttribute('y', '251');
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('font-size', '16');
        text.setAttribute('fill', 'rgba(255, 255, 255, 0.5)');
        text.textContent = 'Error loading shot data';
        svg.appendChild(text);
        const statsEl = document.getElementById('shotStats');
        if (statsEl) statsEl.textContent = 'Failed to load shots';
    }
}
