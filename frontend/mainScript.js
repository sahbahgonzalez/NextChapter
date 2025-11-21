       
       // --- DATA SECTION: EASILY REMOVABLE DUMMY DATA ---
        
        /* * TO REMOVE DUMMY DATA: 
        * 1. Replace the entire 'playerData' array with your actual data source (e.g., an API call or a database query).
        * 2. Remove the 'renderStatsTable()' call at the end of the script, 
        * or modify it to process your new data structure.
        */
        const playerData = [
            { player: 'Azul', gp: 12, pts: 25.4, fg_pct: 48.7, p3_pct: 38.1, ft_pct: 88.5, ast: 6.2, reb: 4.1, blk: 0.5, stl: 1.8 },
            { player: 'Rhea Sky', gp: 10, pts: 18.9, fg_pct: 44.2, p3_pct: 32.5, ft_pct: 80.0, ast: 4.5, reb: 3.8, blk: 0.2, stl: 1.1 },
            { player: 'Jasper Stone', gp: 15, pts: 8.5, fg_pct: 55.1, p3_pct: 25.0, ft_pct: 75.2, ast: 1.0, reb: 9.3, blk: 1.4, stl: 0.4 },
            { player: 'Nova Light', gp: 11, pts: 15.0, fg_pct: 40.5, p3_pct: 41.3, ft_pct: 90.1, ast: 7.1, reb: 2.5, blk: 0.1, stl: 2.0 },
            { player: 'Ethan King', gp: 14, pts: 5.2, fg_pct: 60.0, p3_pct: 0.0, ft_pct: 65.0, ast: 0.8, reb: 10.5, blk: 2.5, stl: 0.3 },
            { player: 'Chloe Green', gp: 9, pts: 22.1, fg_pct: 46.5, p3_pct: 35.5, ft_pct: 85.0, ast: 5.5, reb: 5.5, blk: 0.7, stl: 1.5 }
        ];

        // Define the stats structure for the detail grid
        const detailStatsMap = {
            pts: { label: 'Points', formatter: (val) => val.toFixed(1) },
            fg_pct: { label: 'FG%', formatter: (val) => val.toFixed(1) + '%' },
            p3_pct: { label: '3P%', formatter: (val) => val.toFixed(1) + '%' },
            ft_pct: { label: 'FT%', formatter: (val) => val.toFixed(1) + '%' },
            ast: { label: 'Assists', formatter: (val) => val.toFixed(1) },
            reb: { label: 'Rebounds', formatter: (val) => val.toFixed(1) },
            blk: { label: 'Blocks', formatter: (val) => val.toFixed(1) },
            stl: { label: 'Steals', formatter: (val) => val.toFixed(1) },
        };

        // --- DOM Elements ---
        const toggleButton = document.getElementById('mode-toggle');
        const body = document.body;
        const signInButton = document.getElementById('sign-in-button');
        const mainNav = document.getElementById('main-nav');
        const hiddenNavLinks = document.querySelectorAll('.hidden-nav-link');
        const hiddenSections = document.querySelectorAll('.hidden-section'); 
        
        const statsSection = document.getElementById('stats');
        const profileDetailSection = document.getElementById('player-profile-detail');
        const statsTableBody = document.getElementById('stats-table-body');
        const searchInput = document.getElementById('player-search');
        const statsTable = document.getElementById('stats-table');
        const detailStatGrid = document.getElementById('detail-stat-grid');


        // --- 0. NAVIGATION & VISIBILITY CONTROL ---
        
        // Function to transition back to the main stats list
        window.goToStatsList = function() {
            statsSection.style.display = 'block';
            profileDetailSection.style.display = 'none';
            document.getElementById('profiles').style.display = 'none';

            // Reset main navigation active state to Stats
            mainNav.querySelectorAll('a').forEach(a => a.classList.remove('active'));
            mainNav.querySelector('a[href="#stats"]').classList.add('active');
        }
        
        // Function to display the player profile detail view
        function displayPlayerProfile(player) {
            // 1. Hide all main sections
            statsSection.style.display = 'none';
            document.getElementById('profiles').style.display = 'none'; 

            // 2. Show the profile detail section
            profileDetailSection.style.display = 'block';

            // 3. Populate header
            document.getElementById('profile-player-name').textContent = player.player;
            document.getElementById('profile-tagline').textContent = `Tracked Games: ${player.gp}`;

            // 4. Populate stat cards
            detailStatGrid.innerHTML = '';
            
            Object.keys(detailStatsMap).forEach(key => {
                const statInfo = detailStatsMap[key];
                const value = player[key];
                
                const card = document.createElement('div');
                card.className = 'stat-card';
                
                // Determine if the stat is a percentage for styling
                const valueClass = key.includes('_pct') ? 'stat-value percentage' : 'stat-value';
                
                card.innerHTML = `
                    <div class="stat-label">${statInfo.label}</div>
                    <div class="${valueClass}">${statInfo.formatter(value)}</div>
                `;
                detailStatGrid.appendChild(card);
            });
            
            // 5. Update main navigation (no active tab when on a detail page)
            mainNav.querySelectorAll('a').forEach(a => a.classList.remove('active'));
        }

        // --- 1. DATA RENDERING FUNCTION ---
        function renderStatsTable() {
            if (!statsTableBody) return;
            statsTableBody.innerHTML = ''; // Clear existing content
            
            playerData.forEach(player => {
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
                statsTableBody.appendChild(row);

                // Add click listener to the player name cell
                row.querySelector('.player-name-link').addEventListener('click', (e) => {
                    displayPlayerProfile(player);
                });
            });
        }


        // --- 2. DARK MODE TOGGLE SCRIPT (Unchanged) ---
        const toggleIcon = '☀️'; 
        const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
        const savedMode = localStorage.getItem('theme');

        if (savedMode === 'dark' || (savedMode === null && prefersDark)) {
            body.classList.add('dark-mode');
            toggleButton.innerHTML = '🌙'; 
        } else {
            toggleButton.innerHTML = toggleIcon;
        }

        toggleButton.addEventListener('click', () => {
            if (body.classList.contains('dark-mode')) {
                body.classList.remove('dark-mode');
                localStorage.setItem('theme', 'light');
                toggleButton.innerHTML = toggleIcon;
            } else {
                body.classList.add('dark-mode');
                localStorage.setItem('theme', 'dark');
                toggleButton.innerHTML = '🌙';
            }
        });


        // --- 3. SIGN-IN SIMULATION (REVISED LOGIC for Public Stats) ---
        // --- LOGIN / LOGOUT WITH API ---
        function showLoginModal() {
            const modal = document.getElementById('login-modal');
            modal.style.display = 'flex'; // show modal

            const emailInput = document.getElementById('login-email');
            const passInput = document.getElementById('login-password');
            const submitBtn = document.getElementById('login-submit');
            const cancelBtn = document.getElementById('login-cancel');

            // Clear previous values
            emailInput.value = '';
            passInput.value = '';

            // Handle login
            submitBtn.onclick = async () => {
                const email = emailInput.value.trim();
                const password = passInput.value.trim();
                if (!email || !password) return alert('Please enter both fields.');

                try {
                const data = await apiClient.login(email, password);
                console.log("Logged in:", data.user);
                modal.style.display = 'none';
                updateUIAfterLogin();
                } catch (err) {
                alert("Login failed: " + err.message);
                }
            };

            // Handle cancel
            cancelBtn.onclick = () => {
                modal.style.display = 'none';
            };

            // Close modal when clicking outside
            modal.onclick = (e) => {
                if (e.target === modal) modal.style.display = 'none';
            };
        }

        // Step 2: Update UI after login/logout
        function updateUIAfterLogin() {
            const user = apiClient.getUser();
            if (user) {
                // Show authorized sections
                document.querySelectorAll('.hidden-nav-link').forEach(link => link.style.display = 'inline-block');
                // We keep .hidden-section hidden by default, JS navigation will show it
                signInButton.textContent = `Sign Out`; // Removed email for brevity
            } else {
                // Hide authorized sections
                document.querySelectorAll('.hidden-nav-link').forEach(link => link.style.display = 'none');
                document.querySelectorAll('.hidden-section').forEach(section => section.style.display = 'none');
                signInButton.textContent = 'Sign In';
                goToStatsList(); // Go back to stats if logged out from an admin page
            }
        }

        // Step 3: Handle sign in/out click
        signInButton.addEventListener('click', async () => {
            const token = apiClient.getToken();
            if (token) {
                localStorage.removeItem('authToken');
                localStorage.removeItem('user');
                console.log('Logged out manually');
                updateUIAfterLogin();
            } else {
                showLoginModal();
            }
        });
        
        // --- 4. PLAYER SEARCH FUNCTIONALITY ---
        if (searchInput && statsTable) {
            searchInput.addEventListener('keyup', function() {
                const filter = searchInput.value.toUpperCase();
                const tr = statsTable.getElementsByTagName('tbody')[0].getElementsByTagName('tr'); 

                for (let i = 0; i < tr.length; i++) {
                    const td = tr[i].getElementsByTagName('td')[0]; // Target the Player Name column
                    if (td) {
                        const txtValue = td.textContent || td.innerText;
                        if (txtValue.toUpperCase().indexOf(filter) > -1) {
                            tr[i].style.display = "";
                        } else {
                            tr[i].style.display = "none";
                        }
                    }
                }
            });
        }

        // --- 5. PROFILE SUB-NAVIGATION (for logged-in section) ---
        const profileSubNav = document.getElementById('profile-sub-nav');
        const playerManagerDiv = document.getElementById('player-manager');
        const gameHistoryDiv = document.getElementById('game-history');
        const managePlayersLink = profileSubNav ? profileSubNav.querySelector('a[href="#player-manager"]') : null;


        if (profileSubNav) {
             profileSubNav.querySelectorAll('a').forEach(link => {
                link.addEventListener('click', function(e) {
                    e.preventDefault();
                    const targetId = this.getAttribute('href').substring(1);

                    profileSubNav.querySelectorAll('a').forEach(a => a.classList.remove('active'));
                    this.classList.add('active');

                    if (playerManagerDiv) playerManagerDiv.style.display = 'none';
                    if (gameHistoryDiv) gameHistoryDiv.style.display = 'none';

                    document.getElementById(targetId).style.display = 'block';
                });
            });

            if (managePlayersLink) managePlayersLink.click(); 
        }

        // --- 6. Main Navigation Logic ---
        mainNav.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', function(e) {
                e.preventDefault(); 

                // Only handle navigation if not already on the detailed profile page
                if (profileDetailSection.style.display === 'block') {
                    // Clicking a main nav link should return to the list view first
                    if (this.getAttribute('href') === '#stats') {
                        goToStatsList();
                        return;
                    }
                }


                // Deactivate all main links
                mainNav.querySelectorAll('a').forEach(a => a.classList.remove('active'));
                this.classList.add('active');

                // Hide all switchable sections
                document.getElementById('stats').style.display = 'none';
                document.getElementById('profiles').style.display = 'none';
                profileDetailSection.style.display = 'none';


                // Show the target section (if not hidden by auth state)
                const targetId = this.getAttribute('href').substring(1);
                const targetElement = document.getElementById(targetId);
                
                if (targetElement) {
                   // Only show if it's the public stats page OR if it's not a hidden section (i.e., user is logged in)
                   if (targetId === 'stats' || !targetElement.classList.contains('hidden-section')) {
                       targetElement.style.display = 'block';
                   } else if (apiClient.getUser()) {
                       // Failsafe for logged-in user
                       targetElement.style.display = 'block';
                   }
                }
            });
        });
        
        // --- INITIALIZATION ---
        renderStatsTable(); // Render player data on load
        updateUIAfterLogin(); // Set initial sign-in state