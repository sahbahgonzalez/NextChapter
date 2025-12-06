/**
 * Object-Oriented Basketball Shot Logger Application
 * Refactored from index.html to follow OOP principles
 */

// ==================== DATA MANAGER ====================
class DataManager {
    constructor() {
        this.playerData = [];
        this.currentPage = 1;
        this.pageSize = 10;
        this.showAll = false;
    }

    async fetchPlayerData() {
        try {
            console.log('Fetching all players from database...');
            const response = await apiClient.searchPlayers();
            const playersList = Array.isArray(response) ? response : (response.players || response || []);
            
            if (!playersList || playersList.length === 0) {
                this.playerData = [];
                return [];
            }

            // Fetch full player data individually since search endpoint doesn't include overall_stats
            console.log('Fetching detailed stats for each player...');
            const detailedPlayers = await Promise.all(
                playersList.map(async (player) => {
                    try {
                        // Fetch full player data including overall_stats
                        const fullPlayer = await apiClient.getPlayerById(player._id);
                        return fullPlayer;
                    } catch (err) {
                        console.warn(`Failed to fetch details for player ${player._id}:`, err);
                        return player; // Fall back to basic data
                    }
                })
            );

            this.playerData = detailedPlayers.map(player => {
                const stats = player.overall_stats || {};
                const gp = stats.games_played || 0;
                const displayName = player.instagram_handle || player.name || player.hometown || '—';
                const searchKey = `${player.instagram_handle || ''} ${player.name || ''} ${player.hometown || ''}`.trim();
                
                return {
                    _id: player._id,
                    player: displayName,
                    searchKey: searchKey,
                    gp: gp,
                    pts: gp > 0 ? (stats.total_points || 0) / gp : 0,
                    fg_pct: stats.total_fga > 0 ? ((stats.total_fgm || 0) / stats.total_fga) * 100 : 0,
                    p3_pct: stats.total_3pa > 0 ? ((stats.total_3pm || 0) / stats.total_3pa) * 100 : 0,
                    ft_pct: stats.total_fta > 0 ? ((stats.total_ftm || 0) / stats.total_fta) * 100 : 0,
                    ast: gp > 0 ? (stats.total_assists || 0) / gp : 0,
                    reb: gp > 0 ? (stats.total_rebounds || 0) / gp : 0,
                    blk: gp > 0 ? (stats.total_blocks || 0) / gp : 0,
                    stl: gp > 0 ? (stats.total_steals || 0) / gp : 0
                };
            }).sort((a, b) => (a.player || '').localeCompare(b.player || '', undefined, { sensitivity: 'base' }));

            return this.playerData;
        } catch (error) {
            console.error('Error fetching player data:', error);
            this.playerData = [];
            return [];
        }
    }

    getPlayerData() {
        return this.playerData;
    }

    getPaginatedData() {
        const total = this.playerData.length;
        const totalPages = this.showAll ? 1 : Math.max(1, Math.ceil(total / this.pageSize));
        
        if (this.currentPage > totalPages) {
            this.currentPage = totalPages;
        }

        const start = this.showAll ? 0 : (this.currentPage - 1) * this.pageSize;
        const pageItems = this.showAll ? this.playerData.slice(0) : this.playerData.slice(start, start + this.pageSize);

        return {
            items: pageItems,
            currentPage: this.currentPage,
            totalPages: totalPages,
            totalCount: total,
            startItem: total > 0 ? (this.showAll ? 1 : start + 1) : 0,
            endItem: total > 0 ? (this.showAll ? total : Math.min(this.currentPage * this.pageSize, total)) : 0
        };
    }

    setPage(page) {
        this.currentPage = page;
    }

    toggleShowAll() {
        this.showAll = !this.showAll;
        if (this.showAll) {
            this.currentPage = 1;
        }
    }
}

// ==================== THEME MANAGER ====================
class ThemeManager {
    constructor() {
        this.body = document.body;
        this.toggleButton = document.getElementById('mode-toggle');
        this.init();
    }

    init() {
        const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
        const savedMode = localStorage.getItem('theme');

        if (savedMode === 'dark' || (savedMode === null && prefersDark)) {
            this.setDarkMode();
        } else {
            this.setLightMode();
        }

        this.toggleButton.addEventListener('click', () => this.toggle());
    }

    toggle() {
        if (this.body.classList.contains('dark-mode')) {
            this.setLightMode();
        } else {
            this.setDarkMode();
        }
    }

    setDarkMode() {
        this.body.classList.add('dark-mode');
        localStorage.setItem('theme', 'dark');
        this.toggleButton.innerHTML = '🌙';
    }

    setLightMode() {
        this.body.classList.remove('dark-mode');
        localStorage.setItem('theme', 'light');
        this.toggleButton.innerHTML = '☀️';
    }
}

// ==================== AUTH MANAGER ====================
class AuthManager {
    constructor(onAuthChange) {
        this.signInButton = document.getElementById('sign-in-button');
        this.onAuthChange = onAuthChange;
        this.init();
    }

    init() {
        this.signInButton.addEventListener('click', () => this.handleAuthClick());
        this.updateUI();
    }

    async handleAuthClick() {
        const token = apiClient.getToken();
        if (token) {
            this.logout();
        } else {
            this.showLoginModal();
        }
    }

    logout() {
        localStorage.removeItem('authToken');
        localStorage.removeItem('user');
        console.log('Logged out manually');
        this.updateUI();
        if (this.onAuthChange) {
            this.onAuthChange();
        }
    }

    showLoginModal() {
        const modal = document.getElementById('login-modal');
        modal.style.display = 'flex';

        const emailInput = document.getElementById('login-email');
        const passInput = document.getElementById('login-password');
        const submitBtn = document.getElementById('login-submit');
        const cancelBtn = document.getElementById('login-cancel');

        emailInput.value = '';
        passInput.value = '';

        submitBtn.onclick = async () => {
            const email = emailInput.value.trim();
            const password = passInput.value.trim();
            
            if (!email || !password) {
                return alert('Please enter both fields.');
            }

            try {
                const data = await apiClient.login(email, password);
                console.log("Logged in:", data.user);
                modal.style.display = 'none';
                this.updateUI();
                if (this.onAuthChange) {
                    this.onAuthChange();
                }
            } catch (err) {
                alert("Login failed: " + err.message);
            }
        };

        cancelBtn.onclick = () => {
            modal.style.display = 'none';
        };

        modal.onclick = (e) => {
            if (e.target === modal) modal.style.display = 'none';
        };
    }

    updateUI() {
        const user = apiClient.getUser();
        
        if (user) {
            document.querySelectorAll('.hidden-nav-link').forEach(link => {
                link.style.display = 'inline-block';
            });
            this.signInButton.textContent = 'Sign Out';
        } else {
            document.querySelectorAll('.hidden-nav-link').forEach(link => {
                link.style.display = 'none';
            });
            document.querySelectorAll('.hidden-section').forEach(section => {
                section.style.display = 'none';
            });
            this.signInButton.textContent = 'Sign In';
        }
    }

    isAuthenticated() {
        return !!apiClient.getUser();
    }
}

// ==================== NAVIGATION MANAGER ====================
class NavigationManager {
    constructor() {
        this.mainNav = document.getElementById('main-nav');
        this.statsSection = document.getElementById('stats');
        this.profilesSection = document.getElementById('profiles');
        this.profileDetailSection = document.getElementById('player-profile-detail');
        this.init();
    }

    init() {
        this.mainNav.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', (e) => this.handleMainNavClick(e, link));
        });

        this.initProfileSubNav();
    }

    handleMainNavClick(e, link) {
        e.preventDefault();

        if (this.profileDetailSection.style.display === 'block') {
            if (link.getAttribute('href') === '#stats') {
                this.goToStatsList();
                return;
            }
        }

        this.mainNav.querySelectorAll('a').forEach(a => a.classList.remove('active'));
        link.classList.add('active');

        this.hideAllSections();

        const targetId = link.getAttribute('href').substring(1);
        const targetElement = document.getElementById(targetId);

        if (targetElement) {
            if (targetId === 'stats' || !targetElement.classList.contains('hidden-section')) {
                targetElement.style.display = 'block';
            } else if (apiClient.getUser()) {
                targetElement.style.display = 'block';
            }
        }
    }

    initProfileSubNav() {
        const profileSubNav = document.getElementById('profile-sub-nav');
        const playerManagerDiv = document.getElementById('player-manager');
        const gameHistoryDiv = document.getElementById('game-history');

        if (profileSubNav) {
            profileSubNav.querySelectorAll('a').forEach(link => {
                link.addEventListener('click', (e) => {
                    e.preventDefault();
                    const targetId = link.getAttribute('href').substring(1);

                    profileSubNav.querySelectorAll('a').forEach(a => a.classList.remove('active'));
                    link.classList.add('active');

                    if (playerManagerDiv) playerManagerDiv.style.display = 'none';
                    if (gameHistoryDiv) gameHistoryDiv.style.display = 'none';

                    document.getElementById(targetId).style.display = 'block';
                });
            });

            const managePlayersLink = profileSubNav.querySelector('a[href="#player-manager"]');
            if (managePlayersLink) managePlayersLink.click();
        }
    }

    hideAllSections() {
        this.statsSection.style.display = 'none';
        this.profilesSection.style.display = 'none';
        this.profileDetailSection.style.display = 'none';
    }

    goToStatsList() {
        this.hideAllSections();
        this.statsSection.style.display = 'block';

        this.mainNav.querySelectorAll('a').forEach(a => a.classList.remove('active'));
        this.mainNav.querySelector('a[href="#stats"]').classList.add('active');
    }
}

// ==================== STATS TABLE RENDERER ====================
class StatsTableRenderer {
    constructor(dataManager, navigationManager) {
        this.dataManager = dataManager;
        this.navigationManager = navigationManager;
        this.statsTableBody = document.getElementById('stats-table-body');
        this.searchInput = document.getElementById('player-search');
        this.statsTable = document.getElementById('stats-table');
        this.detailStatsMap = {
            pts: { label: 'Points', formatter: (val) => val.toFixed(1) },
            fg_pct: { label: 'FG%', formatter: (val) => val.toFixed(1) + '%' },
            p3_pct: { label: '3P%', formatter: (val) => val.toFixed(1) + '%' },
            ft_pct: { label: 'FT%', formatter: (val) => val.toFixed(1) + '%' },
            ast: { label: 'Assists', formatter: (val) => val.toFixed(1) },
            reb: { label: 'Rebounds', formatter: (val) => val.toFixed(1) },
            blk: { label: 'Blocks', formatter: (val) => val.toFixed(1) },
            stl: { label: 'Steals', formatter: (val) => val.toFixed(1) },
        };
        this.initSearch();
    }

    initSearch() {
        if (this.searchInput && this.statsTable) {
            this.searchInput.addEventListener('keyup', () => this.filterTable());
        }
    }

    filterTable() {
        const rawFilter = this.searchInput.value || '';
        const filter = rawFilter.toUpperCase();
        const filterNoSpace = filter.replace(/\s+/g, '');

        const tr = this.statsTable.getElementsByTagName('tbody')[0].getElementsByTagName('tr');

        for (let i = 0; i < tr.length; i++) {
            const td = tr[i].getElementsByTagName('td')[0];
            if (!td) continue;

            const nameEl = td.querySelector('.player-name-link');
            const txtValue = (td.textContent || td.innerText || '').toUpperCase();
            const txtNoSpace = (nameEl && nameEl.dataset && nameEl.dataset.normalized) 
                ? nameEl.dataset.normalized 
                : txtValue.replace(/\s+/g, '');

            if (filter.length === 0 || txtValue.indexOf(filter) > -1 || txtNoSpace.indexOf(filterNoSpace) > -1) {
                tr[i].style.display = "";
            } else {
                tr[i].style.display = "none";
            }
        }
    }

    render() {
        if (!this.statsTableBody) return;

        this.statsTableBody.innerHTML = '';
        const { items, totalPages, totalCount } = this.dataManager.getPaginatedData();

        if (items.length === 0) {
            this.statsTableBody.innerHTML = `
                <tr>
                    <td colspan="10" style="text-align: center; padding: 20px; color: var(--text-muted);">
                        No players found. Create a player profile to get started.
                    </td>
                </tr>`;
            this.renderPaginationControls(totalPages, totalCount);
            return;
        }

        items.forEach(player => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td class="player-name-link" style="font-weight: bold;">${player.player}</td>
                <td>${player.gp}</td>
                <td>${player.pts.toFixed(1)}</td>
                <td>${player.fg_pct.toFixed(1)}%</td>
                <td>${player.p3_pct.toFixed(1)}%</td>
                <td>${player.ft_pct.toFixed(1)}%</td>
                <td>${player.ast.toFixed(1)}</td>
                <td>${player.reb.toFixed(1)}</td>
                <td>${player.blk.toFixed(1)}</td>
                <td>${player.stl.toFixed(1)}</td>
            `;
            this.statsTableBody.appendChild(row);

            const nameLink = row.querySelector('.player-name-link');
            if (nameLink) {
                const rawForNorm = (player.searchKey && player.searchKey.length > 0) 
                    ? player.searchKey 
                    : (nameLink.textContent || nameLink.innerText || '');
                const txtValue = String(rawForNorm).toUpperCase();
                nameLink.dataset.normalized = txtValue.replace(/\s+/g, '');
                nameLink.addEventListener('click', () => {
                    this.displayPlayerProfile(player);
                });
            }
        });

        this.renderPaginationControls(totalPages, totalCount);
    }

    renderPaginationControls(totalPages, totalCount) {
        let container = document.getElementById('pagination-controls');
        
        if (!container) {
            container = document.createElement('div');
            container.id = 'pagination-controls';
            container.style.marginTop = '12px';
            container.style.display = 'flex';
            container.style.justifyContent = 'space-between';
            container.style.alignItems = 'center';
            
            const tableWrapper = document.querySelector('#stats > div');
            if (tableWrapper) {
                tableWrapper.appendChild(container);
            } else {
                document.getElementById('stats').appendChild(container);
            }
        }

        container.innerHTML = '';

        const summary = document.createElement('div');
        summary.style.color = 'var(--text-muted)';
        summary.style.fontSize = '0.9em';

        const { startItem, endItem } = this.dataManager.getPaginatedData();
        if (totalCount > 0) {
            summary.textContent = `Showing ${startItem}-${endItem} of ${totalCount}`;
        }
        container.appendChild(summary);

        const controls = document.createElement('div');
        controls.style.display = 'flex';
        controls.style.gap = '8px';

        const currentPage = this.dataManager.currentPage;

        const prevBtn = document.createElement('button');
        prevBtn.className = 'action-button';
        prevBtn.textContent = '◀ Prev';
        prevBtn.disabled = currentPage <= 1;
        prevBtn.onclick = () => {
            if (currentPage > 1) {
                this.dataManager.setPage(currentPage - 1);
                this.render();
            }
        };
        controls.appendChild(prevBtn);

        const maxButtons = 7;
        let startPage = Math.max(1, currentPage - Math.floor(maxButtons / 2));
        let endPage = Math.min(totalPages, startPage + maxButtons - 1);
        if (endPage - startPage < maxButtons - 1) {
            startPage = Math.max(1, endPage - maxButtons + 1);
        }

        for (let p = startPage; p <= endPage; p++) {
            const btn = document.createElement('button');
            btn.className = 'action-button';
            btn.textContent = p;
            if (p === currentPage) {
                btn.style.fontWeight = '800';
                btn.disabled = true;
            }
            const page = p;
            btn.onclick = () => {
                this.dataManager.setPage(page);
                this.render();
            };
            controls.appendChild(btn);
        }

        const nextBtn = document.createElement('button');
        nextBtn.className = 'action-button';
        nextBtn.textContent = 'Next ▶';
        nextBtn.disabled = currentPage >= totalPages;
        nextBtn.onclick = () => {
            if (currentPage < totalPages) {
                this.dataManager.setPage(currentPage + 1);
                this.render();
            }
        };
        controls.appendChild(nextBtn);

        const toggle = document.createElement('button');
        toggle.className = 'action-button';
        toggle.style.marginLeft = '8px';
        toggle.textContent = this.dataManager.showAll ? 'Paged view' : 'Show all';
        toggle.onclick = () => {
            this.dataManager.toggleShowAll();
            this.render();
        };
        controls.appendChild(toggle);

        container.appendChild(controls);
    }

    displayPlayerProfile(player) {
        this.navigationManager.hideAllSections();
        this.navigationManager.profileDetailSection.style.display = 'block';

        document.getElementById('profile-player-name').textContent = player.player;
        document.getElementById('profile-tagline').textContent = `Tracked Games: ${player.gp}`;

        const detailStatGrid = document.getElementById('detail-stat-grid');
        detailStatGrid.innerHTML = '';

        Object.keys(this.detailStatsMap).forEach(key => {
            const statInfo = this.detailStatsMap[key];
            const value = player[key];

            const card = document.createElement('div');
            card.className = 'stat-card';

            const valueClass = key.includes('_pct') ? 'stat-value percentage' : 'stat-value';

            card.innerHTML = `
                <div class="stat-label">${statInfo.label}</div>
                <div class="${valueClass}">${statInfo.formatter(value)}</div>
            `;
            detailStatGrid.appendChild(card);
        });

        this.navigationManager.mainNav.querySelectorAll('a').forEach(a => a.classList.remove('active'));
    }
}

// ==================== PLAYER MANAGER ====================
class PlayerManager {
    constructor(dataManager, statsTableRenderer) {
        this.dataManager = dataManager;
        this.statsTableRenderer = statsTableRenderer;
        this.tableBody = document.getElementById('player-management-body');
        this.init();
    }

    init() {
        const addPlayerButton = document.querySelector('.add-player-button');
        if (addPlayerButton) {
            addPlayerButton.addEventListener('click', () => this.showAddPlayerModal());
        }

        const profilesSection = document.getElementById('profiles');
        if (profilesSection) {
            const observer = new MutationObserver((mutations) => {
                mutations.forEach((mutation) => {
                    if (mutation.attributeName === 'style') {
                        const display = window.getComputedStyle(profilesSection).display;
                        if (display === 'block') {
                            this.loadPlayerManagementTable();
                        }
                    }
                });
            });

            observer.observe(profilesSection, { attributes: true });
        }
    }

    showAddPlayerModal() {
        const modal = document.getElementById('add-player-modal');
        modal.style.display = 'flex';

        const nameInput = document.getElementById('player-name-input');
        const instagramInput = document.getElementById('player-instagram-input');
        const hometownInput = document.getElementById('player-hometown-input');
        const heightInput = document.getElementById('player-height-input');
        const weightInput = document.getElementById('player-weight-input');
        const bioInput = document.getElementById('player-bio-input');
        const submitBtn = document.getElementById('add-player-submit');
        const cancelBtn = document.getElementById('add-player-cancel');

        nameInput.value = '';
        instagramInput.value = '';
        hometownInput.value = '';
        heightInput.value = '';
        weightInput.value = '';
        bioInput.value = '';

        submitBtn.onclick = async () => {
            const name = nameInput.value.trim();

            try {
                const playerData = {};
                if (name) playerData.name = name;
                const ig = instagramInput.value.trim();
                if (ig) playerData.instagram_handle = ig;
                const hometown = hometownInput.value.trim();
                if (hometown) playerData.hometown = hometown;
                if (heightInput.value) playerData.height_inches = parseInt(heightInput.value);
                if (weightInput.value) playerData.weight_lbs = parseInt(weightInput.value);
                const bio = bioInput.value.trim();
                if (bio) playerData.bio = bio;

                const response = await apiClient.createPlayer(playerData);
                console.log("Player created:", response);
                alert(`Player "${response.name || response.instagram_handle || 'New Player'}" created successfully!`);
                modal.style.display = 'none';

                await this.dataManager.fetchPlayerData();
                this.statsTableRenderer.render();
            } catch (err) {
                alert("Failed to create player: " + err.message);
            }
        };

        cancelBtn.onclick = () => {
            modal.style.display = 'none';
        };

        modal.onclick = (e) => {
            if (e.target === modal) modal.style.display = 'none';
        };
    }

    showEditPlayerModal(player) {
        const modal = document.getElementById('edit-player-modal');
        if (!modal) return alert('Edit modal not found');

        document.getElementById('edit-player-name-input').value = player.name || '';
        document.getElementById('edit-player-instagram-input').value = player.instagram_handle || '';
        document.getElementById('edit-player-hometown-input').value = player.hometown || '';
        document.getElementById('edit-player-height-input').value = player.height_inches || '';
        document.getElementById('edit-player-weight-input').value = player.weight_lbs || '';
        document.getElementById('edit-player-bio-input').value = player.bio || '';

        modal.style.display = 'flex';

        const submitBtn = document.getElementById('edit-player-submit');
        const cancelBtn = document.getElementById('edit-player-cancel');

        submitBtn.onclick = null;
        cancelBtn.onclick = null;

        submitBtn.onclick = async () => {
            const updates = {};
            const name = document.getElementById('edit-player-name-input').value.trim();
            if (name) updates.name = name;
            const ig = document.getElementById('edit-player-instagram-input').value.trim();
            if (ig) updates.instagram_handle = ig;
            const hometown = document.getElementById('edit-player-hometown-input').value.trim();
            if (hometown) updates.hometown = hometown;
            const hVal = document.getElementById('edit-player-height-input').value;
            if (hVal) updates.height_inches = parseInt(hVal);
            const wVal = document.getElementById('edit-player-weight-input').value;
            if (wVal) updates.weight_lbs = parseInt(wVal);
            const bio = document.getElementById('edit-player-bio-input').value.trim();
            if (bio) updates.bio = bio;

            try {
                await apiClient.updatePlayer(player._id, updates);
                modal.style.display = 'none';
                this.loadPlayerManagementTable();
                await this.dataManager.fetchPlayerData();
                this.statsTableRenderer.render();
            } catch (err) {
                alert('Failed to update player: ' + err.message);
            }
        };

        cancelBtn.onclick = () => {
            modal.style.display = 'none';
        };

        modal.onclick = (e) => {
            if (e.target === modal) modal.style.display = 'none';
        };
    }

    async loadPlayerManagementTable() {
        try {
            const response = await apiClient.searchPlayers();
            const playersList = Array.isArray(response) ? response : (response.players || response || []);

            if (!playersList || playersList.length === 0) {
                console.warn('No players found');
                return;
            }

            if (!this.tableBody) return;

            this.tableBody.innerHTML = '';

            playersList.forEach(player => {
                const row = document.createElement('tr');
                const gp = player.overall_stats?.games_played || 0;
                const hometown = player.hometown || 'Unknown';

                const displayName = player.instagram_handle || player.name || '—';
                row.innerHTML = `
                    <td style="font-weight: bold;">${displayName}</td>
                    <td>${hometown}</td>
                    <td>${gp}</td>
                    <td>
                        <button class="delete-button" data-player-id="${player._id}" data-player-name="${displayName}">
                            🗑️ Delete
                        </button>
                    </td>
                `;
                this.tableBody.appendChild(row);

                row.querySelector('.delete-button').addEventListener('click', async (e) => {
                    const playerId = e.target.getAttribute('data-player-id');
                    const playerName = e.target.getAttribute('data-player-name');

                    if (confirm(`Are you sure you want to delete "${playerName}"? This action cannot be undone.`)) {
                        try {
                            await apiClient.deletePlayer(playerId);
                            alert(`Player "${playerName}" has been deleted.`);
                            this.loadPlayerManagementTable();

                            await this.dataManager.fetchPlayerData();
                            this.statsTableRenderer.render();
                        } catch (err) {
                            alert("Failed to delete player: " + err.message);
                        }
                    }
                });

                if (apiClient.getUser()) {
                    const editBtn = document.createElement('button');
                    editBtn.className = 'action-button';
                    editBtn.style.marginRight = '8px';
                    editBtn.textContent = '✏️ Edit';
                    editBtn.setAttribute('data-player-id', player._id);
                    editBtn.addEventListener('click', () => {
                        this.showEditPlayerModal(player);
                    });
                    const actionCell = row.querySelector('td:last-child');
                    if (actionCell) actionCell.insertBefore(editBtn, actionCell.firstChild);
                }
            });

        } catch (error) {
            console.error('Error loading player management table:', error);
        }
    }
}

// ==================== APPLICATION CONTROLLER ====================
class BasketballApp {
    constructor() {
        this.dataManager = new DataManager();
        this.themeManager = new ThemeManager();
        this.navigationManager = new NavigationManager();
        this.statsTableRenderer = new StatsTableRenderer(this.dataManager, this.navigationManager);
        this.authManager = new AuthManager(() => this.handleAuthChange());
        this.playerManager = new PlayerManager(this.dataManager, this.statsTableRenderer);
        
        this.init();
    }

    async init() {
        // Setup global goToStatsList function for back button
        window.goToStatsList = () => this.navigationManager.goToStatsList();

        // Load initial data
        await this.dataManager.fetchPlayerData();
        this.statsTableRenderer.render();
    }

    handleAuthChange() {
        this.authManager.updateUI();
        if (!this.authManager.isAuthenticated()) {
            this.navigationManager.goToStatsList();
        }
    }
}

// ==================== INITIALIZATION ====================
document.addEventListener('DOMContentLoaded', () => {
    const app = new BasketballApp();
});
