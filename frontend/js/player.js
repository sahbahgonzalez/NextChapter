/**
 * Player Management Page JavaScript
 * Handles player CRUD operations and search
 */

let currentEditingId = null;
let allPlayers = [];

// Helper function to format height from inches to feet'inches"
function formatHeight(totalInches) {
    if (!totalInches) return 'N/A';
    const feet = Math.floor(totalInches / 12);
    const inches = totalInches % 12;
    return `${feet}'${inches}"`;
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    loadPlayers();
    setupEventListeners();
    setupNavigation();
});

function setupEventListeners() {
    document.getElementById('createPlayerBtn').addEventListener('click', openCreatePlayerModal);
    document.getElementById('playerForm').addEventListener('submit', handlePlayerFormSubmit);
    document.getElementById('searchInput').addEventListener('input', handleSearch);
}

function setupNavigation() {
    const signInBtn = document.getElementById('nav-sign-in');
    const signOutBtn = document.getElementById('nav-sign-out');
    const logGameLink = document.getElementById('nav-log-game-link');

    if (apiClient.getToken()) {
        signInBtn.style.display = 'none';
        signOutBtn.style.display = 'block';
        document.getElementById('createPlayerBtn').style.display = 'block';
        if (logGameLink) logGameLink.style.display = 'inline-block';
    } else {
        signInBtn.style.display = 'block';
        signOutBtn.style.display = 'none';
        document.getElementById('createPlayerBtn').style.display = 'none';
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

async function loadPlayers() {
    try {
        allPlayers = await apiClient.searchPlayers();
        renderPlayers(allPlayers);
    } catch (error) {
        showError('Failed to load players');
        console.error(error);
    }
}

function renderPlayers(players) {
    const container = document.getElementById('playersContainer');
    const emptyState = document.getElementById('emptyState');

    if (players.length === 0) {
        container.innerHTML = '';
        emptyState.style.display = 'block';
        return;
    }

    emptyState.style.display = 'none';
    container.innerHTML = players.map(player => `
        <div class="player-card">
            <div class="player-card-header">
                <div class="player-avatar">${player.name ? player.name.charAt(0).toUpperCase() : 'P'}</div>
                <div class="player-info">
                    <h3 style="cursor: pointer; color: var(--primary-blue); transition: all 0.2s ease;" onclick="viewPlayerStats('${player._id}')" title="Click to view stats">${player.name || 'Unknown Player'}</h3>
                    <p>${player.instagram_handle ? '@' + player.instagram_handle : 'No Instagram'}</p>
                </div>
            </div>
            <div class="player-stats">
                <div class="stat-item">
                    <div class="stat-label">Height</div>
                    <div class="stat-value">${formatHeight(player.height_inches)}</div>
                </div>
                <div class="stat-item">
                    <div class="stat-label">Weight</div>
                    <div class="stat-value">${player.weight_lbs ? player.weight_lbs + ' lbs' : 'N/A'}</div>
                </div>
                <div class="stat-item">
                    <div class="stat-label">Games</div>
                    <div class="stat-value">${player.overall_stats?.games_played || 0}</div>
                </div>
                <div class="stat-item">
                    <div class="stat-label">Wins</div>
                    <div class="stat-value">${player.overall_stats?.wins || 0}</div>
                </div>
            </div>
            ${player.bio ? `<p style="font-size: 0.85rem; color: var(--text-muted); margin: 0;">${player.bio}</p>` : ''}
            ${apiClient.getToken() ? `
                <div class="player-actions" style="margin-top: 1rem;">
                    <button class="btn btn-secondary" onclick="editPlayer('${player._id}')">Edit</button>
                    <button class="btn btn-danger" onclick="deletePlayer('${player._id}')">Delete</button>
                </div>
            ` : ''}
        </div>
    `).join('');
}

function openCreatePlayerModal() {
    currentEditingId = null;
    document.getElementById('modalTitle').textContent = 'Create New Player';
    document.getElementById('playerForm').reset();
    document.getElementById('playerModal').classList.add('active');
}

function editPlayer(id) {
    const player = allPlayers.find(p => p._id === id);
    if (!player) return;

    currentEditingId = id;
    document.getElementById('modalTitle').textContent = 'Edit Player';
    document.getElementById('playerName').value = player.name || '';
    document.getElementById('playerIG').value = player.instagram_handle || '';
    document.getElementById('playerBio').value = player.bio || '';

    // Convert total inches to feet and inches
    if (player.height_inches) {
        const feet = Math.floor(player.height_inches / 12);
        const inches = player.height_inches % 12;
        document.getElementById('playerHeightFeet').value = feet;
        document.getElementById('playerHeightInches').value = inches;
    } else {
        document.getElementById('playerHeightFeet').value = '';
        document.getElementById('playerHeightInches').value = '';
    }

    document.getElementById('playerWeight').value = player.weight_lbs || '';
    document.getElementById('playerHometown').value = player.hometown || '';
    document.getElementById('playerModal').classList.add('active');
}

function closePlayerModal() {
    document.getElementById('playerModal').classList.remove('active');
    currentEditingId = null;
}

async function handlePlayerFormSubmit(e) {
    e.preventDefault();

    // Convert feet and inches to total inches
    const feet = document.getElementById('playerHeightFeet').value;
    const inches = document.getElementById('playerHeightInches').value;
    let totalInches = null;
    if (feet || inches) {
        totalInches = (parseInt(feet) || 0) * 12 + (parseInt(inches) || 0);
    }

    const playerData = {
        name: document.getElementById('playerName').value,
        instagram_handle: document.getElementById('playerIG').value,
        bio: document.getElementById('playerBio').value,
        height_inches: totalInches,
        weight_lbs: document.getElementById('playerWeight').value ? parseInt(document.getElementById('playerWeight').value) : null,
        hometown: document.getElementById('playerHometown').value
    };

    try {
        if (currentEditingId) {
            await apiClient.updatePlayer(currentEditingId, playerData);
            showSuccess('Player updated successfully');
        } else {
            await apiClient.createPlayer(playerData);
            showSuccess('Player created successfully');
        }
        closePlayerModal();
        loadPlayers();
    } catch (error) {
        showError(error.message || 'Failed to save player');
    }
}

async function deletePlayer(id) {
    if (!confirm('Are you sure you want to delete this player?')) return;

    try {
        await apiClient.deletePlayer(id);
        showSuccess('Player deleted successfully');
        loadPlayers();
    } catch (error) {
        showError(error.message || 'Failed to delete player');
    }
}

function handleSearch(e) {
    const query = e.target.value.toLowerCase();
    const filtered = allPlayers.filter(player => {
        const name = (player.name || '').toLowerCase();
        const ig = (player.instagram_handle || '').toLowerCase();
        return name.includes(query) || ig.includes(query);
    });
    renderPlayers(filtered);
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

function viewPlayerStats(playerId) {
    window.location.href = `player-stats.html?id=${playerId}`;
}

// Close modal when clicking outside
document.getElementById('playerModal').addEventListener('click', (e) => {
    if (e.target === document.getElementById('playerModal')) {
        closePlayerModal();
    }
});
