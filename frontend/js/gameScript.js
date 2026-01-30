/**
 * Global timer and session flags
 * These track game timer state and session-level flags.
 */
let timerInterval;
let secondsElapsed = 0;
let isPaused = false;
let isTimeout = false;
let pendingShotType = null;
let isGameRunning = false;

const timerDisplay = document.getElementById("gameTimer");
const startGameBtn = document.getElementById("startGameBtn");
const pauseGameBtn = document.getElementById("pauseGameBtn");
const startErrorEl = document.getElementById("startError");
/**
 * Free Throw modal references
 */
const ftModal = {
  overlay: document.getElementById('ftModal'),
  makeBtn: document.getElementById('ftMakeBtn'),
  missBtn: document.getElementById('ftMissBtn'),
  closeBtn: document.getElementById('ftCloseBtn'),
};
let pendingFTTeam = null;

/**
 * Display an error near the Start button
 * @param {string} msg
 */
function showStartError(msg = "") {
  if (startErrorEl) {
    startErrorEl.textContent = msg;
    startErrorEl.style.display = msg ? 'block' : 'none';
  }
}

/**
 * Runtime game context
 * Holds identifiers and assigned players for both sides.
 */
const gameContext = {
  gameId: null,
  players: { A: null, B: null },
  teams: { team_a: [], team_b: [] }
};

let currentAssignTeam = null;
let searchDebounce = null;
// lastClickPos now tracked on GameController instance
let lastCursorPos = null; // Track cursor position over court for hotkeys

/**
 * Format seconds to MM:SS
 * @param {number} seconds
 * @returns {string}
 */
function formatTime(seconds) {
  const mins = Math.floor(seconds / 60).toString().padStart(2, "0");
  const secs = (seconds % 60).toString().padStart(2, "0");
  return `${mins}:${secs}`;
}

/** Start the game timer */
function startTimer() {
  timerInterval = setInterval(() => {
    secondsElapsed++;
    timerDisplay.textContent = formatTime(secondsElapsed);
  }, 1000);
}

/** Stop the game timer */
function stopTimer() {
  clearInterval(timerInterval);
}

/**
 * Check whether both players are assigned
 * @returns {boolean}
 */
function playersAssigned() {
  return !!(gameContext.players.A && gameContext.players.B);
}

// Placeholder - actual handlers will be set up in DOMContentLoaded

/**
 * Load an existing game by id and prepare UI
 * @param {string} gameId
 */
async function loadGameData(gameId) {
  try {
    const game = await apiClient.getGameById(gameId);
    console.log("Game data from API:", game);

    gameContext.gameId = game._id || gameId;
    gameContext.teams = game.teams || { team_a: [], team_b: [] };

    // Store loaded game for reference
    gameContext.loadedGame = game;

    // Helper: find player details by ID
    function findPlayerById(playerId) {
      if (!game.all_player_ids) return null;
      return game.all_player_ids.find(p =>
        String(p._id) === String(playerId) || String(p) === String(playerId)
      );
    }

    // Load players from team assignments
    const teamAButton = document.getElementById("teamAAssignBtn");
    const teamBButton = document.getElementById("teamBAssignBtn");

    // Get player IDs from teams (handle both array of IDs and array of objects)
    const teamAPlayerIds = game.teams?.team_a || [];
    const teamBPlayerIds = game.teams?.team_b || [];

    // Assign Team A player
    if (teamAPlayerIds.length > 0) {
      const playerAId = teamAPlayerIds[0]?._id || teamAPlayerIds[0];
      const playerA = findPlayerById(playerAId);
      if (playerA) {
        gameContext.players.A = playerA;
        if (teamAButton) {
          teamAButton.textContent = playerA.name || 'Player A';
        }
      }
    }

    // Assign Team B player
    if (teamBPlayerIds.length > 0) {
      const playerBId = teamBPlayerIds[0]?._id || teamBPlayerIds[0];
      const playerB = findPlayerById(playerBId);
      if (playerB) {
        gameContext.players.B = playerB;
        if (teamBButton) {
          teamBButton.textContent = playerB.name || 'Player B';
        }
      }
    }

    // Load scores from the game
    const teamAScore = game.final_score?.team_a || 0;
    const teamBScore = game.final_score?.team_b || 0;
    document.getElementById("teamAScore").textContent = teamAScore;
    document.getElementById("teamBScore").textContent = teamBScore;

    // Check if both players are assigned
    if (gameContext.players.A && gameContext.players.B) {
      if (startGameBtn) startGameBtn.disabled = false;
      showStartError("");
    } else {
      if (startGameBtn) startGameBtn.disabled = true;
      showStartError("Assign a player to both teams before starting the game.");
    }

    // Show game type
    const gt = document.getElementById("gameType");
    if (gt) gt.textContent = game.game_type ? `${game.game_type} game` : "1v1 game to 50pts";

    // Return the game data for further processing (like loading events)
    return game;
  } catch (error) {
    console.error("Failed to load game data:", error);
    return null;
  }
}

/**
 * Restore game events (shots) from loaded game data onto the court
 * @param {object} game - The loaded game object
 */
function restoreGameEvents(game) {
  const shotMarkersEl = document.getElementById('shot_markers');
  if (!shotMarkersEl) return;

  // Clear existing markers
  shotMarkersEl.innerHTML = '';

  // Process each event
  game.events.forEach(event => {
    // Only process shots and free throws with location data
    if ((event.type === 'shot' || event.type === 'free_throw') &&
        event.location && typeof event.location.x === 'number' && typeof event.location.y === 'number') {

      // Determine which team this shot belongs to
      const teamKey = event.team === 'team_a' ? 'A' : 'B';
      const player = gameContext.players[teamKey];

      // Determine shot type based on points
      let shotType = '2pt';
      if (event.type === 'free_throw' || event.points === 1) {
        shotType = 'ft';
      } else if (event.points === 3) {
        shotType = '3pt';
      }

      const result = event.made ? 'made' : 'missed';

      // Create marker element
      const marker = document.createElement('div');
      marker.classList.add('shot-marker');
      marker.classList.add(result === 'made' ? 'made' : 'missed');
      marker.classList.add(teamKey === 'A' ? 'team-a' : 'team-b');

      // Add player initials to the marker
      const initials = player?.name ? player.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : teamKey;
      marker.textContent = initials;
      marker.style.fontSize = '10px';
      marker.style.fontWeight = 'bold';
      marker.style.display = 'flex';
      marker.style.alignItems = 'center';
      marker.style.justifyContent = 'center';
      marker.style.color = result === 'made' ? '#fff' : '#333';

      marker.title = `${player?.name || teamKey} - ${shotType.toUpperCase()} ${result}`;
      marker.style.left = `${event.location.x}%`;
      marker.style.top = `${event.location.y}%`;
      marker.dataset.player = player?.name || teamKey;
      marker.dataset.shotType = shotType;
      marker.dataset.result = result;

      shotMarkersEl.appendChild(marker);
    }
  });

  console.log(`Restored ${shotMarkersEl.children.length} shot markers from game events`);
}

// Navigation setup
function setupNavigation() {
    const signInBtn = document.getElementById('nav-sign-in');
    const signOutBtn = document.getElementById('nav-sign-out');
    const logGameLink = document.getElementById('nav-log-game-link');

    if (apiClient.getToken()) {
        if (signInBtn) signInBtn.style.display = 'none';
        if (signOutBtn) signOutBtn.style.display = 'block';
        if (logGameLink) logGameLink.style.display = 'inline-block';
    } else {
        if (signInBtn) signInBtn.style.display = 'block';
        if (signOutBtn) signOutBtn.style.display = 'none';
        if (logGameLink) logGameLink.style.display = 'none';
    }

    if (signInBtn) {
        signInBtn.addEventListener('click', () => {
            showLoginModal();
        });
    }

    if (signOutBtn) {
        signOutBtn.addEventListener('click', () => {
            localStorage.removeItem('authToken');
            localStorage.removeItem('user');
            window.location.href = 'index.html';
        });
    }
}

function showLoginModal() {
    const modal = document.getElementById('login-modal');
    if (!modal) return;
    modal.style.display = 'flex';

    const emailInput = document.getElementById('login-email');
    const passInput = document.getElementById('login-password');
    const submitBtn = document.getElementById('login-submit');
    const cancelBtn = document.getElementById('login-cancel');

    if (emailInput) emailInput.value = '';
    if (passInput) passInput.value = '';

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

    if (submitBtn) {
        submitBtn.onclick = handleSubmit;
    }

    const handleKeyPress = (e) => {
        if (e.key === 'Enter') {
            handleSubmit();
        }
    };

    if (emailInput) emailInput.onkeypress = handleKeyPress;
    if (passInput) passInput.onkeypress = handleKeyPress;

    if (cancelBtn) {
        cancelBtn.onclick = () => {
            modal.style.display = 'none';
        };
    }

    modal.onclick = (e) => {
        if (e.target === modal) modal.style.display = 'none';
    };
}

// Run once on DOM load
/** Initialize event handlers and local state on DOM ready */
document.addEventListener("DOMContentLoaded", async () => {
  setupNavigation();
  const urlParams = new URLSearchParams(window.location.search);
  // Support both 'id' and 'gameId' parameters for backwards compatibility
  const gameId = urlParams.get("id") || urlParams.get("gameId");

  // Only load an existing game if explicitly provided, otherwise start fresh
  if (gameId) {
    const game = await loadGameData(gameId);
    // If game loaded successfully and has events, restore them on the court
    if (game && game.events && game.events.length > 0) {
      restoreGameEvents(game);
    }
  } else {
    // Start fresh - no game loaded, user must assign players and start
    gameContext.gameId = null;
    gameContext.players.A = null;
    gameContext.players.B = null;
    // Ensure button is disabled until both players are assigned
    if (startGameBtn) startGameBtn.disabled = true;
    showStartError("Assign a player to both teams before starting the game.");
  }

  // ---- Local stat tracking for 1v1 view ----
  /**
   * Local stat state per team
   */
  const state = {
    active: 'A',
    A: { twoPA: 0, twoPM: 0, threePA: 0, threePM: 0, ftA: 0, ftM: 0, fouls: 0 },
    B: { twoPA: 0, twoPM: 0, threePA: 0, threePM: 0, ftA: 0, ftM: 0, fouls: 0 },
    history: [],
    shotHistory: {
      A: [],  // Store all of player A's shots
      B: []   // Store all of player B's shots
    }
  };

  // If we loaded an existing game, restore the stats from events
  if (gameContext.loadedGame && gameContext.loadedGame.events) {
    const events = gameContext.loadedGame.events;
    events.forEach(event => {
      const teamKey = event.team === 'team_a' ? 'A' : 'B';
      const team = state[teamKey];

      if (event.type === 'shot') {
        if (event.points === 3) {
          team.threePA += 1;
          if (event.made) team.threePM += 1;
        } else {
          team.twoPA += 1;
          if (event.made) team.twoPM += 1;
        }
      } else if (event.type === 'free_throw') {
        team.ftA += 1;
        if (event.made) team.ftM += 1;
      } else if (event.type === 'foul') {
        team.fouls += 1;
      }
    });
    console.log('Restored stats from loaded game:', { A: state.A, B: state.B });
  }

  /**
   * UI element references
   */
  const els = {
    // team A
    a: {
      pts: document.getElementById('teamAPts'),
      s3: document.getElementById('teamA3pt'),
      s2: document.getElementById('teamA2pt'),
      ft: document.getElementById('teamAft'),
      fouls: document.getElementById('teamAFouls'),
      ftBtn: document.getElementById('teamAFtBtn'),
      score: document.getElementById('teamAScore'),
      foulPlus: document.getElementById('teamAFoulPlus'),
      panel: document.getElementById('team_a_players')
    },
    // team B
    b: {
      pts: document.getElementById('teamBPts'),
      s3: document.getElementById('teamB3pt'),
      s2: document.getElementById('teamB2pt'),
      ft: document.getElementById('teamBft'),
      fouls: document.getElementById('teamBFouls'),
      ftBtn: document.getElementById('teamBFtBtn'),
      score: document.getElementById('teamBScore'),
      foulPlus: document.getElementById('teamBFoulPlus'),
      panel: document.getElementById('team_b_players')
    },
    activeSideLabel: document.getElementById('activeSideLabel'),
    selectA: document.getElementById('selectTeamA'),
    selectB: document.getElementById('selectTeamB'),
    undo: document.getElementById('undoStatBtn')
  };

  // DEBUG: Log if all elements were found
  console.log('Element check:', {
    teamAPts: !!els.a.pts,
    teamAScore: !!els.a.score,
    teamBPts: !!els.b.pts,
    teamBScore: !!els.b.score,
    allElements: els
  });

  /** Selector buttons for assigning players */
  const selectorEls = {
    A: {
      assignBtn: document.getElementById('teamAAssignBtn')
    },
    B: {
      assignBtn: document.getElementById('teamBAssignBtn')
    }
  };

  /** Player search/assign modal elements */
  const modalEls = {
    overlay: document.getElementById('playerModal'),
    searchInput: document.getElementById('modalSearchInput'),
    results: document.getElementById('modalResults'),
    createName: document.getElementById('modalCreateName'),
    createIg: document.getElementById('modalCreateIg'),
    createBtn: document.getElementById('modalCreateBtn'),
    close: document.getElementById('modalClose'),
    title: document.getElementById('modalTitle'),
    message: document.getElementById('modalMessage')
  };

  /** Shot confirmation modal elements */
  const shotModal = {
    overlay: document.getElementById('shotModal'),
    title: document.getElementById('shotModalTitle'),
    info: document.getElementById('shotModalInfo'),
    close: document.getElementById('shotModalClose'),
    makeBtn: document.getElementById('shotMakeBtn'),
    missBtn: document.getElementById('shotMissBtn')
  };

  const shotMarkersEl = document.getElementById('shot_markers');

  /**
   * Add a shot marker on the court overlay
   * @param {'A'|'B'} teamKey
   * @param {'2pt'|'3pt'|'ft'} shotType
   * @param {'made'|'missed'} result
   * @param {{xPct:number,yPct:number}} pos
   */
  function addShotMarker(teamKey, shotType, result, pos) {
    if (!shotMarkersEl || !pos) return;
    const marker = document.createElement('div');
    marker.classList.add('shot-marker');
    marker.classList.add(result === 'made' ? 'made' : 'missed');
    marker.classList.add(teamKey === 'A' ? 'team-a' : 'team-b');
    
    // Add player initials to the marker
    const player = gameContext.players[teamKey];
    const initials = player?.name ? player.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : teamKey;
    marker.textContent = initials;
    marker.style.fontSize = '10px';
    marker.style.fontWeight = 'bold';
    marker.style.display = 'flex';
    marker.style.alignItems = 'center';
    marker.style.justifyContent = 'center';
    marker.style.color = result === 'made' ? '#fff' : '#333';
    
    marker.title = `${player?.name || teamKey} - ${shotType.toUpperCase()} ${result}`;
    marker.style.left = `${pos.xPct}%`;
    marker.style.top = `${pos.yPct}%`;
    marker.dataset.player = player?.name || teamKey;
    marker.dataset.shotType = shotType;
    marker.dataset.result = result;
    shotMarkersEl.appendChild(marker);
    
    // Log to shot history
    logShotToHistory(teamKey, shotType, result);
    
    return marker;
  }

  /**
   * Append a shot entry to the active player's shot history
   * and update the Latest Shot panel.
   * @param {'A'|'B'} teamKey
   * @param {'2pt'|'3pt'|'ft'} shotType
   * @param {'made'|'missed'} result
   */
  function logShotToHistory(teamKey, shotType, result) {
    const shotLog = document.getElementById('shot_log');
    if (!shotLog) return;
    
    const player = gameContext.players[teamKey];
    const playerName = player?.name || `Team ${teamKey}`;
    
    // Use game timer instead of clock time
    const mins = Math.floor(secondsElapsed / 60);
    const secs = secondsElapsed % 60;
    const gameTime = `${mins}:${secs.toString().padStart(2, '0')}`;
    
    const shotEmoji = result === 'made' ? '✓' : '✗';
    const shotLabel = shotType === '3pt' ? '3PT' : shotType === '2pt' ? '2PT' : 'FT';
    const resultColor = result === 'made' ? '#4caf50' : '#f44336';
    
    // Store shot in history for this player
    const shotEntry = {
      player: playerName,
      teamKey: teamKey,
      shotType: shotLabel,
      result: result,
      gameTime: gameTime,
      resultColor: resultColor,
      shotEmoji: shotEmoji,
      timestamp: secondsElapsed,
      type: 'shot'
    };
    
    state.shotHistory[teamKey].push(shotEntry);
    
    // Update display for current active player
    updateShotLogDisplay();
  }

  function logFoulToHistory(teamKey) {
    const player = gameContext.players[teamKey];
    const playerName = player?.name || `Team ${teamKey}`;
    
    // Use game timer
    const mins = Math.floor(secondsElapsed / 60);
    const secs = secondsElapsed % 60;
    const gameTime = `${mins}:${secs.toString().padStart(2, '0')}`;
    
    // Store foul in history for this player
    const foulEntry = {
      player: playerName,
      teamKey: teamKey,
      shotType: 'FOUL',
      result: 'recorded',
      gameTime: gameTime,
      resultColor: '#ff6f00',
      shotEmoji: '🚫',
      timestamp: secondsElapsed,
      type: 'foul'
    };
    
    state.shotHistory[teamKey].push(foulEntry);
    
    // Update display for current active player
    updateShotLogDisplay();
  }

  function updateShotLogDisplay() {
    const shotLog = document.getElementById('shot_log');
    if (!shotLog) return;
    
    // Get shots for active player
    const activeShots = state.shotHistory[state.active];
    
    // Clear the log
    shotLog.innerHTML = '';
    
    if (activeShots.length === 0) {
      shotLog.innerHTML = '<div style="padding: 15px; text-align: center; color: #999; font-size: 12px;">No shots yet</div>';
      return;
    }
    
    // Show only the most recent shot
    const mostRecentShot = activeShots[activeShots.length - 1];
    
    const logEntry = document.createElement('div');
    logEntry.style.padding = '12px';
    logEntry.style.fontSize = '14px';
    logEntry.style.display = 'flex';
    logEntry.style.flexDirection = 'column';
    logEntry.style.gap = '8px';
    logEntry.style.backgroundColor = mostRecentShot.teamKey === 'A' ? '#e3f2fd' : '#fff3e0';
    logEntry.style.borderRadius = '3px';
    
    const playerColor = mostRecentShot.teamKey === 'A' ? '#1f6eeb' : '#ff8800';
    const resultColor = mostRecentShot.resultColor;
    
    logEntry.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <strong style="color: ${playerColor}; font-size: 15px;">${mostRecentShot.player}</strong>
        <span style="color: ${resultColor}; font-weight: bold; font-size: 20px;">${mostRecentShot.shotEmoji}</span>
      </div>
      <div style="display: flex; justify-content: space-between; align-items: center; color: #666;">
        <span>${mostRecentShot.shotType}</span>
        <span style="color: #999; font-size: 12px;">${mostRecentShot.gameTime}</span>
      </div>
    `;
    
    shotLog.appendChild(logEntry);
  }

  function closeModal() {
    if (modalEls.overlay) modalEls.overlay.style.display = 'none';
    if (modalEls.results) modalEls.results.classList.remove('show');
    currentAssignTeam = null;
  }

  function openShotModal(shotType) {
    pendingShotType = shotType;
    if (shotModal.overlay) shotModal.overlay.style.display = 'flex';
    if (shotModal.title) shotModal.title.textContent = 'Log Shot';
    if (shotModal.info) shotModal.info.textContent = `${shotType === '3pt' ? '3PT' : '2PT'} attempt`;
  }

  function closeShotModal() {
    pendingShotType = null;
    if (shotModal.overlay) shotModal.overlay.style.display = 'none';
  }

  function openModal(teamKey) {
    currentAssignTeam = teamKey;
    if (modalEls.overlay) modalEls.overlay.style.display = 'flex';
    if (modalEls.title) modalEls.title.textContent = `Assign Player (${teamKey})`;
    if (modalEls.message) modalEls.message.textContent = '';
    if (modalEls.results) modalEls.results.innerHTML = '';
    if (modalEls.searchInput) {
      modalEls.searchInput.value = '';
      modalEls.searchInput.focus();
    }
    if (modalEls.createName) modalEls.createName.value = '';
    if (modalEls.createIg) modalEls.createIg.value = '';
  }

  function setPlayer(teamKey, player) {
    if (!player || !player._id) return;
    
    // Check if player is already assigned to the other team
    const otherTeamKey = teamKey === 'A' ? 'B' : 'A';
    const otherTeamPlayer = gameContext.players[otherTeamKey];
    
    if (otherTeamPlayer && otherTeamPlayer._id === player._id) {
      alert(`${player.name} is already assigned to Team ${otherTeamKey}. A player cannot be on both teams.`);
      return;
    }
    
    // Store full player object for display purposes
    gameContext.players[teamKey] = player;
    const btn = selectorEls[teamKey].assignBtn;
    if (btn) {
      btn.textContent = player.name || 'Unnamed';
    }
    // Enable start button if both teams have players
    if (playersAssigned()) {
      startGameBtn.disabled = false;
      showStartError("");
    }
    updateUI(); // Update display to show player name
    closeModal();
  }

  function setActive(teamKey) {
    state.active = teamKey;
    updateUI();
    updateShotLogDisplay();  // Update shot log to show this player's shots
  }

  function renderResults(teamKey, players) {
    const box = modalEls.results;
    if (!box) return;
    box.innerHTML = '';
    box.classList.remove('show');
    if (!players || players.length === 0) {
      box.textContent = 'No players found';
      return;
    }
    players.forEach(p => {
      const btn = document.createElement('button');
      btn.className = 'dropdown-item-btn';
      
      // Check if player is already assigned to the other team
      const otherTeamKey = teamKey === 'A' ? 'B' : 'A';
      const otherTeamPlayer = gameContext.players[otherTeamKey];
      const isAlreadyAssigned = otherTeamPlayer && otherTeamPlayer._id === p._id;
      
      if (isAlreadyAssigned) {
        btn.textContent = `${p.name || p.instagram_handle || 'Unnamed'} (already on Team ${otherTeamKey})`;
        btn.disabled = true;
        btn.style.opacity = '0.5';
        btn.style.cursor = 'not-allowed';
        btn.title = `This player is already assigned to Team ${otherTeamKey}`;
      } else {
        btn.textContent = p.name || p.instagram_handle || 'Unnamed';
        btn.title = p.instagram_handle ? `@${p.instagram_handle}` : '';
        btn.addEventListener('click', () => setPlayer(teamKey, p));
      }
      box.appendChild(btn);
    });
    box.classList.add('show');
  }

  async function searchAndRender(teamKey, term) {
    const value = term ?? modalEls.searchInput?.value ?? '';
    try {
      const players = await apiClient.searchPlayers(value);
      renderResults(teamKey, players);
    } catch (err) {
      console.error('Search players failed', err);
      renderResults(teamKey, []);
    }
  }

  async function createAndAssign(teamKey) {
    const name = modalEls.createName?.value?.trim();
    const ig = modalEls.createIg?.value?.trim();
    if (!name) {
      alert('Please enter a name');
      return;
    }
    try {
      const player = await apiClient.createPlayer({ name, instagram_handle: ig });
      setPlayer(teamKey, player);
      if (modalEls.message) {
        modalEls.message.textContent = `Created and assigned ${player.name || 'player'}`;
      }
    } catch (err) {
      console.error('Create player failed', err);
      if (modalEls.message) {
        modalEls.message.textContent = 'Create failed (admin auth required).';
      }
    }
  }

  function getPlayerId(teamKey) {
    const player = teamKey === 'A' ? gameContext.players.A : gameContext.players.B;
    // Handle both storing full object or just ID
    return player ? (player._id || player) : null;
  }

  async function persistGameEvent(teamKey, eventPayload, pos = null) {
    if (!gameContext.gameId) {
      throw new Error('No active game ID. Please start a new game.');
    }
    const playerId = getPlayerId(teamKey);
    if (!playerId) {
      throw new Error(`No player assigned for Team ${teamKey}. Please assign a player first.`);
    }
    const teamField = teamKey === 'A' ? 'team_a' : 'team_b';
    const payload = { ...eventPayload, player_id: playerId, team: teamField };

    // Include location data if position is available (for shots and free throws)
    if (pos && (eventPayload.type === 'shot' || eventPayload.type === 'free_throw')) {
      payload.location = {
        x: pos.xPct,
        y: pos.yPct
      };
    }

    const response = await apiClient.addGameEvent(gameContext.gameId, payload);
    return response;
  }

  function computePoints(t) {
    return t.twoPM * 2 + t.threePM * 3 + t.ftM * 1;
  }

  function getFGPercentage(t) {
    const totalFG = t.twoPA + t.threePA;
    if (totalFG === 0) return 0;
    return ((t.twoPM + t.threePM) / totalFG * 100).toFixed(1);
  }

  function get3PPercentage(t) {
    if (t.threePA === 0) return 0;
    return (t.threePM / t.threePA * 100).toFixed(1);
  }

  function getFTPercentage(t) {
    if (t.ftA === 0) return 0;
    return (t.ftM / t.ftA * 100).toFixed(1);
  }

  function updateUI() {
    const A = state.A, B = state.B;
    const playerNameA = gameContext.players.A ? (gameContext.players.A.name || 'Player A') : 'Not Assigned';
    const playerNameB = gameContext.players.B ? (gameContext.players.B.name || 'Player B') : 'Not Assigned';
    
    const pointsA = computePoints(A);
    const pointsB = computePoints(B);
    
    console.log(`Updating UI - A: ${pointsA} pts, B: ${pointsB} pts`);
    console.log(`Elements check - els.a.pts:`, els.a.pts, 'els.b.pts:',  els.b.pts);
    
    // Team A stats
    if (els.a.pts) els.a.pts.textContent = pointsA;
    if (els.a.s3) els.a.s3.textContent = `${A.threePM}/${A.threePA} (${get3PPercentage(A)}%)`;
    if (els.a.s2) els.a.s2.textContent = `${A.twoPM}/${A.twoPA} (${getFGPercentage(A)}%)`;
    if (els.a.ft) els.a.ft.textContent = `${A.ftM}/${A.ftA} (${getFTPercentage(A)}%)`;
    if (els.a.fouls) els.a.fouls.textContent = A.fouls;
    if (els.a.score) els.a.score.textContent = pointsA;

    // Team B stats
    if (els.b.pts) els.b.pts.textContent = pointsB;
    if (els.b.s3) els.b.s3.textContent = `${B.threePM}/${B.threePA} (${get3PPercentage(B)}%)`;
    if (els.b.s2) els.b.s2.textContent = `${B.twoPM}/${B.twoPA} (${getFGPercentage(B)}%)`;
    if (els.b.ft) els.b.ft.textContent = `${B.ftM}/${B.ftA} (${getFTPercentage(B)}%)`;
    if (els.b.fouls) els.b.fouls.textContent = B.fouls;
    if (els.b.score) els.b.score.textContent = pointsB;

    // Show which player's stats are being tracked
    const activePlayer = state.active === 'A' ? playerNameA : playerNameB;
    if (els.activeSideLabel) els.activeSideLabel.textContent = `Recording Stats: ${activePlayer} (Team ${state.active})`;

    // possession highlight
    if (els.a.panel) els.a.panel.classList.toggle('poss-active', state.active === 'A');
    if (els.b.panel) els.b.panel.classList.toggle('poss-active', state.active === 'B');

    // highlight active team selection button
    if (els.selectA) els.selectA.classList.toggle('active', state.active === 'A');
    if (els.selectB) els.selectB.classList.toggle('active', state.active === 'B');

    // Apply blue gradient only to the active player's button (if assigned)
    if (selectorEls.A.assignBtn) {
      selectorEls.A.assignBtn.classList.toggle('assigned', state.active === 'A' && gameContext.players.A);
    }
    if (selectorEls.B.assignBtn) {
      selectorEls.B.assignBtn.classList.toggle('assigned', state.active === 'B' && gameContext.players.B);
    }

    // Show only the active player's shot markers on the court
    const teamAMarkers = document.querySelectorAll('.shot-marker.team-a');
    const teamBMarkers = document.querySelectorAll('.shot-marker.team-b');
    teamAMarkers.forEach(marker => marker.style.display = state.active === 'A' ? 'flex' : 'none');
    teamBMarkers.forEach(marker => marker.style.display = state.active === 'B' ? 'flex' : 'none');
  }

  async function applyShot(teamKey, shotType, result, markerEl = null, pos = null) {
    // Check if game is paused or in timeout
    if (isPaused || isTimeout) {
      if (markerEl) markerEl.remove(); // Clean up marker if it was created
      return;
    }

    // Check if a player is assigned before recording the shot
    const playerId = getPlayerId(teamKey);
    if (!playerId) {
      alert(`Please assign a player for Team ${teamKey} before recording stats!`);
      if (markerEl) markerEl.remove(); // Clean up marker if it was created
      return;
    }

    const team = teamKey === 'A' ? state.A : state.B;
    const change = { kind: 'shot', team: teamKey, shotType, result, marker: markerEl };
    if (shotType === '3pt') {
      team.threePA += 1;
      if (result === 'made') team.threePM += 1;
    } else if (shotType === '2pt') {
      team.twoPA += 1;
      if (result === 'made') team.twoPM += 1;
    } else if (shotType === 'ft') {
      team.ftA += 1;
      if (result === 'made') team.ftM += 1;
    }
    state.history.push(change);

    // DEBUG: Log the state after update
    console.log(`Shot applied - Team: ${teamKey}, Type: ${shotType}, Result: ${result}`, team);
    console.log(`Current state:`, JSON.stringify({ A: state.A, B: state.B }));

    updateUI();

    try {
      const baseEvent = shotType === 'ft'
        ? { type: 'free_throw', made: result === 'made', points: 1 }
        : { type: 'shot', made: result === 'made', points: shotType === '3pt' ? 3 : 2 };
      await persistGameEvent(teamKey, baseEvent, pos);
      console.log(`Shot recorded: ${teamKey} - ${shotType} - ${result}${pos ? ` at (${pos.xPct.toFixed(1)}%, ${pos.yPct.toFixed(1)}%)` : ''}`);
    } catch (err) {
      // Keep local stats even if network/database fails so the UI does not reset
      console.error('Failed to persist shot event (keeping local stats)', err);
      alert(`Saved locally. Network/database error: ${err.message}`);
    }

    // If shot was missed, switch to the other player (turnover)
    if (result === 'missed') {
      const otherTeam = teamKey === 'A' ? 'B' : 'A';
      setActive(otherTeam);
    }
  }

  async function incrementFoul(teamKey) {
    // Check if game is paused or in timeout
    if (isPaused || isTimeout) {
      return;
    }

    // Check if a player is assigned before recording the foul
    const playerId = getPlayerId(teamKey);
    if (!playerId) {
      alert(`Please assign a player for Team ${teamKey} before recording stats!`);
      return;
    }

    const team = teamKey === 'A' ? state.A : state.B;
    team.fouls += 1;
    state.history.push({ kind: 'foul', team: teamKey });
    
    // Log foul to shot history for display
    logFoulToHistory(teamKey);
    
    updateUI();

    try {
      await persistGameEvent(teamKey, { type: 'foul' });
      console.log(`Foul recorded: ${teamKey}`);
    } catch (err) {
      // Keep local stats even if network/database fails so the UI does not reset
      console.error('Failed to persist foul event (keeping local stats)', err);
      alert(`Saved locally. Network/database error: ${err.message}`);
    }
  }

  function openFtModal(teamKey) {
    if (!isGameRunning) {
      showStartError('Assign both players and press Start Game.');
      return;
    }
    if (isPaused || isTimeout) {
      return;
    }
    if (!playersAssigned()) {
      showStartError('Assign a player to both teams before starting the game.');
      return;
    }
    pendingFTTeam = teamKey;
    if (ftModal.overlay) ftModal.overlay.style.display = 'flex';
  }

  function closeFtModal() {
    pendingFTTeam = null;
    if (ftModal.overlay) ftModal.overlay.style.display = 'none';
  }

  function inferShotTypeFromClick(evt) {
    const img = document.getElementById('court_image');
    if (!img) return '2pt';
    const rect = img.getBoundingClientRect();
    const x = (evt.clientX - rect.left) / rect.width;  // 0..1
    const y = (evt.clientY - rect.top) / rect.height;  // 0..1
    const halfBandPx = 143;  // half of 286px band width
    const centerX = rect.left + rect.width * 0.5;
    const dxPx = Math.abs(evt.clientX - centerX);
    // Rectangular band depth: 50% of height minus 60px
    const twoPtDepthPx = rect.height * 0.50 - 60;
    const inRectBand = (evt.clientY - rect.top) <= twoPtDepthPx && dxPx <= halfBandPx;
    // Circular cap: start at 25% minus 107px, radius 143px
    const radiusPx = halfBandPx;
    const circleTopPx = rect.top + rect.height * 0.25 - 107;
    const circleCenterYPx = circleTopPx + radiusPx;
    const dyPx = evt.clientY - circleCenterYPx;
    const distSq = dxPx * dxPx + dyPx * dyPx;
    const inTopCircle = distSq <= radiusPx * radiusPx;
    if (inRectBand || inTopCircle) return '2pt';
    return '3pt';
  }
  
  // Helper to infer shot type from cursor position (percentages)
  function inferShotTypeFromPos(pos) {
    if (!pos) return '2pt';
    const img = document.getElementById('court_image');
    if (!img) return '2pt';
    const rect = img.getBoundingClientRect();
    
    // Convert percentage back to pixel coordinates
    const clientX = rect.left + (pos.xPct / 100) * rect.width;
    const clientY = rect.top + (pos.yPct / 100) * rect.height;
    
    const halfBandPx = 143;
    const centerX = rect.left + rect.width * 0.5;
    const dxPx = Math.abs(clientX - centerX);
    const twoPtDepthPx = rect.height * 0.50 - 60;
    const inRectBand = (clientY - rect.top) <= twoPtDepthPx && dxPx <= halfBandPx;
    const radiusPx = halfBandPx;
    const circleTopPx = rect.top + rect.height * 0.25 - 107;
    const circleCenterYPx = circleTopPx + radiusPx;
    const dyPx = clientY - circleCenterYPx;
    const distSq = dxPx * dxPx + dyPx * dyPx;
    const inTopCircle = distSq <= radiusPx * radiusPx;
    if (inRectBand || inTopCircle) return '2pt';
    return '3pt';
  }

  function undoLast() {
    if (!isGameRunning) {
      showStartError('Assign both players and press Start Game.');
      return;
    }
    const last = state.history.pop();
    if (!last) return;
    // Remove marker if this was a court-click shot
    if (last.kind === 'shot' && last.marker) {
      last.marker.remove();
    }
    if (last.kind === 'shot') {
      const team = last.team === 'A' ? state.A : state.B;
      if (last.shotType === '3pt') {
        if (team.threePA > 0) team.threePA -= 1;
        if (last.result === 'made' && team.threePM > 0) team.threePM -= 1;
      } else if (last.shotType === '2pt') {
        if (team.twoPA > 0) team.twoPA -= 1;
        if (last.result === 'made' && team.twoPM > 0) team.twoPM -= 1;
      } else if (last.shotType === 'ft') {
        if (team.ftA > 0) team.ftA -= 1;
        if (last.result === 'made' && team.ftM > 0) team.ftM -= 1;
      }
    } else if (last.kind === 'foul') {
      const team = last.team === 'A' ? state.A : state.B;
      if (team.fouls > 0) team.fouls -= 1;
    }
    updateUI();
  }

  // Wire buttons
  if (els.selectA) els.selectA.addEventListener('click', () => { if (!isGameRunning) return showStartError('Assign both players and press Start Game.'); controller.setActive('A'); });
  if (els.selectB) els.selectB.addEventListener('click', () => { if (!isGameRunning) return showStartError('Assign both players and press Start Game.'); controller.setActive('B'); });
  if (els.a.foulPlus) els.a.foulPlus.addEventListener('click', () => { if (!isGameRunning) return showStartError('Assign both players and press Start Game.'); controller.incrementFoul('A'); });
  if (els.b.foulPlus) els.b.foulPlus.addEventListener('click', () => { if (!isGameRunning) return showStartError('Assign both players and press Start Game.'); controller.incrementFoul('B'); });
  if (els.a.ftBtn) els.a.ftBtn.addEventListener('click', () => controller.openFtModal('A'));
  if (els.b.ftBtn) els.b.ftBtn.addEventListener('click', () => controller.openFtModal('B'));
  if (els.undo) els.undo.addEventListener('click', () => controller.undoLast());

  // FT modal wiring
  if (ftModal.makeBtn) ftModal.makeBtn.addEventListener('click', () => {
    if (!pendingFTTeam) return;
    // FT modal doesn't have court position, so pass null
    controller.applyShot(pendingFTTeam, 'ft', 'made', null, null);
    closeFtModal();
  });
  if (ftModal.missBtn) ftModal.missBtn.addEventListener('click', () => {
    if (!pendingFTTeam) return;
    // FT modal doesn't have court position, so pass null
    controller.applyShot(pendingFTTeam, 'ft', 'missed', null, null);
    closeFtModal();
  });
  if (ftModal.closeBtn) ftModal.closeBtn.addEventListener('click', closeFtModal);
  if (ftModal.overlay) ftModal.overlay.addEventListener('click', (e) => {
    if (e.target === ftModal.overlay) closeFtModal();
  });

  // Timeout modal setup
  const timeoutModal = {
    overlay: document.getElementById('timeoutModal'),
    playerABtn: document.getElementById('timeoutPlayerABtn'),
    playerBBtn: document.getElementById('timeoutPlayerBBtn'),
    closeBtn: document.getElementById('timeoutCloseBtn'),
  };

  const timeoutAlertModal = document.getElementById('timeoutAlertModal');
  const timeoutAlertClose = document.getElementById('timeoutAlertClose');
  let timeoutAlertTimer = null;

  const gameInProgressModal = document.getElementById('gameInProgressModal');
  const gameInProgressClose = document.getElementById('gameInProgressClose');
  let gameInProgressTimer = null;

  function showTimeoutAlert() {
    if (timeoutAlertModal) {
      timeoutAlertModal.style.display = 'flex';
      // Clear any existing timer
      if (timeoutAlertTimer) clearTimeout(timeoutAlertTimer);
      timeoutAlertTimer = setTimeout(() => {
        timeoutAlertModal.style.display = 'none';
      }, 3000);
    }
  }

  function closeTimeoutAlert() {
    if (timeoutAlertModal) {
      timeoutAlertModal.style.display = 'none';
      if (timeoutAlertTimer) {
        clearTimeout(timeoutAlertTimer);
        timeoutAlertTimer = null;
      }
    }
  }

  if (timeoutAlertClose) {
    timeoutAlertClose.addEventListener('click', closeTimeoutAlert);
  }

  function showGameInProgressAlert() {
    if (gameInProgressModal) {
      gameInProgressModal.style.display = 'flex';
      // Clear any existing timer
      if (gameInProgressTimer) clearTimeout(gameInProgressTimer);
      gameInProgressTimer = setTimeout(() => {
        gameInProgressModal.style.display = 'none';
      }, 3000);
    }
  }

  function closeGameInProgressAlert() {
    if (gameInProgressModal) {
      gameInProgressModal.style.display = 'none';
      if (gameInProgressTimer) {
        clearTimeout(gameInProgressTimer);
        gameInProgressTimer = null;
      }
    }
  }

  if (gameInProgressClose) {
    gameInProgressClose.addEventListener('click', closeGameInProgressAlert);
  }

  const timeoutBtn = document.getElementById('timeoutBtn');

  function closeTimeoutModal() {
    if (timeoutModal.overlay) timeoutModal.overlay.style.display = 'none';
  }

  function openTimeoutModal() {
    console.log('openTimeoutModal called, overlay:', timeoutModal.overlay);
    if (timeoutModal.overlay) {
      // Update button text to show player names
      if (timeoutModal.playerABtn) {
        timeoutModal.playerABtn.textContent = gameContext.players.A?.name || 'Player A';
      }
      if (timeoutModal.playerBBtn) {
        timeoutModal.playerBBtn.textContent = gameContext.players.B?.name || 'Player B';
      }
      timeoutModal.overlay.style.display = 'flex';
      console.log('Timeout modal display set to flex');
    } else {
      console.error('Timeout modal overlay not found');
    }
  }

  if (timeoutBtn) {
    timeoutBtn.addEventListener('click', () => {
      console.log('Timeout button clicked, isGameRunning:', isGameRunning);
      if (!isGameRunning) {
        showStartError('Assign both players and press Start Game.');
        return;
      }
      if (isTimeout) {
        showTimeoutAlert();
        return;
      }
      console.log('Opening timeout modal');
      openTimeoutModal();
    });
  } else {
    console.error('Timeout button not found in DOM');
  }

  if (timeoutModal.playerABtn) {
    timeoutModal.playerABtn.addEventListener('click', () => {
      const playerName = gameContext.players.A?.name || 'Team A';
      console.log('Timeout called by', playerName);
      state.history.push({ type: 'timeout', team: 'A', timestamp: new Date() });
      // Block stats but keep timer running
      isTimeout = true;
      if (pauseGameBtn) pauseGameBtn.innerHTML = 'Resume <span class="hotkey-hint">P</span>';
      closeTimeoutModal();
      updateUI();
    });
  }

  if (timeoutModal.playerBBtn) {
    timeoutModal.playerBBtn.addEventListener('click', () => {
      const playerName = gameContext.players.B?.name || 'Team B';
      console.log('Timeout called by', playerName);
      state.history.push({ type: 'timeout', team: 'B', timestamp: new Date() });
      // Block stats but keep timer running
      isTimeout = true;
      if (pauseGameBtn) pauseGameBtn.innerHTML = 'Resume <span class="hotkey-hint">P</span>';
      closeTimeoutModal();
      updateUI();
    });
  }

  if (timeoutModal.closeBtn) timeoutModal.closeBtn.addEventListener('click', closeTimeoutModal);
  if (timeoutModal.overlay) timeoutModal.overlay.addEventListener('click', (e) => {
    if (e.target === timeoutModal.overlay) closeTimeoutModal();
  });

  // Player modal wiring
  ['A', 'B'].forEach(key => {
    const set = selectorEls[key];
    if (set.assignBtn) set.assignBtn.addEventListener('click', () => {
      if (isGameRunning) {
        showGameInProgressAlert();
        return;
      }
      openModal(key);
    });
  });

  if (modalEls.close) modalEls.close.addEventListener('click', closeModal);
  if (modalEls.overlay) modalEls.overlay.addEventListener('click', (e) => {
    if (e.target === modalEls.overlay) closeModal();
  });
  if (modalEls.createBtn) modalEls.createBtn.addEventListener('click', () => {
    if (!currentAssignTeam) return;
    createAndAssign(currentAssignTeam);
  });
  if (modalEls.searchInput) modalEls.searchInput.addEventListener('input', (e) => {
    if (!currentAssignTeam) return;
    const term = e.target.value;
    if (searchDebounce) clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => searchAndRender(currentAssignTeam, term), 200);
    if (modalEls.results) modalEls.results.classList.add('show');
  });
  if (modalEls.searchInput) modalEls.searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && currentAssignTeam) {
      e.preventDefault();
      searchAndRender(currentAssignTeam, modalEls.searchInput.value);
    }
  });
  if (modalEls.searchInput) modalEls.searchInput.addEventListener('focus', () => {
    if (!currentAssignTeam) return;
    if (searchDebounce) clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => searchAndRender(currentAssignTeam, modalEls.searchInput.value || ''), 50);
    if (modalEls.results) modalEls.results.classList.add('show');
  });
  if (modalEls.searchInput) modalEls.searchInput.addEventListener('blur', (e) => {
    // Delay to allow click on result buttons to register first
    setTimeout(() => {
      if (modalEls.results) modalEls.results.classList.remove('show');
    }, 150);
  });

  document.querySelectorAll('#shot_buttons .btn-stat').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!isGameRunning) { showStartError('Assign both players and press Start Game.'); return; }
      if (isPaused || isTimeout) return;
      const shot = btn.getAttribute('data-shot');
      const result = btn.getAttribute('data-result');

      // For "auto" shot buttons, require cursor to be over court
      if (shot === 'auto') {
        if (!lastCursorPos) {
          alert('Hover cursor over court to record shot location');
          return;
        }
        const pos = { ...lastCursorPos }; // Copy position before it changes
        const shotType = inferShotTypeFromPos(pos);
        const markerEl = addShotMarker(controller.getActiveTeam(), shotType, result, pos);
        controller.applyShot(controller.getActiveTeam(), shotType, result, markerEl, pos);
      } else {
        // No position for manual shot type buttons
        controller.applyShot(controller.getActiveTeam(), shot, result, null, null);
      }
    });
  });

  const courtImg = document.getElementById('court_image');
  if (courtImg) {
    // Mouse click hotkeys: Left click = Make, Right click = Miss
    // These are handled in mousedown, so don't use the click event
    courtImg.addEventListener('mousedown', (evt) => {
      if (!isGameRunning) return;
      if (isPaused || isTimeout) return;

      // Left click = Make (button 0)
      if (evt.button === 0) {
        evt.preventDefault();
        const shotType = inferShotTypeFromClick(evt);
        const result = 'made';

        if (lastCursorPos) {
          const pos = { ...lastCursorPos }; // Copy position before it changes
          const markerEl = addShotMarker(controller.getActiveTeam(), shotType, result, pos);
          controller.applyShot(controller.getActiveTeam(), shotType, result, markerEl, pos);
        }
      }
      // Right click = Miss (button 2)
      else if (evt.button === 2) {
        evt.preventDefault();
        const shotType = inferShotTypeFromClick(evt);
        const result = 'missed';

        if (lastCursorPos) {
          const pos = { ...lastCursorPos }; // Copy position before it changes
          const markerEl = addShotMarker(controller.getActiveTeam(), shotType, result, pos);
          controller.applyShot(controller.getActiveTeam(), shotType, result, markerEl, pos);
        }
      }
    });
    
    // Track mouse position over court for hotkey shot recording
    courtImg.addEventListener('mousemove', (evt) => {
      const rect = courtImg.getBoundingClientRect();
      lastCursorPos = {
        xPct: ((evt.clientX - rect.left) / rect.width) * 100,
        yPct: ((evt.clientY - rect.top) / rect.height) * 100
      };
    });
    
    // Clear position when mouse leaves court
    courtImg.addEventListener('mouseleave', () => {
      lastCursorPos = null;
    });
    
    // Disable context menu on court image to allow right-click shots
    courtImg.addEventListener('contextmenu', (evt) => {
      evt.preventDefault();
    });
  }

  // Shot modal wiring
  if (shotModal.close) shotModal.close.addEventListener('click', closeShotModal);
  if (shotModal.overlay) shotModal.overlay.addEventListener('click', (e) => {
    if (e.target === shotModal.overlay) closeShotModal();
  });
  if (shotModal.makeBtn) shotModal.makeBtn.addEventListener('click', () => {
    if (!pendingShotType) return;
    const pos = controller.lastClickPos ? { ...controller.lastClickPos } : null;
    const markerEl = addShotMarker(controller.getActiveTeam(), pendingShotType, 'made', pos);
    controller.applyShot(controller.getActiveTeam(), pendingShotType, 'made', markerEl, pos);
    controller.lastClickPos = null;
    closeShotModal();
  });
  if (shotModal.missBtn) shotModal.missBtn.addEventListener('click', () => {
    if (!pendingShotType) return;
    const pos = controller.lastClickPos ? { ...controller.lastClickPos } : null;
    const markerEl = addShotMarker(controller.getActiveTeam(), pendingShotType, 'missed', pos);
    controller.applyShot(controller.getActiveTeam(), pendingShotType, 'missed', markerEl, pos);
    controller.lastClickPos = null;
    closeShotModal();
  });

  // Allow clicking team panels to set possession
  if (els.a.panel) els.a.panel.addEventListener('click', () => { if (!isGameRunning) return showStartError('Assign both players and press Start Game.'); controller.setActive('A'); });
  if (els.b.panel) els.b.panel.addEventListener('click', () => { if (!isGameRunning) return showStartError('Assign both players and press Start Game.'); controller.setActive('B'); });

  // Post-game modal handlers
  const postGameModal = document.getElementById('postGameModal');
  const postGameClose = document.getElementById('postGameClose');
  const downloadPdfBtn = document.getElementById('downloadPdfBtn');
  const newGameBtn = document.getElementById('newGameBtn');

  if (postGameClose) {
    postGameClose.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      console.log('Close button clicked');
      if (postGameModal) postGameModal.style.display = 'none';
      resetGameUI();
    });
  }

  if (postGameModal) {
    postGameModal.addEventListener('click', (e) => {
      if (e.target === postGameModal) {
        console.log('Overlay clicked');
        postGameModal.style.display = 'none';
        resetGameUI();
      }
    });
  }

  if (downloadPdfBtn) {
    downloadPdfBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      controller.generateGamePDF();
    });
  }

  if (newGameBtn) {
    newGameBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      console.log('New Game button clicked');
      // Close modal and reset for new game
      if (postGameModal) postGameModal.style.display = 'none';
      resetGameUI();
    });
  }

  function generateGamePDF() {
    if (!gameContext.finalStats) return;
    
    const stats = gameContext.finalStats;
    const result = gameContext.finalResult;
    const teamAStats = result.teams.team_a;
    const teamBStats = result.teams.team_b;
    
    // Calculate shooting percentages
    const calcPercentage = (made, attempted) => {
      if (!attempted) return "0%";
      return Math.round((made / attempted) * 100) + "%";
    };
    
    const teamAFG = calcPercentage((teamAStats.two_pm || 0) + (teamAStats.three_pm || 0), (teamAStats.two_pa || 0) + (teamAStats.three_pa || 0));
    const teamBFG = calcPercentage((teamBStats.two_pm || 0) + (teamBStats.three_pm || 0), (teamBStats.two_pa || 0) + (teamBStats.three_pa || 0));
    const teamA3PT = calcPercentage(teamAStats.three_pm || 0, teamAStats.three_pa || 0);
    const teamB3PT = calcPercentage(teamBStats.three_pm || 0, teamBStats.three_pa || 0);
    const teamAFT = calcPercentage(teamAStats.ft_m || 0, teamAStats.ft_a || 0);
    const teamBFT = calcPercentage(teamBStats.ft_m || 0, teamBStats.ft_a || 0);
    
    // Calculate possessions/attempts
    const teamAAttempts = (teamAStats.two_pa || 0) + (teamAStats.three_pa || 0) + (teamAStats.ft_a || 0);
    const teamBAttempts = (teamBStats.two_pa || 0) + (teamBStats.three_pa || 0) + (teamBStats.ft_a || 0);
    
    // Get player photos (if available)
    const playerAPhoto = gameContext.players.A?.photo_url || '';
    const playerBPhoto = gameContext.players.B?.photo_url || '';
    
    // Create HTML content for PDF
    const htmlContent = `
      <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 900px;">
        <h1 style="text-align: center; color: #0e2b62; margin-bottom: 20px; font-size: 28px;">Game Statistics Report</h1>
        
        <!-- Player Photos & Final Score -->
        <div style="display: flex; align-items: center; justify-content: space-around; margin-bottom: 25px; gap: 20px;">
          <div style="text-align: center; flex: 1;">
            ${playerAPhoto ? `<img src="${playerAPhoto}" style="width: 120px; height: 120px; border-radius: 50%; border: 3px solid #1f6eeb; object-fit: cover; margin-bottom: 10px;">` : ''}
            <div style="color: #1f6eeb; font-weight: bold; font-size: 16px; margin-bottom: 5px;">${stats.teamAName}</div>
            <div style="font-size: 48px; font-weight: bold; color: #1f6eeb;">${stats.teamAScore}</div>
          </div>
          
          <div style="text-align: center; font-size: 24px; color: #666; font-weight: bold;">vs</div>
          
          <div style="text-align: center; flex: 1;">
            ${playerBPhoto ? `<img src="${playerBPhoto}" style="width: 120px; height: 120px; border-radius: 50%; border: 3px solid #ff8800; object-fit: cover; margin-bottom: 10px;">` : ''}
            <div style="color: #ff8800; font-weight: bold; font-size: 16px; margin-bottom: 5px;">${stats.teamBName}</div>
            <div style="font-size: 48px; font-weight: bold; color: #ff8800;">${stats.teamBScore}</div>
          </div>
        </div>
        
        <!-- Winner & Duration -->
        <div style="background: #e8f0ff; padding: 15px; border-left: 4px solid #0e2b62; margin-bottom: 25px;">
          <div style="text-align: center;">
            <div style="font-size: 18px; font-weight: bold; color: #0e2b62; margin-bottom: 5px;">
              ${stats.winner === 'Tie' ? "Game Ended in a Tie!" : `${stats.winner} Wins!`}
            </div>
            <div style="font-size: 14px; color: #555;">Duration: ${formatTime(stats.duration)} | ${new Date().toLocaleDateString()}</div>
          </div>
        </div>

        <!-- Shooting Percentages Summary -->
        <div style="background: #fff3e0; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
          <h3 style="margin: 0 0 15px 0; color: #0e2b62; font-size: 16px;">Shooting Efficiency</h3>
          <div style="display: flex; gap: 30px;">
            <div style="flex: 1;">
              <h4 style="color: #1f6eeb; margin: 0 0 10px 0; font-size: 14px;">${stats.teamAName}</h4>
              <table style="width: 100%; font-size: 12px;">
                <tr style="border-bottom: 1px solid #ddd;">
                  <td style="padding: 5px;">FG%</td>
                  <td style="padding: 5px; text-align: right; font-weight: bold;">${teamAFG}</td>
                </tr>
                <tr style="border-bottom: 1px solid #ddd;">
                  <td style="padding: 5px;">3PT%</td>
                  <td style="padding: 5px; text-align: right; font-weight: bold;">${teamA3PT}</td>
                </tr>
                <tr>
                  <td style="padding: 5px;">FT%</td>
                  <td style="padding: 5px; text-align: right; font-weight: bold;">${teamAFT}</td>
                </tr>
              </table>
            </div>
            <div style="flex: 1;">
              <h4 style="color: #ff8800; margin: 0 0 10px 0; font-size: 14px;">${stats.teamBName}</h4>
              <table style="width: 100%; font-size: 12px;">
                <tr style="border-bottom: 1px solid #ddd;">
                  <td style="padding: 5px;">FG%</td>
                  <td style="padding: 5px; text-align: right; font-weight: bold;">${teamBFG}</td>
                </tr>
                <tr style="border-bottom: 1px solid #ddd;">
                  <td style="padding: 5px;">3PT%</td>
                  <td style="padding: 5px; text-align: right; font-weight: bold;">${teamB3PT}</td>
                </tr>
                <tr>
                  <td style="padding: 5px;">FT%</td>
                  <td style="padding: 5px; text-align: right; font-weight: bold;">${teamBFT}</td>
                </tr>
              </table>
            </div>
          </div>
        </div>

        <!-- Shot Chart (Simplified) -->
        <div style="background: #f5f5f5; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
          <h3 style="margin: 0 0 15px 0; color: #0e2b62; font-size: 16px;">Shot Chart</h3>
          <div style="display: flex; gap: 20px;">
            <div style="flex: 1; text-align: center;">
              <div style="height: 200px; background: linear-gradient(135deg, #f0f0f0 0%, #ffffff 100%); border: 2px solid #1f6eeb; border-radius: 4px; position: relative; margin-bottom: 10px; display: flex; align-items: center; justify-content: center;">
                <div style="text-align: center;">
                  <div style="font-size: 32px; font-weight: bold; color: #1f6eeb;">${(teamAStats.two_pm || 0) + (teamAStats.three_pm || 0)}</div>
                  <div style="font-size: 12px; color: #666;">Makes</div>
                </div>
              </div>
              <div style="font-size: 12px; color: #555;">Shot Attempts: ${teamAAttempts}</div>
            </div>
            <div style="flex: 1; text-align: center;">
              <div style="height: 200px; background: linear-gradient(135deg, #fff8e1 0%, #fffde7 100%); border: 2px solid #ff8800; border-radius: 4px; position: relative; margin-bottom: 10px; display: flex; align-items: center; justify-content: center;">
                <div style="text-align: center;">
                  <div style="font-size: 32px; font-weight: bold; color: #ff8800;">${(teamBStats.two_pm || 0) + (teamBStats.three_pm || 0)}</div>
                  <div style="font-size: 12px; color: #666;">Makes</div>
                </div>
              </div>
              <div style="font-size: 12px; color: #555;">Shot Attempts: ${teamBAttempts}</div>
            </div>
          </div>
        </div>

        <!-- Detailed Stats Table -->
        <div style="background: #f5f5f5; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
          <h3 style="margin: 0 0 15px 0; color: #0e2b62; font-size: 16px;">Detailed Statistics</h3>
          <div style="display: flex; gap: 20px;">
            <div style="flex: 1;">
              <h4 style="color: #1f6eeb; margin: 0 0 10px 0; font-size: 14px;">${stats.teamAName}</h4>
              <table style="width: 100%; font-size: 12px; border-collapse: collapse;">
                <tr style="background: #e3f2fd; border-bottom: 1px solid #ddd;">
                  <td style="padding: 8px; font-weight: bold;">3PT</td>
                  <td style="padding: 8px; text-align: right;">${teamAStats.three_pm || 0}/${teamAStats.three_pa || 0}</td>
                </tr>
                <tr style="border-bottom: 1px solid #ddd;">
                  <td style="padding: 8px; font-weight: bold;">2PT</td>
                  <td style="padding: 8px; text-align: right;">${teamAStats.two_pm || 0}/${teamAStats.two_pa || 0}</td>
                </tr>
                <tr style="border-bottom: 1px solid #ddd;">
                  <td style="padding: 8px; font-weight: bold;">FT</td>
                  <td style="padding: 8px; text-align: right;">${teamAStats.ft_m || 0}/${teamAStats.ft_a || 0}</td>
                </tr>
                <tr>
                  <td style="padding: 8px; font-weight: bold;">Fouls</td>
                  <td style="padding: 8px; text-align: right;">${teamAStats.fouls || 0}</td>
                </tr>
              </table>
            </div>
            <div style="flex: 1;">
              <h4 style="color: #ff8800; margin: 0 0 10px 0; font-size: 14px;">${stats.teamBName}</h4>
              <table style="width: 100%; font-size: 12px; border-collapse: collapse;">
                <tr style="background: #fff3e0; border-bottom: 1px solid #ddd;">
                  <td style="padding: 8px; font-weight: bold;">3PT</td>
                  <td style="padding: 8px; text-align: right;">${teamBStats.three_pm || 0}/${teamBStats.three_pa || 0}</td>
                </tr>
                <tr style="border-bottom: 1px solid #ddd;">
                  <td style="padding: 8px; font-weight: bold;">2PT</td>
                  <td style="padding: 8px; text-align: right;">${teamBStats.two_pm || 0}/${teamBStats.two_pa || 0}</td>
                </tr>
                <tr style="border-bottom: 1px solid #ddd;">
                  <td style="padding: 8px; font-weight: bold;">FT</td>
                  <td style="padding: 8px; text-align: right;">${teamBStats.ft_m || 0}/${teamBStats.ft_a || 0}</td>
                </tr>
                <tr>
                  <td style="padding: 8px; font-weight: bold;">Fouls</td>
                  <td style="padding: 8px; text-align: right;">${teamBStats.fouls || 0}</td>
                </tr>
              </table>
            </div>
          </div>
        </div>

        <!-- Game Timeline Stats (First Half vs Second Half) -->
        <div style="background: #f0f4ff; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
          <h3 style="margin: 0 0 15px 0; color: #0e2b62; font-size: 16px;">Game Timeline</h3>
          <div style="display: flex; gap: 20px;">
            <div style="flex: 1;">
              <h4 style="color: #1f6eeb; margin: 0 0 10px 0; font-size: 13px;">${stats.teamAName}</h4>
              <div style="font-size: 12px;">
                <div style="padding: 5px 0; border-bottom: 1px solid #ddd;"><strong>Total Possessions:</strong> ${teamAAttempts}</div>
                <div style="padding: 5px 0;"><strong>Shooting Accuracy:</strong> ${calcPercentage((teamAStats.two_pm || 0) + (teamAStats.three_pm || 0), teamAAttempts)}</div>
              </div>
            </div>
            <div style="flex: 1;">
              <h4 style="color: #ff8800; margin: 0 0 10px 0; font-size: 13px;">${stats.teamBName}</h4>
              <div style="font-size: 12px;">
                <div style="padding: 5px 0; border-bottom: 1px solid #ddd;"><strong>Total Possessions:</strong> ${teamBAttempts}</div>
                <div style="padding: 5px 0;"><strong>Shooting Accuracy:</strong> ${calcPercentage((teamBStats.two_pm || 0) + (teamBStats.three_pm || 0), teamBAttempts)}</div>
              </div>
            </div>
          </div>
        </div>

        <div style="text-align: center; margin-top: 30px; padding-top: 15px; border-top: 2px solid #ddd; color: #666; font-size: 11px;">
          <p style="margin: 5px 0;">Generated on ${new Date().toLocaleString()}</p>
          <p style="margin: 5px 0;">Next Chapter - Basketball Stats Tracker</p>
          <p style="margin: 5px 0; font-style: italic;">Official Game Record</p>
        </div>
      </div>
    `;

    // Generate PDF using html2pdf
    const opt = {
      margin: 10,
      filename: `game-stats-${new Date().getTime()}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2 },
      jsPDF: { orientation: 'portrait', unit: 'mm', format: 'a4' }
    };

    try {
      const element = document.createElement('div');
      element.innerHTML = htmlContent;
      html2pdf(element, opt);
    } catch (err) {
      console.error('PDF generation error:', err);
      alert('Error generating PDF. Please try again.');
    }
  }

  function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  function resetGameUI() {
    // Clear all game stats from previous game
    state.A = { twoPA: 0, twoPM: 0, threePA: 0, threePM: 0, ftA: 0, ftM: 0, fouls: 0 };
    state.B = { twoPA: 0, twoPM: 0, threePA: 0, threePM: 0, ftA: 0, ftM: 0, fouls: 0 };
    state.history = [];
    state.active = 'A';
    isTimeout = false;
    
    // Clear shot markers from court
    const shotMarkersEl = document.getElementById('shot_markers');
    if (shotMarkersEl) shotMarkersEl.innerHTML = '';

    // Clear game context
    gameContext.gameId = null;
    gameContext.players = { A: null, B: null };
    gameContext.teams = {};
    gameContext.finalResult = null;
    gameContext.finalStats = null;

    // Reset scores
    document.getElementById("teamAScore").textContent = "0";
    document.getElementById("teamBScore").textContent = "0";
    
    // Reset all stat displays
    updateUI();
    
    // Re-enable player assignment buttons
    const assignBtns = document.querySelectorAll('.btn-assign');
    assignBtns.forEach(btn => {
      btn.textContent = 'Assign Player';
      btn.classList.remove('assigned');
    });
    
    // Disable start button until players assigned
    startGameBtn.disabled = true;
    startGameBtn.textContent = "Start Game";
  }

  function clearGameStats() {
    // Clear stats at the START of a new game (before first shot is logged)
    state.A = { twoPA: 0, twoPM: 0, threePA: 0, threePM: 0, ftA: 0, ftM: 0, fouls: 0 };
    state.B = { twoPA: 0, twoPM: 0, threePA: 0, threePM: 0, ftA: 0, ftM: 0, fouls: 0 };
    state.history = [];
    state.shotHistory = { A: [], B: [] };  // Clear individual shot histories
    state.active = 'A';
    
    // Clear shot markers
    const shotMarkersEl = document.getElementById('shot_markers');
    if (shotMarkersEl) shotMarkersEl.innerHTML = '';
    
    // Reset score displays
    document.getElementById("teamAScore").textContent = "0";
    document.getElementById("teamBScore").textContent = "0";
    
    updateUI();
    updateShotLogDisplay();  // Reset shot log display
  }

  // Helper function to toggle action buttons based on game state
  function setActionsEnabled(enabled) {
    // Toggle all in-game action controls
    const shotBtns = document.querySelectorAll('#shot_buttons .btn-stat');
    shotBtns.forEach(btn => btn.disabled = !enabled);
    if (els.selectA) els.selectA.disabled = !enabled;
    if (els.selectB) els.selectB.disabled = !enabled;
    if (els.a.foulPlus) els.a.foulPlus.disabled = !enabled;
    if (els.b.foulPlus) els.b.foulPlus.disabled = !enabled;
    if (els.a.ftBtn) els.a.ftBtn.disabled = !enabled;
    if (els.b.ftBtn) els.b.ftBtn.disabled = !enabled;
    if (els.undo) els.undo.disabled = !enabled;
    if (pauseGameBtn) pauseGameBtn.disabled = !enabled;
    if (timeoutBtn) timeoutBtn.disabled = !enabled;
  }

  /**
   * GameController
   * Encapsulates start/end and pause/resume game flow.
   * Lives inside DOMContentLoaded to leverage local helpers and state.
   */
  class GameController {
    init() {
      if (startGameBtn) startGameBtn.addEventListener('click', () => this.onStartEndClick());
      if (pauseGameBtn) pauseGameBtn.addEventListener('click', () => this.onPauseResumeClick());
    }

    async onStartEndClick() {
      if (startGameBtn.textContent === 'Start Game') {
        // Preconditions
        if (!playersAssigned()) {
          showStartError('Assign a player to both teams before starting the game.');
          return;
        }
        // Ensure a game exists on the backend before starting
        try {
          if (!gameContext.gameId) {
            const pA = getPlayerId('A');
            const pB = getPlayerId('B');
            if (!pA || !pB) {
              showStartError('Both teams must have an assigned player.');
              return;
            }
            const newGame = await apiClient.createGame({
              game_type: '1v1',
              team_a: [pA],
              team_b: [pB],
              score_to_win: 50
            });
            gameContext.gameId = newGame._id;
            console.log('Created new game:', newGame._id);
          }
        } catch (err) {
          console.error('Failed to create game before start:', err);
          alert('Unable to start. Please ensure you are signed in.');
          return;
        }
        // Start
        showStartError('');
        clearGameStats();
        startTimer();
        startGameBtn.textContent = 'End Game';
        startGameBtn.classList.remove('btn-primary');
        startGameBtn.classList.add('btn-danger');
        isGameRunning = true;
        setActionsEnabled(true);
      } else {
        // End Game - finalize and save to database
        stopTimer();
        try {
          startGameBtn.disabled = true;
          startGameBtn.textContent = 'Saving...';

          const teamAScore = parseInt(document.getElementById('teamAScore').textContent || 0);
          const teamBScore = parseInt(document.getElementById('teamBScore').textContent || 0);

          const result = await apiClient.finalizeGame(gameContext.gameId);
          console.log('Game finalized successfully:', result);

          gameContext.finalResult = result;
          gameContext.finalStats = {
            teamAScore,
            teamBScore,
            teamAName: gameContext.players.A?.name || 'Team A',
            teamBName: gameContext.players.B?.name || 'Team B',
            duration: secondsElapsed,
            winner: result.game.winner === 'team_a' ? gameContext.players.A?.name : result.game.winner === 'team_b' ? gameContext.players.B?.name : 'Tie'
          };

          const postGameModal = document.getElementById('postGameModal');
          const postGameStats = document.getElementById('postGameStats');
          let winnerText = gameContext.finalStats.winner === 'Tie' ? "It's a Tie!" : `${gameContext.finalStats.winner} Wins!`;
          postGameStats.innerHTML = `
            <div style="font-size:1.3rem; margin-bottom:8px;">${winnerText}</div>
            <div style="font-size:1rem;">
              <strong>${gameContext.finalStats.teamAName}:</strong> ${gameContext.finalStats.teamAScore}<br>
              <strong>${gameContext.finalStats.teamBName}:</strong> ${gameContext.finalStats.teamBScore}
            </div>
          `;
          if (postGameModal) postGameModal.style.display = 'flex';

          // Reset UI for next game
          startGameBtn.textContent = 'Start Game';
          startGameBtn.classList.remove('btn-danger');
          startGameBtn.classList.add('btn-primary');
          startGameBtn.disabled = false;
          showStartError('');
          secondsElapsed = 0;
          timerDisplay.textContent = '00:00';
          pauseGameBtn.innerHTML = 'Pause <span class="hotkey-hint">P</span>';
          isPaused = false;
          isTimeout = false;
          isGameRunning = false;
          setActionsEnabled(false);
        } catch (error) {
          console.error('Error finalizing game:', error);
          alert('Error saving game. Please try again.');
          startGameBtn.textContent = 'End Game';
          startGameBtn.disabled = false;
        }
      }
    }

    onPauseResumeClick() {
      // If in timeout (stats blocked but timer running), just clear timeout
      if (isTimeout && !isPaused) {
        isTimeout = false;
        pauseGameBtn.innerHTML = 'Pause <span class="hotkey-hint">P</span>';
        return;
      }

      if (!isPaused) {
        stopTimer();
        pauseGameBtn.innerHTML = 'Play <span class="hotkey-hint">P</span>';
        isPaused = true;
      } else {
        startTimer();
        pauseGameBtn.innerHTML = 'Pause <span class="hotkey-hint">P</span>';
        isPaused = false;
        isTimeout = false; // Clear timeout when resuming from pause
      }
    }

    applyShot(teamKey, shotType, result, markerEl = null, pos = null) {
      return applyShot(teamKey, shotType, result, markerEl, pos);
    }

    incrementFoul(teamKey) {
      return incrementFoul(teamKey);
    }

    openFtModal(teamKey) {
      return openFtModal(teamKey);
    }

    setActive(teamKey) {
      return setActive(teamKey);
    }

    generateGamePDF() {
      return generateGamePDF();
    }

    undoLast() {
      return undoLast();
    }

    openShotModal(shotType) {
      return openShotModal(shotType);
    }

    closeShotModal() {
      return closeShotModal();
    }

    handleCourtClick(evt) {
      if (!isGameRunning) { showStartError('Assign both players and press Start Game.'); return; }
      const courtImg = document.getElementById('court_image');
      if (!courtImg) return;
      const rect = courtImg.getBoundingClientRect();
      this.lastClickPos = {
        xPct: ((evt.clientX - rect.left) / rect.width) * 100,
        yPct: ((evt.clientY - rect.top) / rect.height) * 100
      };
      const shotType = inferShotTypeFromClick(evt);
      this.openShotModal(shotType);
    }

    getActiveTeam() {
      return (this.state && this.state.active) || state.active;
    }
  }

  // Bind start/pause via controller
  const controller = new GameController();
  controller.init();
  controller.state = state;
  controller.gameContext = gameContext;

  // Keyboard shortcuts handler
  document.addEventListener('keydown', (e) => {
    // Don't trigger if user is typing in an input field or if a modal is open
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    
    const assignModal = document.getElementById('assignPlayerModal');
    const timeoutModal = document.getElementById('timeoutModal');
    const postGameModal = document.getElementById('postGameModal');
    const isModalOpen = (assignModal && assignModal.style.display === 'flex') ||
                        (timeoutModal && timeoutModal.style.display === 'flex') ||
                        (postGameModal && postGameModal.style.display === 'flex');
    
    if (isModalOpen) return;

    const key = e.key.toLowerCase();
    const isShift = e.shiftKey;
    
    // Tab - Switch active team
    if (key === 'tab') {
      e.preventDefault();
      if (!isGameRunning) return;
      const currentActive = state.active;
      const newActive = currentActive === 'A' ? 'B' : 'A';
      setActive(newActive);
      return;
    }
    
    // Only allow other hotkeys when game is running
    if (!isGameRunning) return;
    
    // T - Timeout
    if (key === 't') {
      e.preventDefault();
      if (timeoutBtn && !timeoutBtn.disabled) {
        timeoutBtn.click();
      }
      return;
    }

    // P - Pause/Play (toggle)
    if (key === 'p') {
      e.preventDefault();
      if (pauseGameBtn && !pauseGameBtn.disabled) {
        pauseGameBtn.click();
      }
      return;
    }

    // U - Undo
    if (key === 'u') {
      e.preventDefault();
      if (els.undo && !els.undo.disabled) {
        undoLast();
      }
      return;
    }
    
    // A - Foul on Team A
    if (key === 'a') {
      e.preventDefault();
      if (isPaused || isTimeout) return;
      const foulBtn = document.getElementById('teamAFoulPlus');
      if (foulBtn && !foulBtn.disabled) {
        foulBtn.click();
      }
      return;
    }

    // B - Foul on Team B
    if (key === 'b') {
      e.preventDefault();
      if (isPaused || isTimeout) return;
      const foulBtn = document.getElementById('teamBFoulPlus');
      if (foulBtn && !foulBtn.disabled) {
        foulBtn.click();
      }
      return;
    }
    
    // M - Shot Made (auto-detect 2PT/3PT from cursor position)
    if (key === 'm') {
      e.preventDefault();
      if (isPaused || isTimeout) return;
      const result = 'made';

      // Must have cursor over court to record shot
      if (lastCursorPos) {
        const pos = { ...lastCursorPos }; // Copy position before it changes
        const shotType = inferShotTypeFromPos(pos);
        const markerEl = addShotMarker(controller.getActiveTeam(), shotType, result, pos);
        controller.applyShot(controller.getActiveTeam(), shotType, result, markerEl, pos);
      } else {
        alert('Hover cursor over court to record shot location');
      }
      return;
    }

    // X - Shot Missed (auto-detect 2PT/3PT from cursor position)
    if (key === 'x') {
      e.preventDefault();
      if (isPaused || isTimeout) return;
      const result = 'missed';

      // Must have cursor over court to record shot
      if (lastCursorPos) {
        const pos = { ...lastCursorPos }; // Copy position before it changes
        const shotType = inferShotTypeFromPos(pos);
        const markerEl = addShotMarker(controller.getActiveTeam(), shotType, result, pos);
        controller.applyShot(controller.getActiveTeam(), shotType, result, markerEl, pos);
      } else {
        alert('Hover cursor over court to record shot location');
      }
      return;
    }

    // 3 - 3PT Made, Shift+3 - 3PT Missed
    if (key === '3' || key === '#') {
      e.preventDefault();
      if (isPaused || isTimeout) return;
      const shotType = '3pt';
      const result = isShift ? 'missed' : 'made';

      // If cursor is over court, record with coordinates
      if (lastCursorPos) {
        const pos = { ...lastCursorPos }; // Copy position before it changes
        const markerEl = addShotMarker(controller.getActiveTeam(), shotType, result, pos);
        controller.applyShot(controller.getActiveTeam(), shotType, result, markerEl, pos);
      } else {
        // No coordinates available
        controller.applyShot(controller.getActiveTeam(), shotType, result, null, null);
      }
      return;
    }

    // 2 - 2PT Made, Shift+2 - 2PT Missed
    if (key === '2' || key === '@') {
      e.preventDefault();
      if (isPaused || isTimeout) return;
      const shotType = '2pt';
      const result = isShift ? 'missed' : 'made';

      // If cursor is over court, record with coordinates
      if (lastCursorPos) {
        const pos = { ...lastCursorPos }; // Copy position before it changes
        const markerEl = addShotMarker(controller.getActiveTeam(), shotType, result, pos);
        controller.applyShot(controller.getActiveTeam(), shotType, result, markerEl, pos);
      } else {
        // No coordinates available
        controller.applyShot(controller.getActiveTeam(), shotType, result, null, null);
      }
      return;
    }

    // F - FT Made, Shift+F - FT Missed
    if (key === 'f') {
      e.preventDefault();
      if (isPaused || isTimeout) return;
      const shotType = 'ft';
      const result = isShift ? 'missed' : 'made';

      // If cursor is over court, record with coordinates
      if (lastCursorPos) {
        const pos = { ...lastCursorPos }; // Copy position before it changes
        const markerEl = addShotMarker(controller.getActiveTeam(), shotType, result, pos);
        controller.applyShot(controller.getActiveTeam(), shotType, result, markerEl, pos);
      } else {
        // No coordinates available
        controller.applyShot(controller.getActiveTeam(), shotType, result, null, null);
      }
      return;
    }
  });
  
  // Hotkey toggle functionality
  const hotkeyToggleBtn = document.getElementById('hotkeyToggleBtn');
  const hotkeyHints = document.querySelectorAll('.hotkey-hint');
  
  // Load hotkey visibility preference from localStorage
  const hotkeyVisible = localStorage.getItem('hotkeyHintsVisible') !== 'false';
  
  function updateHotkeyVisibility(visible) {
    hotkeyHints.forEach(hint => {
      if (visible) {
        hint.classList.remove('hidden');
      } else {
        hint.classList.add('hidden');
      }
    });
    
    if (hotkeyToggleBtn) {
      hotkeyToggleBtn.textContent = visible ? 'Hide Hotkeys' : 'Show Hotkeys';
    }
    
    localStorage.setItem('hotkeyHintsVisible', visible);
  }
  
  // Initialize hotkey visibility
  updateHotkeyVisibility(hotkeyVisible);
  
  // Toggle hotkey visibility on button click
  if (hotkeyToggleBtn) {
    hotkeyToggleBtn.addEventListener('click', () => {
      const currentlyVisible = localStorage.getItem('hotkeyHintsVisible') !== 'false';
      updateHotkeyVisibility(!currentlyVisible);
    });
  }

  // Initial UI sync
  updateUI();
  // Lock all controls until game starts
  isGameRunning = false;
  setActionsEnabled(false);
});

// Controller now lives within DOMContentLoaded for local state access
