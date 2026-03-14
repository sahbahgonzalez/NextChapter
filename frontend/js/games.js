/**
 * Games Page JavaScript
 * Handles game listing, filtering, and management
 */

let allGames = [];
let currentEditingId = null;
const LIVE_GAME_STATE_KEY = 'tnc_live_game_state_active_v1';
let liveGamesRefreshInterval = null;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    loadGames();
    setupEventListeners();
    setupNavigation();
    startLiveGamesRefresh();
});

function startLiveGamesRefresh() {
    if (liveGamesRefreshInterval) clearInterval(liveGamesRefreshInterval);
    liveGamesRefreshInterval = setInterval(() => {
        loadGames();
    }, 5000);
}

function computePointsFromStats(stats) {
    if (!stats) return 0;
    return ((stats.twoPM || 0) * 2) + ((stats.threePM || 0) * 3) + ((stats.fourPM || 0) * 4) + (stats.ftM || 0);
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
    const now = new Date();
    const live = [];
    const scheduled = [];
    const completed = [];

    allGames.forEach(game => {
        const gameDate = new Date(game.createdAt);

        if (game.status === 'finished') {
            completed.push(game);
        } else if (game.status === 'live' || game.status === 'in_progress') {
            live.push(game);
        } else {
            scheduled.push(game);
        }
    });

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
    const statusClass = status === 'finished' ? 'status-completed' : status === 'live' || status === 'in_progress' ? 'status-live' : 'status-scheduled';
    const statusText = status === 'finished' ? 'Finished' : status === 'live' || status === 'in_progress' ? 'Live' : 'Scheduled';

    const gameDate = new Date(game.createdAt);
    const dateStr = gameDate.toLocaleDateString() + ' ' + gameDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});

    const resolvedScore = resolveDisplayedScore(game);
    const teamAScore = resolvedScore.teamA;
    const teamBScore = resolvedScore.teamB;
    const teamAName = game.teams?.team_a?.name || 'Team A';
    const teamBName = game.teams?.team_b?.name || 'Team B';
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
        <div class="game-card">
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
                        ? `<button class="btn btn-secondary" onclick="viewGameDetails('${game._id}')">View</button>`
                        : status === 'live' || status === 'in_progress'
                            ? `<button class="btn btn-primary" onclick="viewGameDetails('${game._id}')">Resume Game</button><button class="btn btn-secondary" onclick="viewLiveReport('${game._id}')">Live Report</button>`
                            : `<button class="btn btn-primary" onclick="viewGameDetails('${game._id}')">Start Game</button>`
                    }
                    ${game.status !== 'finished' ? `<button class="btn btn-danger" onclick="deleteGame('${game._id}')">Delete</button>` : ''}
                </div>
            ` : ''}
        </div>
    `;
}

function viewLiveReport(id) {
    window.location.href = `game-report.html?id=${id}&live=1`;
}

function openCreateGameModal() {
    currentEditingId = null;
    document.getElementById('modalTitle').textContent = 'Schedule New Game';
    document.getElementById('gameForm').reset();
    document.getElementById('gameModal').classList.add('active');
}

function closeGameModal() {
    document.getElementById('gameModal').classList.remove('active');
    currentEditingId = null;
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

    try {
        if (currentEditingId) {
            await apiClient.updateGame(currentEditingId, gameData);
            showSuccess('Game updated successfully');
        } else {
            await apiClient.createGame(gameData);
            showSuccess('Game scheduled successfully');
        }
        closeGameModal();
        loadGames();
    } catch (error) {
        showError(error.message || 'Failed to save game');
    }
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
