/**
 * Global timer and session flags
 * These track game timer state and session-level flags.
 */
let timerInterval;
let secondsElapsed = 0;
let isPaused = false;
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
  if (startErrorEl) startErrorEl.textContent = msg;
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

    // Scores start at 0 for live session; do not prefill from DB
    document.getElementById("teamAScore").textContent = 0;
    document.getElementById("teamBScore").textContent = 0;

    // Helper: find player details by ID
    function getPlayerName(playerId) {
      const player = game.all_player_ids.find(p => p._id === playerId);
      return player ? player.name : "Unknown Player";
    }

    // Default to unassigned UI; we no longer auto-fill from existing game teams
    gameContext.players.A = null;
    gameContext.players.B = null;
    if (startGameBtn) startGameBtn.disabled = true;
    showStartError("Assign a player to both teams before starting the game.");
    const teamAButton = document.getElementById("teamAAssignBtn");
    const teamBButton = document.getElementById("teamBAssignBtn");
    if (teamAButton) {
      teamAButton.textContent = "Assign Player";
      teamAButton.classList.remove('assigned');
    }
    if (teamBButton) {
      teamBButton.textContent = "Assign Player";
      teamBButton.classList.remove('assigned');
    }

    // Optional: show game type; default to 1v1 wording if not provided
    const gt = document.getElementById("gameType");
    if (gt) gt.textContent = game.game_type ? `${game.game_type} game` : "1v1 game to 50pts";
  } catch (error) {
    console.error("Failed to load game data:", error);
  }
}

// Run once on DOM load
/** Initialize event handlers and local state on DOM ready */
document.addEventListener("DOMContentLoaded", () => {
  const urlParams = new URLSearchParams(window.location.search);
  const gameId = urlParams.get("gameId");
  
  // Only load an existing game if explicitly provided, otherwise start fresh
  if (gameId) {
    loadGameData(gameId);
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
      btn.classList.add('assigned');
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

  async function persistGameEvent(teamKey, eventPayload) {
    if (!gameContext.gameId) {
      throw new Error('No active game ID. Please start a new game.');
    }
    const playerId = getPlayerId(teamKey);
    if (!playerId) {
      throw new Error(`No player assigned for Team ${teamKey}. Please assign a player first.`);
    }
    const teamField = teamKey === 'A' ? 'team_a' : 'team_b';
    const payload = { ...eventPayload, player_id: playerId, team: teamField };
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
  }

  async function applyShot(teamKey, shotType, result, markerEl = null) {
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
      await persistGameEvent(teamKey, baseEvent);
      console.log(`Shot recorded: ${teamKey} - ${shotType} - ${result}`);
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
    controller.applyShot(pendingFTTeam, 'ft', 'made');
    closeFtModal();
  });
  if (ftModal.missBtn) ftModal.missBtn.addEventListener('click', () => {
    if (!pendingFTTeam) return;
    controller.applyShot(pendingFTTeam, 'ft', 'missed');
    closeFtModal();
  });
  if (ftModal.closeBtn) ftModal.closeBtn.addEventListener('click', closeFtModal);
  if (ftModal.overlay) ftModal.overlay.addEventListener('click', (e) => {
    if (e.target === ftModal.overlay) closeFtModal();
  });

  // Player modal wiring
  ['A', 'B'].forEach(key => {
    const set = selectorEls[key];
    if (set.assignBtn) set.assignBtn.addEventListener('click', () => openModal(key));
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
      const shot = btn.getAttribute('data-shot');
      const result = btn.getAttribute('data-result');
      controller.applyShot(controller.getActiveTeam(), shot, result);
    });
  });

  const courtImg = document.getElementById('court_image');
  if (courtImg) {
    courtImg.addEventListener('click', (evt) => controller.handleCourtClick(evt));
  }

  // Shot modal wiring
  if (shotModal.close) shotModal.close.addEventListener('click', closeShotModal);
  if (shotModal.overlay) shotModal.overlay.addEventListener('click', (e) => {
    if (e.target === shotModal.overlay) closeShotModal();
  });
  if (shotModal.makeBtn) shotModal.makeBtn.addEventListener('click', () => {
    if (!pendingShotType) return;
    const markerEl = addShotMarker(controller.getActiveTeam(), pendingShotType, 'made', controller.lastClickPos);
    controller.applyShot(controller.getActiveTeam(), pendingShotType, 'made', markerEl);
    controller.lastClickPos = null;
    closeShotModal();
  });
  if (shotModal.missBtn) shotModal.missBtn.addEventListener('click', () => {
    if (!pendingShotType) return;
    const markerEl = addShotMarker(controller.getActiveTeam(), pendingShotType, 'missed', controller.lastClickPos);
    controller.applyShot(controller.getActiveTeam(), pendingShotType, 'missed', markerEl);
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
    postGameClose.addEventListener('click', () => {
      if (postGameModal) postGameModal.style.display = 'none';
    });
  }

  if (postGameModal) {
    postGameModal.addEventListener('click', (e) => {
      if (e.target === postGameModal) postGameModal.style.display = 'none';
    });
  }

  if (downloadPdfBtn) {
    downloadPdfBtn.addEventListener('click', () => {
      controller.generateGamePDF();
    });
  }

  if (newGameBtn) {
    newGameBtn.addEventListener('click', () => {
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
              ${stats.winner === 'Tie' ? "🏀 Game Ended in a Tie!" : `🏆 ${stats.winner} Wins!`}
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
              <h4 style="color: #1f6eeb; margin: 0 0 10px 0; font-size: 13px;">📊 ${stats.teamAName}</h4>
              <div style="font-size: 12px;">
                <div style="padding: 5px 0; border-bottom: 1px solid #ddd;"><strong>Total Possessions:</strong> ${teamAAttempts}</div>
                <div style="padding: 5px 0;"><strong>Shooting Accuracy:</strong> ${calcPercentage((teamAStats.two_pm || 0) + (teamAStats.three_pm || 0), teamAAttempts)}</div>
              </div>
            </div>
            <div style="flex: 1;">
              <h4 style="color: #ff8800; margin: 0 0 10px 0; font-size: 13px;">📊 ${stats.teamBName}</h4>
              <div style="font-size: 12px;">
                <div style="padding: 5px 0; border-bottom: 1px solid #ddd;"><strong>Total Possessions:</strong> ${teamBAttempts}</div>
                <div style="padding: 5px 0;"><strong>Shooting Accuracy:</strong> ${calcPercentage((teamBStats.two_pm || 0) + (teamBStats.three_pm || 0), teamBAttempts)}</div>
              </div>
            </div>
          </div>
        </div>

        <div style="text-align: center; margin-top: 30px; padding-top: 15px; border-top: 2px solid #ddd; color: #666; font-size: 11px;">
          <p style="margin: 5px 0;">Generated on ${new Date().toLocaleString()}</p>
          <p style="margin: 5px 0;">🏀 Next Chapter - Basketball Stats Tracker</p>
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
          pauseGameBtn.textContent = 'Pause';
          isPaused = false;
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
      if (!isPaused) {
        stopTimer();
        pauseGameBtn.textContent = 'Resume';
        isPaused = true;
      } else {
        startTimer();
        pauseGameBtn.textContent = 'Pause';
        isPaused = false;
      }
    }

    applyShot(teamKey, shotType, result, markerEl = null) {
      return applyShot(teamKey, shotType, result, markerEl);
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

  // Initial UI sync
  updateUI();
  // Lock all controls until game starts
  isGameRunning = false;
  setActionsEnabled(false);
});

// Controller now lives within DOMContentLoaded for local state access
