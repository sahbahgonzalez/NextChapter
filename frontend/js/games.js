/**
 * Games Page JavaScript
 * Handles game listing, filtering, and management
 */

let allGames = [];
let currentEditingId = null;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    loadGames();
    setupEventListeners();
    setupNavigation();
});

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

    if (apiClient.getToken()) {
        signInBtn.style.display = 'none';
        signOutBtn.style.display = 'block';
        document.getElementById('createGameBtn').style.display = 'block';
    } else {
        signInBtn.style.display = 'block';
        signOutBtn.style.display = 'none';
        document.getElementById('createGameBtn').style.display = 'none';
    }

    signInBtn.addEventListener('click', () => {
        window.location.href = '/login.html';
    });

    signOutBtn.addEventListener('click', () => {
        apiClient.logout();
    });
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

    const teamAScore = game.final_score?.team_a || 0;
    const teamBScore = game.final_score?.team_b || 0;
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
                    <button class="btn btn-secondary" onclick="viewGameDetails('${game._id}')">View</button>
                    ${game.status !== 'finished' ? `<button class="btn btn-danger" onclick="deleteGame('${game._id}')">Delete</button>` : ''}
                </div>
            ` : ''}
        </div>
    `;
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
        window.location.href = `/game-report.html?id=${id}`;
    } else {
        // Redirect to game logging for live/scheduled games
        window.location.href = `/game.html?id=${id}`;
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
