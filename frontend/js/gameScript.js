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
let liveSaveDebounceTimer = null;
// Backend currently has no event-reversal endpoint, so live event sync can overcount after undo/delete.
// Keep scoreboard authoritative in frontend and persist final score/winner at game end.
const SYNC_LIVE_EVENTS_TO_BACKEND = false;
const LIVE_GAME_STATE_KEY = 'tnc_live_game_state_active_v1';
const DEFAULT_COURT_IMAGE_SRC = 'assets/default-court-image.svg';
const CUSTOM_COURT_IMAGE_STORAGE_PREFIX = 'tnc_game_court_image_v1_';
const MAX_CUSTOM_COURT_IMAGE_BYTES = 1.5 * 1024 * 1024;

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
  players: { A: null, A2: null, B: null, B2: null },
  activePlayerIndex: { A: 0, B: 0 },
  ruleMode: '1v1',
  customTeamNames: { A: '', B: '' },
  teams: { team_a: [], team_b: [] },
  courtImageSrc: ''
};
let liveState = null;

let currentAssignTarget = null;
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
    if (secondsElapsed % 5 === 0) {
      persistLiveGameSnapshot('timer');
    }
  }, 1000);
}

/** Stop the game timer */
function stopTimer() {
  clearInterval(timerInterval);
}

function safeClone(value, fallback) {
  return value && typeof value === 'object' ? JSON.parse(JSON.stringify(value)) : fallback;
}

function buildHistorySnapshot(history = []) {
  if (!Array.isArray(history)) return [];
  return history.map((entry) => ({
    kind: entry.kind || null,
    team: entry.team || null,
    shotType: entry.shotType || null,
    result: entry.result || null,
    actionId: entry.actionId || null,
    playerId: entry.playerId || null,
    pos: entry.pos ? { ...entry.pos } : null,
    persisted: !!entry.persisted,
    type: entry.type || null,
    timestamp: entry.timestamp || null
  }));
}

function buildActionHistorySnapshot(actionHistory = { A: [], B: [] }) {
  const normalize = (entries = [], teamKey) => {
    if (!Array.isArray(entries)) return [];
    return entries.map((entry) => ({
      id: entry.id,
      teamKey,
      playerId: entry.playerId || '',
      playerName: entry.playerName || `Team ${teamKey}`,
      label: entry.label || 'Play',
      gameSeconds: typeof entry.gameSeconds === 'number' ? entry.gameSeconds : null,
      timeLabel: entry.timeLabel || (typeof entry.gameSeconds === 'number' ? formatTime(entry.gameSeconds) : '—'),
      timestamp: entry.timestamp || Date.now(),
      highlighted: !!entry.highlighted,
      type: entry.type || 'action',
      note: entry.note || '',
      markerId: entry.markerId || null
    }));
  };

  return {
    A: normalize(actionHistory.A, 'A'),
    B: normalize(actionHistory.B, 'B')
  };
}

function buildMarkerSnapshot() {
  const container = document.getElementById('shot_markers');
  if (!container) return [];
  const nodes = container.querySelectorAll('.shot-marker, .foul-marker');
  return Array.from(nodes).map((marker) => ({
    classes: marker.className,
    left: marker.style.left,
    top: marker.style.top,
    text: marker.textContent || '',
    title: marker.title || '',
    playerName: marker.dataset.player || '',
    playerId: marker.dataset.playerId || '',
    shotType: marker.dataset.shotType || '',
    result: marker.dataset.result || '',
    type: marker.dataset.type || '',
    foulRole: marker.dataset.foulRole || '',
    markerId: marker.dataset.markerId || ''
  }));
}

function persistLiveGameSnapshot(reason = 'auto') {
  if (typeof localStorage === 'undefined') return;
  if (!liveState) return;

  const payload = {
    version: 1,
    reason,
    updatedAt: Date.now(),
    gameContext: {
      gameId: gameContext.gameId || null,
      players: safeClone(gameContext.players, { A: null, A2: null, B: null, B2: null }),
      activePlayerIndex: safeClone(gameContext.activePlayerIndex, { A: 0, B: 0 }),
      ruleMode: gameContext.ruleMode || '1v1',
      customTeamNames: safeClone(gameContext.customTeamNames, { A: '', B: '' }),
      courtImageSrc: isCustomCourtImageSrc(gameContext.courtImageSrc) ? gameContext.courtImageSrc : ''
    },
    runtime: {
      secondsElapsed,
      isPaused,
      isTimeout,
      isGameRunning,
      activeTeam: liveState.active || 'A'
    },
    state: {
      A: safeClone(liveState.A, { twoPA: 0, twoPM: 0, threePA: 0, threePM: 0, fourPA: 0, fourPM: 0, ftA: 0, ftM: 0, fouls: 0 }),
      B: safeClone(liveState.B, { twoPA: 0, twoPM: 0, threePA: 0, threePM: 0, fourPA: 0, fourPM: 0, ftA: 0, ftM: 0, fouls: 0 }),
      playerStats: safeClone(liveState.playerStats, {}),
      teamPlayerIds: safeClone(liveState.teamPlayerIds, { A: [], B: [] }),
      statsView: safeClone(liveState.statsView, { A: 'player', B: 'player' }),
      shotHistory: safeClone(liveState.shotHistory, { A: [], B: [] }),
      history: buildHistorySnapshot(liveState.history),
      actionHistory: buildActionHistorySnapshot(liveState.actionHistory)
    },
    markers: buildMarkerSnapshot()
  };

  try {
    localStorage.setItem(LIVE_GAME_STATE_KEY, JSON.stringify(payload));
  } catch (err) {
    console.warn('Failed to persist live game snapshot.', err);
  }
}

function scheduleLiveGameSnapshot(reason = 'auto') {
  if (liveSaveDebounceTimer) clearTimeout(liveSaveDebounceTimer);
  liveSaveDebounceTimer = setTimeout(() => {
    persistLiveGameSnapshot(reason);
    liveSaveDebounceTimer = null;
  }, 250);
}

function clearLiveGameSnapshot() {
  try {
    localStorage.removeItem(LIVE_GAME_STATE_KEY);
  } catch (err) {
    console.warn('Failed to clear live game snapshot.', err);
  }
}

/**
 * Check whether both players are assigned
 * @returns {boolean}
 */
function playersAssigned() {
  if (gameContext.ruleMode === 'tag-team-1v1') {
    return !!(gameContext.players.A && gameContext.players.A2 && gameContext.players.B && gameContext.players.B2);
  }
  return !!(gameContext.players.A && gameContext.players.B);
}

function requiredPlayersPerTeam() {
  return gameContext.ruleMode === 'tag-team-1v1' ? 2 : 1;
}

function getTeamPlayers(teamKey) {
  if (teamKey === 'A') {
    return [gameContext.players.A, gameContext.players.A2].filter(Boolean);
  }
  return [gameContext.players.B, gameContext.players.B2].filter(Boolean);
}

function getActivePlayerForTeam(teamKey) {
  const players = getTeamPlayers(teamKey);
  if (players.length === 0) return null;
  if (gameContext.ruleMode !== 'tag-team-1v1') return players[0];
  const idx = gameContext.activePlayerIndex[teamKey] || 0;
  return players[idx] || players[0] || null;
}

function getTeamDisplayName(teamKey) {
  const customName = (gameContext.customTeamNames?.[teamKey] || '').trim();
  if (customName) return customName;

  const players = getTeamPlayers(teamKey);
  if (players.length === 0) return `Team ${teamKey}`;
  if (players.length === 1) return players[0]?.name || `Team ${teamKey}`;
  return players.map((p) => p?.name || 'Player').join(' & ');
}

function isCustomCourtImageSrc(value) {
  return typeof value === 'string' && value.trim().startsWith('data:image/');
}

function getCourtImageStorageKey(gameId) {
  if (!gameId) return null;
  return `${CUSTOM_COURT_IMAGE_STORAGE_PREFIX}${gameId}`;
}

function loadCustomCourtImageForGame(gameId) {
  const key = getCourtImageStorageKey(gameId);
  if (!key) return '';
  try {
    const value = localStorage.getItem(key);
    return isCustomCourtImageSrc(value) ? value : '';
  } catch (err) {
    console.warn('Failed to load custom court image.', err);
    return '';
  }
}

function persistCustomCourtImageForGame(gameId, imageSrc) {
  const key = getCourtImageStorageKey(gameId);
  if (!key) return;
  if (!isCustomCourtImageSrc(imageSrc)) {
    try {
      localStorage.removeItem(key);
    } catch (err) {
      console.warn('Failed to clear custom court image.', err);
    }
    return;
  }

  try {
    localStorage.setItem(key, imageSrc);
  } catch (err) {
    console.warn('Failed to persist custom court image.', err);
  }
}

function resolveCourtImageSourceForGame(game) {
  const backendImage = isCustomCourtImageSrc(game?.custom_court_image) ? game.custom_court_image : '';
  const storedImage = loadCustomCourtImageForGame(game?._id || gameContext.gameId);
  return backendImage || storedImage || DEFAULT_COURT_IMAGE_SRC;
}

function applyCourtImageToGameUI(src) {
  const imageEl = document.getElementById('court_image');
  const resolved = isCustomCourtImageSrc(src) ? src : DEFAULT_COURT_IMAGE_SRC;
  if (imageEl) imageEl.src = resolved;
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
    gameContext.ruleMode = game.game_type === '2v2' ? 'tag-team-1v1' : '1v1';
    gameContext.teams = game.teams || { team_a: [], team_b: [] };
    gameContext.customTeamNames.A = game.teams?.team_a?.name || '';
    gameContext.customTeamNames.B = game.teams?.team_b?.name || '';
    const resolvedCourtImage = resolveCourtImageSourceForGame(game);
    gameContext.courtImageSrc = isCustomCourtImageSrc(resolvedCourtImage) ? resolvedCourtImage : '';
    applyCourtImageToGameUI(resolvedCourtImage);
    persistCustomCourtImageForGame(gameContext.gameId, gameContext.courtImageSrc);

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

    // Check if it's the new object structure (.players) or the old array structure
    const teamAPlayerIds = game.teams?.team_a?.players || game.teams?.team_a || [];
    const teamBPlayerIds = game.teams?.team_b?.players || game.teams?.team_b || [];

    // Assign Team A players
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
    if (teamAPlayerIds.length > 1) {
      const playerA2Id = teamAPlayerIds[1]?._id || teamAPlayerIds[1];
      gameContext.players.A2 = findPlayerById(playerA2Id);
    }

    // Assign Team B players
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
    if (teamBPlayerIds.length > 1) {
      const playerB2Id = teamBPlayerIds[1]?._id || teamBPlayerIds[1];
      gameContext.players.B2 = findPlayerById(playerB2Id);
    }

    // Load scores from the game
    const teamAScore = game.final_score?.team_a || 0;
    const teamBScore = game.final_score?.team_b || 0;
    document.getElementById("teamAScore").textContent = teamAScore;
    document.getElementById("teamBScore").textContent = teamBScore;

    // Check if both players are assigned
    if (playersAssigned()) {
      if (startGameBtn) startGameBtn.disabled = false;
      showStartError("");
    } else {
      if (startGameBtn) startGameBtn.disabled = true;
      showStartError(`Assign ${requiredPlayersPerTeam()} player(s) to each team before starting the game.`);
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

  const palette = ['#22C55E', '#2563EB', '#EC4899', '#F97316'];
  const idToColor = (id) => {
    const source = String(id || 'player');
    let hash = 0;
    for (let i = 0; i < source.length; i += 1) {
      hash = ((hash << 5) - hash) + source.charCodeAt(i);
      hash |= 0;
    }
    return palette[Math.abs(hash) % palette.length];
  };
  const hexToRgba = (hex, alpha) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  };

  // Clear existing markers
  shotMarkersEl.innerHTML = '';

  // Process each event
  game.events.forEach(event => {
    // Only process shots and free throws with location data
    if ((event.type === 'shot' || event.type === 'free_throw') &&
        event.location && typeof event.location.x === 'number' && typeof event.location.y === 'number') {

      // Determine which team this shot belongs to
      const teamKey = event.team === 'team_a' ? 'A' : 'B';
      const eventPlayerId = event.player_id?._id ? String(event.player_id._id) : String(event.player_id || '');
      const player = getAssignedPlayerById(eventPlayerId)?.key ? gameContext.players[getAssignedPlayerById(eventPlayerId).key] : null;

      // Determine shot type based on points
      let shotType = '2pt';
      if (event.type === 'free_throw' || event.points === 1) {
        shotType = 'ft';
      } else if (event.points === 4) {
        shotType = '4pt';
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
      styleShotMarker(marker, player, result);

      marker.title = `${player?.name || teamKey} - ${shotType.toUpperCase()} ${result}`;
      marker.style.left = `${event.location.x}%`;
      marker.style.top = `${event.location.y}%`;
      marker.dataset.player = player?.name || teamKey;
      marker.dataset.playerId = eventPlayerId;
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
    gameContext.players.A2 = null;
    gameContext.players.B = null;
    gameContext.players.B2 = null;
    gameContext.courtImageSrc = '';
    applyCourtImageToGameUI(DEFAULT_COURT_IMAGE_SRC);
    // Ensure button is disabled until both players are assigned
    if (startGameBtn) startGameBtn.disabled = true;
    showStartError(`Assign ${requiredPlayersPerTeam()} player(s) to each team before starting the game.`);
  }

  // ---- Local stat tracking for 1v1 view ----
  /**
   * Local stat state per team
   */
  const state = {
    active: 'A',
    A: { twoPA: 0, twoPM: 0, threePA: 0, threePM: 0, fourPA: 0, fourPM: 0, ftA: 0, ftM: 0, fouls: 0 },
    B: { twoPA: 0, twoPM: 0, threePA: 0, threePM: 0, fourPA: 0, fourPM: 0, ftA: 0, ftM: 0, fouls: 0 },
    playerStats: {},
    teamPlayerIds: { A: [], B: [] },
    statsView: { A: 'player', B: 'player' },
    history: [],
    shotHistory: {
      A: [],  // Store all of player A's shots
      B: []   // Store all of player B's shots
    },
    actionHistory: {
      A: [],
      B: []
    }
  };
  liveState = state;

  // Track most recent stat elements for gold highlighting
  let mostRecentMarker = null;
  let mostRecentActionId = null;
  let pendingMarkerSet = false;

  function setMostRecentMarker(marker) {
    if (mostRecentMarker) {
      mostRecentMarker.classList.remove('most-recent');
    }
    mostRecentMarker = marker;
    if (marker) {
      marker.classList.add('most-recent');
    }
    pendingMarkerSet = true;
  }

  function setMostRecentAction(actionId) {
    // If no marker was set for this action, clear the previous marker
    if (!pendingMarkerSet && mostRecentMarker) {
      mostRecentMarker.classList.remove('most-recent');
      mostRecentMarker = null;
    }
    pendingMarkerSet = false;
    mostRecentActionId = actionId;
    // Re-render will apply the class
  }

  // If we loaded an existing game, restore the stats from events
  if (gameContext.loadedGame && gameContext.loadedGame.events) {
    const events = gameContext.loadedGame.events;
    events.forEach(event => {
      const teamKey = event.team === 'team_a' ? 'A' : 'B';
      const team = state[teamKey];
      const eventPlayerId = event.player_id?._id ? String(event.player_id._id) : String(event.player_id || '');

      if (event.type === 'shot') {
        if (event.points === 4) {
          team.fourPA += 1;
          if (event.made) team.fourPM += 1;
        } else if (event.points === 3) {
          team.threePA += 1;
          if (event.made) team.threePM += 1;
        } else {
          team.twoPA += 1;
          if (event.made) team.twoPM += 1;
        }
        if (eventPlayerId) {
          applyPlayerShotDelta(eventPlayerId, event.points === 4 ? '4pt' : event.points === 3 ? '3pt' : '2pt', event.made ? 'made' : 'missed', 1);
          if (!state.teamPlayerIds[teamKey].includes(eventPlayerId)) state.teamPlayerIds[teamKey].push(eventPlayerId);
        }
      } else if (event.type === 'free_throw') {
        team.ftA += 1;
        if (event.made) team.ftM += 1;
        if (eventPlayerId) {
          applyPlayerShotDelta(eventPlayerId, 'ft', event.made ? 'made' : 'missed', 1);
          if (!state.teamPlayerIds[teamKey].includes(eventPlayerId)) state.teamPlayerIds[teamKey].push(eventPlayerId);
        }
      } else if (event.type === 'foul') {
        team.fouls += 1;
        if (eventPlayerId) {
          applyPlayerFoulDelta(eventPlayerId, 1);
          if (!state.teamPlayerIds[teamKey].includes(eventPlayerId)) state.teamPlayerIds[teamKey].push(eventPlayerId);
        }
      }

      seedActionFromEvent(event, teamKey);
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
      s4: document.getElementById('teamA4pt'),
      s3: document.getElementById('teamA3pt'),
      s2: document.getElementById('teamA2pt'),
      ft: document.getElementById('teamAft'),
      fouls: document.getElementById('teamAFouls'),
      ftBtn: document.getElementById('teamAFtBtn'),
      score: document.getElementById('teamAScore'),
      foulPlus: document.getElementById('teamAFoulPlus'),
      panel: document.getElementById('team_a_players'),
      actions: document.getElementById('action_log_A')
    },
    // team B
    b: {
      pts: document.getElementById('teamBPts'),
      s4: document.getElementById('teamB4pt'),
      s3: document.getElementById('teamB3pt'),
      s2: document.getElementById('teamB2pt'),
      ft: document.getElementById('teamBft'),
      fouls: document.getElementById('teamBFouls'),
      ftBtn: document.getElementById('teamBFtBtn'),
      score: document.getElementById('teamBScore'),
      foulPlus: document.getElementById('teamBFoulPlus'),
      panel: document.getElementById('team_b_players'),
      actions: document.getElementById('action_log_B')
    },
    activeSideLabel: document.getElementById('activeSideLabel'),
    teamAScoreName: document.getElementById('teamAScoreName'),
    teamBScoreName: document.getElementById('teamBScoreName'),
    teamANameInput: document.getElementById('teamANameInput'),
    teamBNameInput: document.getElementById('teamBNameInput'),
    selectA: document.getElementById('selectTeamA'),
    selectB: document.getElementById('selectTeamB'),
    undo: document.getElementById('undoStatBtn'),
    gameRuleSelect: document.getElementById('gameRuleSelect'),
    teamAActivePlayer: document.getElementById('teamAActivePlayer'),
    teamBActivePlayer: document.getElementById('teamBActivePlayer'),
    teamAActivePicker: document.getElementById('teamAActivePicker'),
    teamBActivePicker: document.getElementById('teamBActivePicker'),
    teamAStatsView: document.getElementById('teamAStatsView'),
    teamBStatsView: document.getElementById('teamBStatsView'),
    teamAStatsScope: document.getElementById('teamAStatsScope'),
    teamBStatsScope: document.getElementById('teamBStatsScope'),
    teamAPlaybackBtn: document.getElementById('teamAPlaybackBtn'),
    teamBPlaybackBtn: document.getElementById('teamBPlaybackBtn')
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
      assignBtn: document.getElementById('teamAAssignBtn'),
      assignBtn2: document.getElementById('teamAAssignBtn2')
    },
    B: {
      assignBtn: document.getElementById('teamBAssignBtn'),
      assignBtn2: document.getElementById('teamBAssignBtn2')
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

  const playbackModal = {
    overlay: document.getElementById('playbackModal'),
    close: document.getElementById('playbackClose'),
    title: document.getElementById('playbackTitle'),
    meta: document.getElementById('playbackMeta'),
    current: document.getElementById('playbackCurrent'),
    list: document.getElementById('playbackList'),
    courtOverlay: document.getElementById('playbackCourtOverlay'),
    prevBtn: document.getElementById('playbackPrev'),
    playPauseBtn: document.getElementById('playbackPlayPause'),
    nextBtn: document.getElementById('playbackNext')
  };

  let playbackTimer = null;
  let playbackTeamKey = null;
  let playbackSteps = [];
  let playbackIndex = 0;
  let playbackIsPlaying = false;
  const PLAYBACK_INTERVAL_MS = 1500;

  const shotMarkersEl = document.getElementById('shot_markers');

  function applyPlayerAssignmentsToButtons() {
    if (selectorEls.A.assignBtn) selectorEls.A.assignBtn.textContent = gameContext.players.A?.name || 'Assign Player';
    if (selectorEls.B.assignBtn) selectorEls.B.assignBtn.textContent = gameContext.players.B?.name || 'Assign Player';
    if (selectorEls.A.assignBtn2) selectorEls.A.assignBtn2.textContent = gameContext.players.A2?.name || 'Assign Tag Partner';
    if (selectorEls.B.assignBtn2) selectorEls.B.assignBtn2.textContent = gameContext.players.B2?.name || 'Assign Tag Partner';
  }

  function setTeamNameInputsLocked(locked) {
    const shouldLock = !!locked;
    if (els.teamANameInput) {
      els.teamANameInput.disabled = shouldLock;
      els.teamANameInput.readOnly = shouldLock;
    }
    if (els.teamBNameInput) {
      els.teamBNameInput.disabled = shouldLock;
      els.teamBNameInput.readOnly = shouldLock;
    }
  }

  function createMarkerFromSnapshot(snapshot) {
    if (!shotMarkersEl || !snapshot) return null;
    const marker = document.createElement('div');
    marker.className = snapshot.classes || '';
    marker.style.left = snapshot.left || '0%';
    marker.style.top = snapshot.top || '0%';
    marker.textContent = snapshot.text || '';
    marker.title = snapshot.title || '';
    marker.dataset.player = snapshot.playerName || '';
    marker.dataset.playerId = snapshot.playerId || '';
    marker.dataset.shotType = snapshot.shotType || '';
    marker.dataset.result = snapshot.result || '';
    marker.dataset.type = snapshot.type || '';
    marker.dataset.foulRole = snapshot.foulRole || '';
    if (snapshot.markerId) marker.dataset.markerId = snapshot.markerId;

    if (marker.classList.contains('shot-marker')) {
      const result = snapshot.result || (marker.classList.contains('made') ? 'made' : 'missed');
      styleShotMarker(marker, { _id: snapshot.playerId || '', name: snapshot.playerName || 'Player' }, result);
      marker.style.display = 'flex';
      marker.style.alignItems = 'center';
      marker.style.justifyContent = 'center';
      if (!marker.style.fontSize) marker.style.fontSize = '10px';
      if (!marker.style.fontWeight) marker.style.fontWeight = 'bold';
    }

    if (marker.classList.contains('foul-marker')) {
      styleFoulMarker(marker, { _id: snapshot.playerId || '', name: snapshot.playerName || 'Player' });
      marker.style.display = 'flex';
      marker.style.alignItems = 'center';
      marker.style.justifyContent = 'center';
      marker.style.color = '#fff';
      if (snapshot.foulRole === 'committed') {
        marker.style.borderRadius = '0';
        marker.style.clipPath = 'polygon(50% 0%, 0% 100%, 100% 100%)';
      } else {
        marker.style.borderRadius = '4px';
        marker.style.clipPath = '';
      }
    }

    shotMarkersEl.appendChild(marker);
    return marker;
  }

  function restoreLiveGameSnapshotIfAvailable() {
    let parsed;
    try {
      const raw = localStorage.getItem(LIVE_GAME_STATE_KEY);
      if (!raw) return false;
      parsed = JSON.parse(raw);
    } catch (err) {
      console.warn('Invalid live game snapshot payload. Clearing.', err);
      clearLiveGameSnapshot();
      return false;
    }

    if (!parsed || typeof parsed !== 'object' || !parsed.state || !parsed.gameContext) return false;

    const snapshotGameId = parsed.gameContext.gameId || null;
    if (gameContext.gameId && snapshotGameId && String(gameContext.gameId) !== String(snapshotGameId)) {
      return false;
    }

    gameContext.gameId = snapshotGameId || gameContext.gameId || null;
    gameContext.players = safeClone(parsed.gameContext.players, gameContext.players);
    gameContext.activePlayerIndex = safeClone(parsed.gameContext.activePlayerIndex, gameContext.activePlayerIndex);
    gameContext.ruleMode = parsed.gameContext.ruleMode === 'tag-team-1v1' ? 'tag-team-1v1' : '1v1';
    gameContext.customTeamNames = safeClone(parsed.gameContext.customTeamNames, gameContext.customTeamNames);
    gameContext.courtImageSrc = isCustomCourtImageSrc(parsed.gameContext.courtImageSrc) ? parsed.gameContext.courtImageSrc : '';
    applyCourtImageToGameUI(gameContext.courtImageSrc);
    persistCustomCourtImageForGame(gameContext.gameId, gameContext.courtImageSrc);

    const savedState = parsed.state;
    state.A = safeClone(savedState.A, state.A);
    state.B = safeClone(savedState.B, state.B);
    state.playerStats = safeClone(savedState.playerStats, {});
    state.teamPlayerIds = safeClone(savedState.teamPlayerIds, { A: [], B: [] });
    state.statsView = safeClone(savedState.statsView, { A: 'player', B: 'player' });
    state.shotHistory = safeClone(savedState.shotHistory, { A: [], B: [] });
    state.history = safeClone(savedState.history, []);
    state.actionHistory = safeClone(savedState.actionHistory, { A: [], B: [] });

    const runtime = parsed.runtime || {};
    secondsElapsed = Number(runtime.secondsElapsed || 0);
    isPaused = !!runtime.isPaused;
    isTimeout = !!runtime.isTimeout;
    isGameRunning = !!runtime.isGameRunning;
    state.active = runtime.activeTeam === 'B' ? 'B' : 'A';

    if (shotMarkersEl) shotMarkersEl.innerHTML = '';
    const markerIndex = new Map();
    (parsed.markers || []).forEach((markerSnapshot) => {
      const markerEl = createMarkerFromSnapshot(markerSnapshot);
      if (markerEl && markerSnapshot.markerId) markerIndex.set(markerSnapshot.markerId, markerEl);
    });

    ['A', 'B'].forEach((teamKey) => {
      const entries = state.actionHistory[teamKey] || [];
      entries.forEach((entry) => {
        if (entry.markerId && markerIndex.has(entry.markerId)) {
          entry.markerEl = markerIndex.get(entry.markerId);
          entry.markerEl.dataset.actionId = entry.id;
        }
      });
    });

    applyPlayerAssignmentsToButtons();
    populateActivePlayerSelectors();
    timerDisplay.textContent = formatTime(secondsElapsed);

    if (startGameBtn) {
      if (isGameRunning) {
        startGameBtn.textContent = 'End Game';
        startGameBtn.classList.remove('btn-primary');
        startGameBtn.classList.add('btn-danger');
      } else {
        startGameBtn.textContent = 'Start Game';
        startGameBtn.classList.remove('btn-danger');
        startGameBtn.classList.add('btn-primary');
      }
      startGameBtn.disabled = false;
    }

    if (pauseGameBtn) {
      pauseGameBtn.innerHTML = (isPaused || isTimeout)
        ? 'Resume <span class="hotkey-hint">P</span>'
        : 'Pause <span class="hotkey-hint">P</span>';
    }

    updateUI();
    updateShotLogDisplay();
    setActionsEnabled(isGameRunning);
    if (isGameRunning && !isPaused && !isTimeout) startTimer();
    showStartError('');
    return true;
  }

  const playerColorPalette = [
    '#22C55E',
    '#2563EB',
    '#EC4899',
    '#F97316'
  ];

  function hexToRgba(hex, alpha) {
    if (!hex || typeof hex !== 'string' || !hex.startsWith('#')) {
      return `rgba(37, 99, 235, ${alpha})`;
    }
    const normalized = hex.length === 4
      ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`
      : hex;
    const r = parseInt(normalized.slice(1, 3), 16);
    const g = parseInt(normalized.slice(3, 5), 16);
    const b = parseInt(normalized.slice(5, 7), 16);
    if ([r, g, b].some(Number.isNaN)) {
      return `rgba(37, 99, 235, ${alpha})`;
    }
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  function getPlayerColor(player) {
    if (!player) return playerColorPalette[0];

    const playerId = String(player._id || player.id || player.playerId || '');
    const assigned = playerId ? getAssignedPlayerById(playerId) : null;
    if (assigned?.key === 'A') return playerColorPalette[0];
    if (assigned?.key === 'A2') return playerColorPalette[1];
    if (assigned?.key === 'B') return playerColorPalette[2];
    if (assigned?.key === 'B2') return playerColorPalette[3];

    const idSource = playerId || String(player.name || 'player');
    let hash = 0;
    for (let i = 0; i < idSource.length; i += 1) {
      hash = ((hash << 5) - hash) + idSource.charCodeAt(i);
      hash |= 0;
    }
    const idx = Math.abs(hash) % playerColorPalette.length;
    return playerColorPalette[idx];
  }

  function styleShotMarker(marker, player, result) {
    const color = getPlayerColor(player);
    marker.style.boxShadow = `0 0 0 2px ${hexToRgba(color, 0.4)}, 0 2px 6px rgba(0,0,0,0.25)`;
    if (result === 'made') {
      marker.style.borderColor = hexToRgba(color, 0.95);
      marker.style.color = '#fff';
      marker.style.background = hexToRgba(color, 0.88);
      marker.style.fontSize = '10px';
      marker.style.fontWeight = '700';
      return;
    }

    // Misses are always red.
    marker.style.borderColor = 'rgba(198, 40, 40, 0.95)';
    marker.style.color = 'rgba(198, 40, 40, 1)';
    marker.style.background = 'rgba(239, 68, 68, 0.18)';
    marker.style.fontSize = '13px';
    marker.style.fontWeight = '900';
    marker.textContent = 'X';
  }

  function styleFoulMarker(marker, player) {
    // Fouls are always yellow.
    marker.style.boxShadow = '0 0 0 2px rgba(245, 158, 11, 0.45), 0 2px 6px rgba(0,0,0,0.25)';
    marker.style.borderColor = '#92400E';
    marker.style.background = '#F59E0B';
  }

  /**
   * Add a shot marker on the court overlay
   * @param {'A'|'B'} teamKey
  * @param {'2pt'|'3pt'|'4pt'|'ft'} shotType
   * @param {'made'|'missed'} result
   * @param {{xPct:number,yPct:number}} pos
   */
  function addFoulMarker(teamKey, pos, role = 'drawn') {
    if (!shotMarkersEl || !pos) return null;
    
    const marker = document.createElement('div');
    marker.classList.add('foul-marker');
    marker.classList.add(teamKey === 'A' ? 'team-a' : 'team-b');
    
    // Add player initials to the marker
    const player = getActivePlayerForTeam(teamKey);
    const initials = player?.name ? player.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : teamKey;
    marker.textContent = '!';
    marker.style.fontSize = '12px';
    marker.style.fontWeight = '800';
    marker.style.width = '26px';
    marker.style.height = '26px';
    marker.style.borderRadius = role === 'committed' ? '0' : '4px';
    if (role === 'committed') {
      marker.style.clipPath = 'polygon(50% 0%, 0% 100%, 100% 100%)';
    }
    marker.style.display = 'flex';
    marker.style.alignItems = 'center';
    marker.style.justifyContent = 'center';
    marker.style.color = '#fff';
    styleFoulMarker(marker, player);
    
    marker.title = role === 'committed'
      ? `${player?.name || teamKey} - Foul Committed`
      : `${player?.name || teamKey} - Got Fouled`;
    marker.style.left = `${pos.xPct}%`;
    marker.style.top = `${pos.yPct}%`;
    marker.dataset.player = player?.name || teamKey;
    marker.dataset.playerId = player ? String(player._id || player) : '';
    marker.dataset.type = 'foul';
    marker.dataset.foulRole = role;
    shotMarkersEl.appendChild(marker);

    // Highlight as most recent
    setMostRecentMarker(marker);

    return marker;
  }

  function addShotMarker(teamKey, shotType, result, pos) {
    if (!shotMarkersEl || !pos) return;
    const marker = document.createElement('div');
    marker.classList.add('shot-marker');
    marker.classList.add(result === 'made' ? 'made' : 'missed');
    marker.classList.add(teamKey === 'A' ? 'team-a' : 'team-b');

    // Add player initials to the marker
    const player = getActivePlayerForTeam(teamKey);
    const initials = player?.name ? player.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : teamKey;
    marker.textContent = result === 'made' ? initials : 'X';
    marker.style.fontSize = '10px';
    marker.style.fontWeight = 'bold';
    marker.style.display = 'flex';
    marker.style.alignItems = 'center';
    marker.style.justifyContent = 'center';
    styleShotMarker(marker, player, result);

    marker.title = `${player?.name || teamKey} - ${shotType.toUpperCase()} ${result}`;
    marker.style.left = `${pos.xPct}%`;
    marker.style.top = `${pos.yPct}%`;
    marker.dataset.player = player?.name || teamKey;
    marker.dataset.playerId = player ? String(player._id || player) : '';
    marker.dataset.shotType = shotType;
    marker.dataset.result = result;
    shotMarkersEl.appendChild(marker);

    // Highlight as most recent
    setMostRecentMarker(marker);

    // Log to shot history
    logShotToHistory(teamKey, shotType, result, pos);

    return marker;
  }

  /**
   * Append a shot entry to the active player's shot history
   * and update the Latest Shot panel.
   * @param {'A'|'B'} teamKey
  * @param {'2pt'|'3pt'|'4pt'|'ft'} shotType
   * @param {'made'|'missed'} result
    * @param {{xPct:number,yPct:number}|null} pos
   */
    function logShotToHistory(teamKey, shotType, result, pos = null) {
    const shotLog = document.getElementById('shot_log');
    if (!shotLog) return;
    
    const player = getActivePlayerForTeam(teamKey);
    const playerName = player?.name || `Team ${teamKey}`;
    
    // Use game timer instead of clock time
    const mins = Math.floor(secondsElapsed / 60);
    const secs = secondsElapsed % 60;
    const gameTime = `${mins}:${secs.toString().padStart(2, '0')}`;
    
    const shotEmoji = result === 'made' ? '✓' : '✗';
    const shotLabel = shotType === '4pt' ? '4PT' : shotType === '3pt' ? '3PT' : shotType === '2pt' ? '2PT' : 'FT';
    const resultColor = result === 'made' ? '#4caf50' : '#f44336';
    
    // Store shot in history for this player
    const shotEntry = {
      player: playerName,
      playerId: player ? String(player._id || player) : '',
      teamKey: teamKey,
      shotType: shotLabel,
      result: result,
      gameTime: gameTime,
      resultColor: resultColor,
      shotEmoji: shotEmoji,
      timestamp: secondsElapsed,
      pos: pos ? { xPct: Number(pos.xPct), yPct: Number(pos.yPct) } : null,
      type: 'shot'
    };
    
    state.shotHistory[teamKey].push(shotEntry);
    
    // Update display for current active player
    updateShotLogDisplay();
  }

  function logFoulToHistory(teamKey, pos = null, actionId = null, foulRole = 'committed', playerOverride = null, logAction = true, counterpartName = '') {
    const player = playerOverride || getActivePlayerForTeam(teamKey);
    const playerName = player?.name || `Team ${teamKey}`;
    
    // Use game timer
    const mins = Math.floor(secondsElapsed / 60);
    const secs = secondsElapsed % 60;
    const gameTime = `${mins}:${secs.toString().padStart(2, '0')}`;
    
    // Store foul in history for this player
    const foulEntry = {
      player: playerName,
      playerId: player ? String(player._id || player) : '',
      teamKey: teamKey,
      shotType: 'FOUL',
      result: 'recorded',
      foulRole: foulRole === 'drawn' ? 'drawn' : 'committed',
      gameTime: gameTime,
      resultColor: '#ff6f00',
      shotEmoji: '🚫',
      timestamp: secondsElapsed,
      pos: pos ? { xPct: Number(pos.xPct), yPct: Number(pos.yPct) } : null,
      type: 'foul'
    };
    
    state.shotHistory[teamKey].push(foulEntry);
    
    // Add foul marker on court if position is available
    let foulMarker = null;
    if (pos) {
      foulMarker = addFoulMarker(teamKey, pos, foulEntry.foulRole);
    }
    
    // Also log to new action history system
    if (logAction) {
      const relatedName = String(counterpartName || '').trim();
      const label = foulEntry.foulRole === 'drawn'
        ? `Got Fouled${relatedName ? ` by ${relatedName}` : ''}`
        : `Committed Foul${relatedName ? ` on ${relatedName}` : ''}`;
      addActionEntry(teamKey, {
        id: actionId || undefined,
        label,
        type: 'foul',
        gameSeconds: secondsElapsed,
        playerId: foulEntry.playerId,
        playerName,
        markerEl: foulMarker || null
      });
    }
    
    // Update display for current active player
    updateShotLogDisplay();
    
    return foulMarker;
  }

  function formatGameTime(seconds) {
    if (typeof seconds !== 'number') return '—';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  function formatTimestamp(ts) {
    if (!ts) return '—';
    const date = new Date(ts);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function stopPlaybackTimer() {
    if (playbackTimer) {
      clearInterval(playbackTimer);
      playbackTimer = null;
    }
  }

  function setPlaybackPlayState(isPlaying) {
    playbackIsPlaying = !!isPlaying;
    if (playbackModal.playPauseBtn) {
      playbackModal.playPauseBtn.textContent = playbackIsPlaying ? 'Pause' : 'Play';
    }
  }

  function resolvePlaybackPlayerName(entry, teamKey) {
    if (entry?.player && String(entry.player).trim()) {
      return String(entry.player).trim();
    }
    const assigned = entry?.playerId ? getAssignedPlayerById(entry.playerId) : null;
    if (assigned?.key && gameContext.players[assigned.key]?.name) {
      return gameContext.players[assigned.key].name;
    }
    return getTeamDisplayName(teamKey);
  }

  function resolvePlaybackPlayerColor(entry) {
    const assigned = entry?.playerId ? getAssignedPlayerById(entry.playerId) : null;
    const playerRef = assigned?.key
      ? gameContext.players[assigned.key]
      : { _id: entry?.playerId || '', name: entry?.player || 'Player' };
    return getPlayerColor(playerRef);
  }

  function parseMarkerPosition(markerEl) {
    if (!markerEl) return null;
    const left = Number.parseFloat(String(markerEl.style.left || '').replace('%', ''));
    const top = Number.parseFloat(String(markerEl.style.top || '').replace('%', ''));
    if (!Number.isFinite(left) || !Number.isFinite(top)) return null;
    return { xPct: left, yPct: top };
  }

  function getActionMarkerElement(action) {
    if (action?.markerEl) return action.markerEl;
    if (!action?.markerId || !shotMarkersEl) return null;
    return shotMarkersEl.querySelector(`[data-marker-id="${action.markerId}"]`);
  }

  function getPlaybackPointValue(action) {
    const type = String(action?.type || '').toLowerCase();
    const label = String(action?.label || '').toUpperCase();
    if (type === '4pt' || label.includes('4PT')) return 4;
    if (type === '3pt' || label.includes('3PT')) return 3;
    if (type === '2pt' || label.includes('2PT')) return 2;
    if (type === 'ft' || type === 'free_throw' || label.includes('FT')) return 1;
    return 0;
  }

  function getPlaybackResultLabel(action) {
    const label = String(action?.label || '').toLowerCase();
    if (label.includes('made')) return 'Made';
    if (label.includes('missed')) return 'Missed';
    return '';
  }

  function buildTeamPlaybackSteps(teamKey) {
    const timeline = [...(state.actionHistory[teamKey] || [])];
    let runningPoints = 0;

    return timeline.map((action) => {
      const markerEl = getActionMarkerElement(action);
      const actionType = action.type === 'foul'
        ? 'foul'
        : (getPlaybackResultLabel(action) ? 'shot' : 'event');
      const resultLabel = getPlaybackResultLabel(action);
      const points = resultLabel === 'Made' ? getPlaybackPointValue(action) : 0;
      runningPoints += points;

      const playerEntry = {
        player: action.playerName,
        playerId: action.playerId,
        foulRole: markerEl?.dataset?.foulRole || 'committed'
      };

      return {
        playerName: resolvePlaybackPlayerName(playerEntry, teamKey),
        playerColor: resolvePlaybackPlayerColor(playerEntry),
        actionType,
        foulRole: playerEntry.foulRole === 'drawn' ? 'drawn' : 'committed',
        label: action.label || 'Action',
        result: resultLabel,
        gameTime: action.timeLabel || formatGameTime(action.gameSeconds),
        pointsAfter: runningPoints,
        pos: parseMarkerPosition(markerEl)
      };
    });
  }

  function clampPercent(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return 50;
    return Math.max(0, Math.min(100, numeric));
  }

  function renderPlaybackCourt() {
    if (!playbackModal.courtOverlay) return;

    if (!playbackSteps.length) {
      playbackModal.courtOverlay.innerHTML = '';
      return;
    }

    const visibleShots = playbackSteps
      .slice(0, playbackIndex + 1)
      .filter((step) => step.actionType === 'shot' || step.actionType === 'foul')
      .filter((step) => step.pos && Number.isFinite(Number(step.pos.xPct)) && Number.isFinite(Number(step.pos.yPct)));

    playbackModal.courtOverlay.innerHTML = visibleShots.map((step, idx) => {
      const isActive = idx === visibleShots.length - 1;
      const shotClass = step.actionType === 'foul'
        ? `is-foul ${step.foulRole === 'drawn' ? 'is-foul-drawn' : 'is-foul-committed'}`
        : (step.result === 'Made' ? 'is-made' : 'is-missed');
      const left = clampPercent(step.pos.xPct);
      const top = clampPercent(step.pos.yPct);
      const madeColorStyle = step.actionType === 'shot' && step.result === 'Made' && step.playerColor
        ? `--playback-made-color:${step.playerColor};`
        : '';
      return `<div class="playback-court-shot ${shotClass} ${isActive ? 'active' : ''}" style="left:${left}%; top:${top}%; ${madeColorStyle}" title="${step.playerName} - ${step.label}${step.result ? ` ${step.result}` : ''}"></div>`;
    }).join('');
  }

  function renderPlaybackModalState() {
    if (!playbackModal.meta || !playbackModal.current || !playbackModal.list) return;
    const total = playbackSteps.length;
    const currentStep = total > 0 ? playbackSteps[playbackIndex] : null;
    const teamName = playbackTeamKey ? getTeamDisplayName(playbackTeamKey) : 'Team';

    playbackModal.meta.textContent = total > 0
      ? `${teamName} • Step ${playbackIndex + 1} of ${total}`
      : `${teamName} • No actions recorded`;

    playbackModal.current.textContent = currentStep
      ? `${currentStep.gameTime} • ${currentStep.playerName} • ${currentStep.label}${currentStep.result ? ` ${currentStep.result}` : ''} • Team PTS: ${currentStep.pointsAfter}`
      : 'No action sequence available for this team yet.';

    if (playbackModal.prevBtn) playbackModal.prevBtn.disabled = total === 0 || playbackIndex <= 0;
    if (playbackModal.nextBtn) playbackModal.nextBtn.disabled = total === 0 || playbackIndex >= total - 1;
    if (playbackModal.playPauseBtn) playbackModal.playPauseBtn.disabled = total <= 1;

    playbackModal.list.innerHTML = total > 0
      ? playbackSteps.map((step, idx) => `
          <div class="playback-step-item ${idx === playbackIndex ? 'active' : ''}">
            ${idx + 1}. ${step.gameTime} • ${step.playerName} • ${step.label}${step.result ? ` ${step.result}` : ''} • Team PTS: ${step.pointsAfter}
          </div>
        `).join('')
      : '<div class="playback-step-item">No actions recorded for this team.</div>';

    const activeEl = playbackModal.list.querySelector('.playback-step-item.active');
    if (activeEl) {
      activeEl.scrollIntoView({ block: 'nearest' });
    }
    renderPlaybackCourt();
  }

  function stepPlayback(delta) {
    if (!playbackSteps.length) return;
    const next = Math.max(0, Math.min(playbackSteps.length - 1, playbackIndex + delta));
    playbackIndex = next;
    renderPlaybackModalState();
  }

  function startPlaybackAuto() {
    if (playbackSteps.length <= 1) return;
    stopPlaybackTimer();
    setPlaybackPlayState(true);
    playbackTimer = setInterval(() => {
      if (playbackIndex >= playbackSteps.length - 1) {
        stopPlaybackTimer();
        setPlaybackPlayState(false);
        return;
      }
      stepPlayback(1);
    }, PLAYBACK_INTERVAL_MS);
  }

  function closePlaybackModal() {
    stopPlaybackTimer();
    setPlaybackPlayState(false);
    if (playbackModal.overlay) playbackModal.overlay.style.display = 'none';
  }

  function openPlaybackModal(teamKey) {
    playbackTeamKey = teamKey;
    playbackSteps = buildTeamPlaybackSteps(teamKey);
    playbackIndex = 0;
    stopPlaybackTimer();
    setPlaybackPlayState(false);

    if (playbackModal.title) {
      playbackModal.title.textContent = `${getTeamDisplayName(teamKey)} Playback`;
    }
    renderPlaybackModalState();
    if (playbackModal.overlay) playbackModal.overlay.style.display = 'flex';
  }

  function addActionEntry(teamKey, entry) {
    if (!state.actionHistory[teamKey]) return;
    const activePlayer = getActivePlayerForTeam(teamKey);
    const resolvedPlayerId = entry.playerId || (activePlayer ? String(activePlayer._id || activePlayer) : '');
    const resolvedPlayerName = entry.playerName || (activePlayer?.name || `Team ${teamKey}`);
    const actionId = entry.id || `action_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const action = {
      id: actionId,
      teamKey,
      playerId: resolvedPlayerId,
      playerName: resolvedPlayerName,
      label: entry.label,
      gameSeconds: typeof entry.gameSeconds === 'number' ? entry.gameSeconds : null,
      timeLabel: entry.timeLabel || formatGameTime(entry.gameSeconds),
      timestamp: entry.timestamp || Date.now(),
      highlighted: !!entry.highlighted,
      type: entry.type || 'action',
      note: entry.note || '',
      markerEl: entry.markerEl || null,
      markerId: entry.markerId || null
    };
    if (action.markerEl) {
      action.markerId = action.markerEl.dataset.markerId || action.markerId || `marker_${Date.now()}_${Math.random().toString(16).slice(2)}`;
      action.markerEl.dataset.markerId = action.markerId;
      action.markerEl.dataset.actionId = action.id;
    }
    state.actionHistory[teamKey].push(action);
    setMostRecentAction(action.id);
    renderActionLog(teamKey);
  }

  function removeActionEntryById(teamKey, actionId) {
    const actions = state.actionHistory[teamKey] || [];
    const index = actions.findIndex((action) => action.id === actionId);
    if (index === -1) return false;

    if (highlightedActionMarker) {
      const highlightedId = highlightedActionMarker.dataset.actionId;
      if (highlightedId && highlightedId === actionId) {
        clearHighlightedActionMarker();
      }
    }

    actions.splice(index, 1);
    renderActionLog(teamKey);
    return true;
  }

  function revertHistoryChange(change) {
    if (!change) return;

    if ((change.kind === 'shot' || change.kind === 'foul') && change.marker) {
      change.marker.remove();
    }
    if ((change.kind === 'shot' || change.kind === 'foul') && change.secondaryMarker) {
      change.secondaryMarker.remove();
    }

    if (change.kind === 'shot') {
      const team = change.team === 'A' ? state.A : state.B;
      if (change.shotType === '4pt') {
        if (team.fourPA > 0) team.fourPA -= 1;
        if (change.result === 'made' && team.fourPM > 0) team.fourPM -= 1;
      } else if (change.shotType === '3pt') {
        if (team.threePA > 0) team.threePA -= 1;
        if (change.result === 'made' && team.threePM > 0) team.threePM -= 1;
      } else if (change.shotType === '2pt') {
        if (team.twoPA > 0) team.twoPA -= 1;
        if (change.result === 'made' && team.twoPM > 0) team.twoPM -= 1;
      } else if (change.shotType === 'ft') {
        if (team.ftA > 0) team.ftA -= 1;
        if (change.result === 'made' && team.ftM > 0) team.ftM -= 1;
      }
      if (change.playerId) {
        applyPlayerShotDelta(change.playerId, change.shotType, change.result, -1);
      }
      return;
    }

    if (change.kind === 'foul') {
      const team = change.team === 'A' ? state.A : state.B;
      if (team.fouls > 0) team.fouls -= 1;
      if (change.playerId) {
        applyPlayerFoulDelta(change.playerId, -1);
      }
    }
  }

  function undoActionById(teamKey, actionId) {
    if (!actionId) return false;

    let historyIndex = -1;
    for (let i = state.history.length - 1; i >= 0; i -= 1) {
      const change = state.history[i];
      if (change.team === teamKey && change.actionId === actionId) {
        historyIndex = i;
        break;
      }
    }

    if (historyIndex === -1) return removeActionEntryById(teamKey, actionId);

    const [change] = state.history.splice(historyIndex, 1);
    revertHistoryChange(change);
    removeActionEntryById(teamKey, actionId);
    updateUI();
    return true;
  }

  let highlightedActionMarker = null;

  function clearHighlightedActionMarker() {
    if (highlightedActionMarker) {
      highlightedActionMarker.classList.remove('linked-highlight');
      highlightedActionMarker = null;
    }
  }

  function findMarkerForActionEntry(entry) {
    if (!entry) return null;
    if (entry.markerEl && document.body.contains(entry.markerEl)) return entry.markerEl;
    if (entry.markerId) {
      return document.querySelector(`[data-marker-id="${entry.markerId}"]`);
    }
    return null;
  }

  function highlightMarkerForAction(teamKey, actionId) {
    clearHighlightedActionMarker();
    if (!actionId) return;
    const entry = (state.actionHistory[teamKey] || []).find((a) => a.id === actionId);
    if (!entry) return;
    const marker = findMarkerForActionEntry(entry);
    if (!marker) return;

    marker.classList.add('linked-highlight');
    highlightedActionMarker = marker;
  }

  function wireActionHover(container, teamKey) {
    if (!container) return;

    container.addEventListener('mouseover', (e) => {
      const actionItem = e.target.closest('.action-item');
      if (!actionItem || !container.contains(actionItem)) return;
      const actionId = actionItem.dataset.id;
      if (!actionId) {
        clearHighlightedActionMarker();
        return;
      }
      highlightMarkerForAction(teamKey, actionId);
    });

    container.addEventListener('mouseout', (e) => {
      const actionItem = e.target.closest('.action-item');
      if (!actionItem || !container.contains(actionItem)) return;
      const related = e.relatedTarget;
      if (related && actionItem.contains(related)) return;
      clearHighlightedActionMarker();
    });
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function renderActionLog(teamKey) {
    const container = teamKey === 'A' ? els.a.actions : els.b.actions;
    if (!container) return;
    const actions = state.actionHistory[teamKey] || [];
    const activePlayer = getActivePlayerForTeam(teamKey);
    const activePlayerId = activePlayer ? String(activePlayer._id || activePlayer) : '';
    const visibleActions = gameContext.ruleMode === 'tag-team-1v1'
      ? actions.filter((action) => !activePlayerId || String(action.playerId || '') === activePlayerId)
      : actions;
    container.innerHTML = '';

    if (visibleActions.length === 0) {
      container.innerHTML = '<div class="action-item"><div class="action-item__content"><div class="action-item__label">No actions for current player</div></div></div>';
      return;
    }

    const ordered = [...visibleActions].reverse();
    ordered.forEach((action) => {
      const item = document.createElement('div');
      const isMostRecent = action.id === mostRecentActionId;
      item.className = `action-item${action.highlighted ? ' highlighted' : ''}${isMostRecent ? ' most-recent' : ''}`;
      item.dataset.team = teamKey;
      item.dataset.id = action.id;
      const noteHtml = action.note ? `<div class="action-item__note">${escapeHtml(action.note)}</div>` : '';
      item.innerHTML = `
        <div class="action-item__content">
          <div class="action-item__header">
            <div class="action-item__label">${action.label}</div>
            <div class="action-item__time">${action.timeLabel || '—'}</div>
          </div>
          ${noteHtml}
        </div>
        <div class="action-item__controls">
          <button class="action-btn add-note" data-action="note" title="Add note" type="button">📝</button>
          <button class="action-btn highlight" data-action="highlight" type="button">${action.highlighted ? '⭐' : '☆'}</button>
          <button class="action-btn delete" data-action="delete" type="button">✕</button>
        </div>
      `;
      container.appendChild(item);
    });
  }

  function seedActionFromEvent(event, teamKey) {
    if (!teamKey) return;
    const eventPlayerId = event.player_id?._id ? String(event.player_id._id) : String(event.player_id || '');
    const assigned = getAssignedPlayerById(eventPlayerId);
    const eventPlayerName = assigned?.key ? (gameContext.players[assigned.key]?.name || `Team ${teamKey}`) : `Team ${teamKey}`;
    if (event.type === 'shot') {
      const pointsLabel = event.points === 4 ? '4PT' : event.points === 3 ? '3PT' : '2PT';
      const label = `${pointsLabel} ${event.made ? 'Made' : 'Missed'}`;
      addActionEntry(teamKey, {
        label,
        type: 'shot',
        timeLabel: formatTimestamp(event.timestamp),
        timestamp: event.timestamp,
        playerId: eventPlayerId,
        playerName: eventPlayerName
      });
      return;
    }
    if (event.type === 'free_throw') {
      const label = `FT ${event.made ? 'Made' : 'Missed'}`;
      addActionEntry(teamKey, {
        label,
        type: 'free_throw',
        timeLabel: formatTimestamp(event.timestamp),
        timestamp: event.timestamp,
        playerId: eventPlayerId,
        playerName: eventPlayerName
      });
      return;
    }
    if (event.type === 'foul') {
      addActionEntry(teamKey, {
        label: 'Foul',
        type: 'foul',
        timeLabel: formatTimestamp(event.timestamp),
        timestamp: event.timestamp,
        playerId: eventPlayerId,
        playerName: eventPlayerName
      });
    }
  }

  function refreshVisibleMarkers() {
    const teamAPlayer = getActivePlayerForTeam('A');
    const teamBPlayer = getActivePlayerForTeam('B');
    const teamAPlayerId = teamAPlayer ? String(teamAPlayer._id || teamAPlayer) : '';
    const teamBPlayerId = teamBPlayer ? String(teamBPlayer._id || teamBPlayer) : '';
    const isTagMode = gameContext.ruleMode === 'tag-team-1v1';

    const applyVisibility = (selector, teamKey, activePlayerId) => {
      const isTeamView = (state.statsView[teamKey] || 'player') === 'team';
      document.querySelectorAll(selector).forEach((marker) => {
        const isActiveTeam = state.active === teamKey;
        if (!isActiveTeam) {
          marker.style.display = 'none';
          return;
        }

        // In team view, show all markers for this team
        if (isTeamView || !isTagMode) {
          marker.style.display = 'flex';
          return;
        }

        // In player view + tag mode, only show active player's markers
        const markerPlayerId = String(marker.dataset.playerId || '');
        marker.style.display = !activePlayerId || markerPlayerId === activePlayerId ? 'flex' : 'none';
      });
    };

    applyVisibility('.shot-marker.team-a, .foul-marker.team-a', 'A', teamAPlayerId);
    applyVisibility('.shot-marker.team-b, .foul-marker.team-b', 'B', teamBPlayerId);
  }

  function updateShotLogDisplay() {
    const shotLog = document.getElementById('shot_log');
    if (!shotLog) return;
    
    // Get shots for active player
    const activeTeamShots = state.shotHistory[state.active] || [];
    const activePlayer = getActivePlayerForTeam(state.active);
    const activePlayerId = activePlayer ? String(activePlayer._id || activePlayer) : '';
    const activeShots = gameContext.ruleMode === 'tag-team-1v1'
      ? activeTeamShots.filter((shot) => !activePlayerId || String(shot.playerId || '') === activePlayerId)
      : activeTeamShots;
    
    // Clear the log
    shotLog.innerHTML = '';
    
    if (activeShots.length === 0) {
      shotLog.innerHTML = '<div style="padding: 15px; text-align: center; color: #999; font-size: 12px;">No shots for current player</div>';
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
    currentAssignTarget = null;
  }

  function getPlayerSlotKey(teamKey, slotIndex) {
    if (teamKey === 'A') return slotIndex === 2 ? 'A2' : 'A';
    return slotIndex === 2 ? 'B2' : 'B';
  }

  function getAssignedPlayerById(playerId) {
    const slots = [
      { team: 'A', slot: 1, key: 'A' },
      { team: 'A', slot: 2, key: 'A2' },
      { team: 'B', slot: 1, key: 'B' },
      { team: 'B', slot: 2, key: 'B2' }
    ];
    return slots.find(({ key }) => {
      const p = gameContext.players[key];
      return p && String(p._id) === String(playerId);
    }) || null;
  }

  function populateActivePlayerSelectors() {
    const selectMap = {
      A: els.teamAActivePlayer,
      B: els.teamBActivePlayer
    };

    ['A', 'B'].forEach((teamKey) => {
      const selectEl = selectMap[teamKey];
      if (!selectEl) return;

      const players = getTeamPlayers(teamKey);
      selectEl.innerHTML = '';

      players.forEach((player, idx) => {
        const option = document.createElement('option');
        option.value = String(idx);
        option.textContent = player?.name || `${teamKey} Player ${idx + 1}`;
        selectEl.appendChild(option);
      });

      const maxIdx = Math.max(players.length - 1, 0);
      const current = gameContext.activePlayerIndex[teamKey] || 0;
      gameContext.activePlayerIndex[teamKey] = Math.min(current, maxIdx);
      selectEl.value = String(gameContext.activePlayerIndex[teamKey]);
      selectEl.disabled = players.length < 2;
    });
  }

  function refreshRuleModeUI() {
    const isTagMode = gameContext.ruleMode === 'tag-team-1v1';

    if (els.gameRuleSelect) {
      els.gameRuleSelect.value = gameContext.ruleMode;
      els.gameRuleSelect.disabled = isGameRunning;
    }

    if (selectorEls.A.assignBtn2) selectorEls.A.assignBtn2.style.display = isTagMode ? 'block' : 'none';
    if (selectorEls.B.assignBtn2) selectorEls.B.assignBtn2.style.display = isTagMode ? 'block' : 'none';
    if (els.teamAActivePicker) els.teamAActivePicker.style.display = isTagMode ? 'block' : 'none';
    if (els.teamBActivePicker) els.teamBActivePicker.style.display = isTagMode ? 'block' : 'none';

    populateActivePlayerSelectors();
  }

  function setRuleMode(nextMode) {
    if (isGameRunning) return;
    gameContext.ruleMode = nextMode === 'tag-team-1v1' ? 'tag-team-1v1' : '1v1';

    if (gameContext.ruleMode !== 'tag-team-1v1') {
      gameContext.players.A2 = null;
      gameContext.players.B2 = null;
      gameContext.activePlayerIndex.A = 0;
      gameContext.activePlayerIndex.B = 0;
    }

    refreshRuleModeUI();
    updateUI();

    if (playersAssigned()) {
      if (startGameBtn) startGameBtn.disabled = false;
      showStartError('');
    } else {
      if (startGameBtn) startGameBtn.disabled = true;
      showStartError(`Assign ${requiredPlayersPerTeam()} player(s) to each team before starting the game.`);
    }
  }

  function openShotModal(shotType) {
    pendingShotType = shotType;
    if (shotModal.overlay) shotModal.overlay.style.display = 'flex';
    if (shotModal.title) shotModal.title.textContent = 'Log Shot';
    if (shotModal.info) {
      const shotTypeLabel = shotType === '4pt' ? '4PT' : shotType === '3pt' ? '3PT' : '2PT';
      shotModal.info.textContent = `${shotTypeLabel} attempt`;
    }
  }

  function closeShotModal() {
    pendingShotType = null;
    if (shotModal.overlay) shotModal.overlay.style.display = 'none';
  }

  function openModal(teamKey, slotIndex = 1) {
    currentAssignTarget = { teamKey, slotIndex };
    if (modalEls.overlay) modalEls.overlay.style.display = 'flex';
    const slotLabel = slotIndex === 2 ? 'Tag Partner' : 'Primary Player';
    if (modalEls.title) modalEls.title.textContent = `Assign ${slotLabel} (${teamKey})`;
    if (modalEls.message) modalEls.message.textContent = '';
    if (modalEls.results) modalEls.results.innerHTML = '';
    if (modalEls.searchInput) {
      modalEls.searchInput.value = '';
      modalEls.searchInput.focus();
    }
    if (modalEls.createName) modalEls.createName.value = '';
    if (modalEls.createIg) modalEls.createIg.value = '';
  }

  function setPlayer(teamKey, player, slotIndex = 1) {
    if (!player || !player._id) return;

    const existingAssignment = getAssignedPlayerById(player._id);
    if (existingAssignment && !(existingAssignment.team === teamKey && existingAssignment.slot === slotIndex)) {
      alert(`${player.name} is already assigned to Team ${existingAssignment.team}. A player cannot be on both teams.`);
      return;
    }

    const slotKey = getPlayerSlotKey(teamKey, slotIndex);
    gameContext.players[slotKey] = player;

    const btn = slotIndex === 2 ? selectorEls[teamKey].assignBtn2 : selectorEls[teamKey].assignBtn;
    if (btn) {
      btn.textContent = player.name || 'Unnamed';
    }

    if (playersAssigned()) {
      startGameBtn.disabled = false;
      showStartError('');
    } else {
      startGameBtn.disabled = true;
      showStartError(`Assign ${requiredPlayersPerTeam()} player(s) to each team before starting the game.`);
    }

    populateActivePlayerSelectors();
    updateUI(); // Update display to show player name
    closeModal();
  }

  function setActive(teamKey, options = {}) {
    state.active = teamKey;
    updateUI();
    updateShotLogDisplay();  // Update shot log to show this player's shots
    if (options.logAction) {
      addActionEntry(teamKey, {
        label: options.label || 'Switched Active Team',
        type: 'hotkey',
        gameSeconds: secondsElapsed,
        playerId: getPlayerId(teamKey),
        playerName: getActivePlayerForTeam(teamKey)?.name || `Team ${teamKey}`
      });
    }
  }

  function swapActiveTeammate(teamKey = state.active) {
    if (gameContext.ruleMode !== 'tag-team-1v1') return false;
    const teammates = getTeamPlayers(teamKey);
    if (teammates.length < 2) return false;

    gameContext.activePlayerIndex[teamKey] = (gameContext.activePlayerIndex[teamKey] === 0) ? 1 : 0;
    updateUI();
    updateShotLogDisplay();
    addActionEntry(teamKey, {
      label: 'Swapped Active Teammate',
      type: 'hotkey',
      gameSeconds: secondsElapsed,
      playerId: getPlayerId(teamKey),
      playerName: getActivePlayerForTeam(teamKey)?.name || `Team ${teamKey}`
    });
    return true;
  }

  function renderResults(teamKey, slotIndex, players) {
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
      
      const existingAssignment = getAssignedPlayerById(p._id);
      const isAlreadyAssigned = !!existingAssignment && !(existingAssignment.team === teamKey && existingAssignment.slot === slotIndex);
      
      if (isAlreadyAssigned) {
        btn.textContent = `${p.name || p.instagram_handle || 'Unnamed'} (already assigned)`;
        btn.disabled = true;
        btn.style.opacity = '0.5';
        btn.style.cursor = 'not-allowed';
        btn.title = 'This player is already assigned in the current game setup';
      } else {
        btn.textContent = p.name || p.instagram_handle || 'Unnamed';
        btn.title = p.instagram_handle ? `@${p.instagram_handle}` : '';
        btn.addEventListener('click', () => setPlayer(teamKey, p, slotIndex));
      }
      box.appendChild(btn);
    });
    box.classList.add('show');
  }

  async function searchAndRender(teamKey, slotIndex, term) {
    const value = term ?? modalEls.searchInput?.value ?? '';
    try {
      const players = await apiClient.searchPlayers(value);
      renderResults(teamKey, slotIndex, players);
    } catch (err) {
      console.error('Search players failed', err);
      renderResults(teamKey, slotIndex, []);
    }
  }

  async function createAndAssign(teamKey, slotIndex) {
    const name = modalEls.createName?.value?.trim();
    const ig = modalEls.createIg?.value?.trim();
    if (!name) {
      alert('Please enter a name');
      return;
    }
    try {
      const player = await apiClient.createPlayer({ name, instagram_handle: ig });
      setPlayer(teamKey, player, slotIndex);
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
    const player = getActivePlayerForTeam(teamKey);
    // Handle both storing full object or just ID
    return player ? (player._id || player) : null;
  }

  async function persistGameEvent(teamKey, eventPayload, pos = null) {
    if (!SYNC_LIVE_EVENTS_TO_BACKEND) {
      return { skipped: true, reason: 'live-event-sync-disabled' };
    }

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

  async function persistBufferedChange(change) {
    if (!gameContext.gameId || !change || change.persisted) return;
    if (!change.playerId || !change.team) return;

    const teamField = change.team === 'A' ? 'team_a' : 'team_b';
    const location = change.pos ? { x: change.pos.xPct, y: change.pos.yPct } : undefined;

    if (change.kind === 'foul') {
      const foulPayload = {
        type: 'foul',
        player_id: change.playerId,
        team: teamField
      };
      if (location) foulPayload.location = location;
      await apiClient.addGameEvent(gameContext.gameId, foulPayload);
      change.persisted = true;
      return;
    }

    if (change.kind !== 'shot') return;

    const isFT = change.shotType === 'ft';
    const points = isFT ? 1 : change.shotType === '4pt' ? 4 : change.shotType === '3pt' ? 3 : 2;
    const baseShotPayload = {
      type: isFT ? 'free_throw' : 'shot',
      player_id: change.playerId,
      team: teamField,
      made: change.result === 'made',
      points
    };
    if (location) baseShotPayload.location = location;

    // Try native payload first. If backend rejects 4PT, degrade to 3PT + FT (made only) to preserve total points.
    if (change.shotType !== '4pt') {
      await apiClient.addGameEvent(gameContext.gameId, baseShotPayload);
      change.persisted = true;
      return;
    }

    try {
      await apiClient.addGameEvent(gameContext.gameId, baseShotPayload);
      change.persisted = true;
    } catch (err) {
      const fallbackShot = {
        type: 'shot',
        player_id: change.playerId,
        team: teamField,
        made: change.result === 'made',
        points: 3
      };
      if (location) fallbackShot.location = location;
      await apiClient.addGameEvent(gameContext.gameId, fallbackShot);

      if (change.result === 'made') {
        await apiClient.addGameEvent(gameContext.gameId, {
          type: 'free_throw',
          player_id: change.playerId,
          team: teamField,
          made: true,
          points: 1
        });
      }

      change.persisted = true;
      console.warn('4PT event persisted via backend compatibility fallback (3PT + FT).', err);
    }
  }

  async function flushBufferedEventsToBackend() {
    if (SYNC_LIVE_EVENTS_TO_BACKEND) return;
    const pending = state.history.filter((change) =>
      (change.kind === 'shot' || change.kind === 'foul') && !change.persisted
    );

    for (const change of pending) {
      await persistBufferedChange(change);
    }
  }

  function computePoints(t) {
    return t.twoPM * 2 + t.threePM * 3 + t.fourPM * 4 + t.ftM * 1;
  }

  function createEmptyStats() {
    return { twoPA: 0, twoPM: 0, threePA: 0, threePM: 0, fourPA: 0, fourPM: 0, ftA: 0, ftM: 0, fouls: 0 };
  }

  function getOrCreatePlayerStats(playerId) {
    const id = String(playerId || '');
    if (!id) return null;
    if (!state.playerStats[id]) {
      state.playerStats[id] = createEmptyStats();
    }
    return state.playerStats[id];
  }

  function applyPlayerShotDelta(playerId, shotType, result, delta = 1) {
    const stats = getOrCreatePlayerStats(playerId);
    if (!stats) return;

    if (shotType === '4pt') {
      stats.fourPA = Math.max(0, stats.fourPA + delta);
      if (result === 'made') stats.fourPM = Math.max(0, stats.fourPM + delta);
      return;
    }
    if (shotType === '3pt') {
      stats.threePA = Math.max(0, stats.threePA + delta);
      if (result === 'made') stats.threePM = Math.max(0, stats.threePM + delta);
      return;
    }
    if (shotType === '2pt') {
      stats.twoPA = Math.max(0, stats.twoPA + delta);
      if (result === 'made') stats.twoPM = Math.max(0, stats.twoPM + delta);
      return;
    }
    if (shotType === 'ft') {
      stats.ftA = Math.max(0, stats.ftA + delta);
      if (result === 'made') stats.ftM = Math.max(0, stats.ftM + delta);
    }
  }

  function applyPlayerFoulDelta(playerId, delta = 1) {
    const stats = getOrCreatePlayerStats(playerId);
    if (!stats) return;
    stats.fouls = Math.max(0, stats.fouls + delta);
  }

  function computeTeamTotals(teamKey) {
    const ids = state.teamPlayerIds[teamKey] || [];
    if (ids.length === 0) return teamKey === 'A' ? state.A : state.B;
    const totals = createEmptyStats();
    for (const id of ids) {
      const ps = state.playerStats[id];
      if (!ps) continue;
      totals.twoPA += ps.twoPA; totals.twoPM += ps.twoPM;
      totals.threePA += ps.threePA; totals.threePM += ps.threePM;
      totals.fourPA += ps.fourPA; totals.fourPM += ps.fourPM;
      totals.ftA += ps.ftA; totals.ftM += ps.ftM;
      totals.fouls += ps.fouls;
    }
    return totals;
  }

  function getDisplayStatsForTeam(teamKey) {
    const viewMode = state.statsView[teamKey] || 'player';
    if (viewMode === 'team') {
      return {
        stats: computeTeamTotals(teamKey),
        scopeLabel: `Showing: ${getTeamDisplayName(teamKey)} Team Totals`
      };
    }

    const activePlayer = getActivePlayerForTeam(teamKey);
    const playerId = activePlayer ? String(activePlayer._id || activePlayer) : '';
    const stats = playerId ? (state.playerStats[playerId] || createEmptyStats()) : createEmptyStats();
    const playerName = activePlayer?.name || `Team ${teamKey} Active Player`;
    return {
      stats,
      scopeLabel: `Showing: ${playerName} (Individual)`
    };
  }

  function getFGPercentage(t) {
    const totalFG = t.twoPA + t.threePA + t.fourPA;
    if (totalFG === 0) return 0;
    return ((t.twoPM + t.threePM + t.fourPM) / totalFG * 100).toFixed(1);
  }

  function get4PPercentage(t) {
    if (t.fourPA === 0) return 0;
    return (t.fourPM / t.fourPA * 100).toFixed(1);
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
    const activePlayerA = getActivePlayerForTeam('A');
    const activePlayerB = getActivePlayerForTeam('B');
    const playerNameA = activePlayerA ? (activePlayerA.name || 'Player A') : 'Not Assigned';
    const playerNameB = activePlayerB ? (activePlayerB.name || 'Player B') : 'Not Assigned';
    
    const pointsA = computePoints(A);
    const pointsB = computePoints(B);
    const displayA = getDisplayStatsForTeam('A');
    const displayB = getDisplayStatsForTeam('B');
    
    console.log(`Updating UI - A: ${pointsA} pts, B: ${pointsB} pts`);
    console.log(`Elements check - els.a.pts:`, els.a.pts, 'els.b.pts:',  els.b.pts);

    if (selectorEls.A.assignBtn) selectorEls.A.assignBtn.textContent = gameContext.players.A?.name || 'Assign Player';
    if (selectorEls.B.assignBtn) selectorEls.B.assignBtn.textContent = gameContext.players.B?.name || 'Assign Player';
    if (selectorEls.A.assignBtn2) selectorEls.A.assignBtn2.textContent = gameContext.players.A2?.name || 'Assign Tag Partner';
    if (selectorEls.B.assignBtn2) selectorEls.B.assignBtn2.textContent = gameContext.players.B2?.name || 'Assign Tag Partner';
    if (els.teamANameInput && els.teamANameInput.value !== (gameContext.customTeamNames.A || '')) {
      els.teamANameInput.value = gameContext.customTeamNames.A || '';
    }
    if (els.teamBNameInput && els.teamBNameInput.value !== (gameContext.customTeamNames.B || '')) {
      els.teamBNameInput.value = gameContext.customTeamNames.B || '';
    }
    setTeamNameInputsLocked(isGameRunning);
    if (els.teamAScoreName) {
      els.teamAScoreName.textContent = getTeamDisplayName('A') || 'Player A';
    }
    if (els.teamBScoreName) {
      els.teamBScoreName.textContent = getTeamDisplayName('B') || 'Player B';
    }
    
    // Team A stats
    if (els.a.pts) els.a.pts.textContent = computePoints(displayA.stats);
    if (els.a.s4) els.a.s4.textContent = `${displayA.stats.fourPM}/${displayA.stats.fourPA} (${get4PPercentage(displayA.stats)}%)`;
    if (els.a.s3) els.a.s3.textContent = `${displayA.stats.threePM}/${displayA.stats.threePA} (${get3PPercentage(displayA.stats)}%)`;
    if (els.a.s2) els.a.s2.textContent = `${displayA.stats.twoPM}/${displayA.stats.twoPA} (${getFGPercentage(displayA.stats)}%)`;
    if (els.a.ft) els.a.ft.textContent = `${displayA.stats.ftM}/${displayA.stats.ftA} (${getFTPercentage(displayA.stats)}%)`;
    if (els.a.fouls) els.a.fouls.textContent = displayA.stats.fouls;
    if (els.a.score) els.a.score.textContent = pointsA;
    if (els.teamAStatsScope) els.teamAStatsScope.textContent = displayA.scopeLabel;
    if (els.teamAStatsView) els.teamAStatsView.value = state.statsView.A || 'player';

    // Team B stats
    if (els.b.pts) els.b.pts.textContent = computePoints(displayB.stats);
    if (els.b.s4) els.b.s4.textContent = `${displayB.stats.fourPM}/${displayB.stats.fourPA} (${get4PPercentage(displayB.stats)}%)`;
    if (els.b.s3) els.b.s3.textContent = `${displayB.stats.threePM}/${displayB.stats.threePA} (${get3PPercentage(displayB.stats)}%)`;
    if (els.b.s2) els.b.s2.textContent = `${displayB.stats.twoPM}/${displayB.stats.twoPA} (${getFGPercentage(displayB.stats)}%)`;
    if (els.b.ft) els.b.ft.textContent = `${displayB.stats.ftM}/${displayB.stats.ftA} (${getFTPercentage(displayB.stats)}%)`;
    if (els.b.fouls) els.b.fouls.textContent = displayB.stats.fouls;
    if (els.b.score) els.b.score.textContent = pointsB;
    if (els.teamBStatsScope) els.teamBStatsScope.textContent = displayB.scopeLabel;
    if (els.teamBStatsView) els.teamBStatsView.value = state.statsView.B || 'player';

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
      selectorEls.A.assignBtn.classList.toggle('assigned', state.active === 'A' && gameContext.activePlayerIndex.A === 0 && !!gameContext.players.A);
    }
    if (selectorEls.A.assignBtn2) {
      selectorEls.A.assignBtn2.classList.toggle('assigned', state.active === 'A' && gameContext.activePlayerIndex.A === 1 && !!gameContext.players.A2);
    }
    if (selectorEls.B.assignBtn) {
      selectorEls.B.assignBtn.classList.toggle('assigned', state.active === 'B' && gameContext.activePlayerIndex.B === 0 && !!gameContext.players.B);
    }
    if (selectorEls.B.assignBtn2) {
      selectorEls.B.assignBtn2.classList.toggle('assigned', state.active === 'B' && gameContext.activePlayerIndex.B === 1 && !!gameContext.players.B2);
    }

    // Show markers for the active team and active individual in tag mode
    refreshVisibleMarkers();

    renderActionLog('A');
    renderActionLog('B');
    updateShotLogDisplay();

    refreshRuleModeUI();
    scheduleLiveGameSnapshot('ui');
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
    const actionId = `action_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const change = {
      kind: 'shot',
      team: teamKey,
      shotType,
      result,
      marker: markerEl,
      actionId,
      playerId,
      pos: pos ? { ...pos } : null,
      persisted: false
    };
    if (shotType === '4pt') {
      team.fourPA += 1;
      if (result === 'made') team.fourPM += 1;
    } else if (shotType === '3pt') {
      team.threePA += 1;
      if (result === 'made') team.threePM += 1;
    } else if (shotType === '2pt') {
      team.twoPA += 1;
      if (result === 'made') team.twoPM += 1;
    } else if (shotType === 'ft') {
      team.ftA += 1;
      if (result === 'made') team.ftM += 1;
    }
    applyPlayerShotDelta(playerId, shotType, result, 1);
    const playerIdStr = String(playerId);
    if (!state.teamPlayerIds[teamKey].includes(playerIdStr)) state.teamPlayerIds[teamKey].push(playerIdStr);
    state.history.push(change);

    // DEBUG: Log the state after update
    console.log(`Shot applied - Team: ${teamKey}, Type: ${shotType}, Result: ${result}`, team);
    console.log(`Current state:`, JSON.stringify({ A: state.A, B: state.B }));

    updateUI();

    const actionLabelBase = shotType === '4pt' ? '4PT' : shotType === '3pt' ? '3PT' : shotType === '2pt' ? '2PT' : 'FT';
    const actionLabel = `${actionLabelBase} ${result === 'made' ? 'Made' : 'Missed'}`;
    addActionEntry(teamKey, {
      id: actionId,
      label: actionLabel,
      type: shotType,
      gameSeconds: secondsElapsed,
      playerId,
      playerName: getActivePlayerForTeam(teamKey)?.name || `Team ${teamKey}`,
      markerEl: markerEl || null
    });

    try {
      const baseEvent = shotType === 'ft'
        ? { type: 'free_throw', made: result === 'made', points: 1 }
        : { type: 'shot', made: result === 'made', points: shotType === '4pt' ? 4 : shotType === '3pt' ? 3 : 2 };
      const persistResult = await persistGameEvent(teamKey, baseEvent, pos);
      if (!persistResult?.skipped) {
        change.persisted = true;
        console.log(`Shot recorded: ${teamKey} - ${shotType} - ${result}${pos ? ` at (${pos.xPct.toFixed(1)}%, ${pos.yPct.toFixed(1)}%)` : ''}`);
      }
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

    // Check if cursor is on court image
    if (!lastCursorPos) {
      alert('Cannot log foul off court image. Hover cursor over the court first.');
      return;
    }

    const team = teamKey === 'A' ? state.A : state.B;
    team.fouls += 1;
    applyPlayerFoulDelta(playerId, 1);
    const foulPlayerIdStr = String(playerId);
    if (!state.teamPlayerIds[teamKey].includes(foulPlayerIdStr)) state.teamPlayerIds[teamKey].push(foulPlayerIdStr);

    const actionId = `action_${Date.now()}_${Math.random().toString(16).slice(2)}`;

    const fouledTeamKey = teamKey === 'A' ? 'B' : 'A';

    // Log committing foul to shot history and marker
    const fouledPlayer = getActivePlayerForTeam(fouledTeamKey);
    const foulingPlayer = getActivePlayerForTeam(teamKey);
    const fouledPlayerName = fouledPlayer?.name || getTeamDisplayName(fouledTeamKey);
    const foulingPlayerName = foulingPlayer?.name || getTeamDisplayName(teamKey);

    // Draw and log both foul markers so playback can replay triangle+square accurately.
    const foulMarker = logFoulToHistory(teamKey, lastCursorPos, actionId, 'committed', foulingPlayer, true, fouledPlayerName);
    const fouledMarker = logFoulToHistory(fouledTeamKey, lastCursorPos, null, 'drawn', fouledPlayer, true, foulingPlayerName);
    
    // Store in history with marker reference
    state.history.push({
      kind: 'foul',
      team: teamKey,
      marker: foulMarker,
      secondaryMarker: fouledMarker || null,
      actionId,
      playerId,
      secondaryPlayerId: fouledPlayer ? String(fouledPlayer._id || fouledPlayer) : '',
      pos: lastCursorPos ? { ...lastCursorPos } : null,
      persisted: false
    });
    
    updateUI();

    try {
      const persistResult = await persistGameEvent(teamKey, { type: 'foul' });
      if (!persistResult?.skipped) {
        const latest = state.history[state.history.length - 1];
        if (latest && latest.kind === 'foul' && latest.team === teamKey) {
          latest.persisted = true;
        }
        console.log(`Foul recorded: ${teamKey}`);
      }
    } catch (err) {
      // Keep local stats even if network/database fails so the UI does not reset
      console.error('Failed to persist foul event (keeping local stats)', err);
      alert(`Saved locally. Network/database error: ${err.message}`);
    }
  }

  function openFtModal(teamKey) {
    if (!isGameRunning) {
      showStartError(`Assign ${requiredPlayersPerTeam()} player(s) to each team and press Start Game.`);
      return;
    }
    if (isPaused || isTimeout) {
      return;
    }
    if (!playersAssigned()) {
      showStartError(`Assign ${requiredPlayersPerTeam()} player(s) to each team before starting the game.`);
      return;
    }
    pendingFTTeam = teamKey;
    if (ftModal.overlay) ftModal.overlay.style.display = 'flex';
  }

  function closeFtModal() {
    pendingFTTeam = null;
    if (ftModal.overlay) ftModal.overlay.style.display = 'none';
  }

  function checkZoneContradiction(intendedShot, actualZone) {
    // Check if user's hotkey intention contradicts the actual zone clicked
    if (!actualZone || !intendedShot) return null;
    
    if (intendedShot === '2pt' && actualZone === '3pt') {
      return 'Warning: 2PT shot logged in 3PT zone!';
    }
    if (intendedShot === '3pt' && actualZone === '2pt') {
      return 'Warning: 3PT shot logged in 2PT zone!';
    }
    return null;
  }

  function inferShotTypeFromClick(evt) {
    const img = document.getElementById('court_image');
    if (!img) return '2pt';
    const rect = img.getBoundingClientRect();
    const x = (evt.clientX - rect.left) / rect.width;  // 0..1
    const y = (evt.clientY - rect.top) / rect.height;  // 0..1
    
    const centerX = rect.left + rect.width * 0.5;
    const dxPx = Math.abs(evt.clientX - centerX);
    const clickYPct = y * 100;  // Convert to percentage from top
    
    // 2PT Rectangular zone: from 38% to 62% (26% height), 86% width centered
    const rectZoneTop = 38;
    const rectZoneBottom = 62;
    const rectZoneWidth = rect.width * 0.86 / 2;  // half width for left/right check
    const inRectBand = clickYPct >= rectZoneTop && clickYPct <= rectZoneBottom && dxPx <= rectZoneWidth;
    
    // 2PT Semicircle zone: top half at 38%, 86% width, 29% height (circular at top)
    // Center at 38% height, radius approximately 43% of width (86% / 2)
    const semicircleTopPct = 38;
    const semicircleRadius = rect.width * 0.43;
    const semicircleCenterYPx = rect.top + (semicircleTopPct / 100) * rect.height;
    const semicircleDyPx = evt.clientY - semicircleCenterYPx;
    const semicircleDistSq = dxPx * dxPx + semicircleDyPx * semicircleDyPx;
    const inSemicircle = semicircleDistSq <= semicircleRadius * semicircleRadius && (evt.clientY <= semicircleCenterYPx);
    
    if (inRectBand || inSemicircle) return '2pt';
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
    
    const centerX = rect.left + rect.width * 0.5;
    const dxPx = Math.abs(clientX - centerX);
    const clickYPct = pos.yPct;  // Already in percentage
    
    // 2PT Rectangular zone: from 38% to 62% (26% height), 86% width centered
    const rectZoneTop = 38;
    const rectZoneBottom = 62;
    const rectZoneWidth = rect.width * 0.86 / 2;  // half width for left/right check
    const inRectBand = clickYPct >= rectZoneTop && clickYPct <= rectZoneBottom && dxPx <= rectZoneWidth;
    
    // 2PT Semicircle zone: top half at 38%, 86% width, 29% height (circular at top)
    // Center at 38% height, radius approximately 43% of width (86% / 2)
    const semicircleTopPct = 38;
    const semicircleRadius = rect.width * 0.43;
    const semicircleCenterYPx = rect.top + (semicircleTopPct / 100) * rect.height;
    const semicircleDyPx = clientY - semicircleCenterYPx;
    const semicircleDistSq = dxPx * dxPx + semicircleDyPx * semicircleDyPx;
    const inSemicircle = semicircleDistSq <= semicircleRadius * semicircleRadius && (clientY <= semicircleCenterYPx);
    
    if (inRectBand || inSemicircle) return '2pt';
    return '3pt';
  }

  function undoLast() {
    if (!isGameRunning) {
      showStartError(`Assign ${requiredPlayersPerTeam()} player(s) to each team and press Start Game.`);
      return;
    }
    const last = state.history.pop();
    if (!last) return;
    revertHistoryChange(last);

    if (last.actionId) {
      removeActionEntryById(last.team, last.actionId);
    } else {
      const actionHistory = state.actionHistory[last.team];
      if (actionHistory && actionHistory.length > 0) {
        actionHistory.pop();
        renderActionLog(last.team);
      }
    }

    updateUI();
  }

  function getDefendingTeamKey() {
    return state.active === 'A' ? 'B' : 'A';
  }

  function logFoulForTeam(teamKey) {
    if (!isGameRunning) {
      showStartError(`Assign ${requiredPlayersPerTeam()} player(s) to each team and press Start Game.`);
      return;
    }
    controller.incrementFoul(teamKey);
  }

  // Wire buttons
  if (els.selectA) els.selectA.addEventListener('click', () => { if (!isGameRunning) return showStartError(`Assign ${requiredPlayersPerTeam()} player(s) to each team and press Start Game.`); controller.setActive('A'); });
  if (els.selectB) els.selectB.addEventListener('click', () => { if (!isGameRunning) return showStartError(`Assign ${requiredPlayersPerTeam()} player(s) to each team and press Start Game.`); controller.setActive('B'); });
  if (els.a.foulPlus) els.a.foulPlus.addEventListener('click', () => logFoulForTeam('A'));
  if (els.b.foulPlus) els.b.foulPlus.addEventListener('click', () => logFoulForTeam('B'));
  const sideFoulABtn = document.getElementById('teamAFoulBtn');
  const sideFoulBBtn = document.getElementById('teamBFoulBtn');
  if (sideFoulABtn) sideFoulABtn.addEventListener('click', () => logFoulForTeam('A'));
  if (sideFoulBBtn) sideFoulBBtn.addEventListener('click', () => logFoulForTeam('B'));
  if (els.a.ftBtn) els.a.ftBtn.addEventListener('click', () => controller.openFtModal('A'));
  if (els.b.ftBtn) els.b.ftBtn.addEventListener('click', () => controller.openFtModal('B'));
  if (els.undo) els.undo.addEventListener('click', () => controller.undoLast());
  if (els.teamAPlaybackBtn) els.teamAPlaybackBtn.addEventListener('click', () => openPlaybackModal('A'));
  if (els.teamBPlaybackBtn) els.teamBPlaybackBtn.addEventListener('click', () => openPlaybackModal('B'));

  if (playbackModal.close) playbackModal.close.addEventListener('click', closePlaybackModal);
  if (playbackModal.overlay) playbackModal.overlay.addEventListener('click', (e) => {
    if (e.target === playbackModal.overlay) closePlaybackModal();
  });
  if (playbackModal.prevBtn) playbackModal.prevBtn.addEventListener('click', () => {
    stopPlaybackTimer();
    setPlaybackPlayState(false);
    stepPlayback(-1);
  });
  if (playbackModal.nextBtn) playbackModal.nextBtn.addEventListener('click', () => {
    stopPlaybackTimer();
    setPlaybackPlayState(false);
    stepPlayback(1);
  });
  if (playbackModal.playPauseBtn) playbackModal.playPauseBtn.addEventListener('click', () => {
    if (playbackIsPlaying) {
      stopPlaybackTimer();
      setPlaybackPlayState(false);
      return;
    }
    startPlaybackAuto();
  });

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

  // Action log button handlers (delegation)
  if (els.a.actions) {
    wireActionHover(els.a.actions, 'A');
    els.a.actions.addEventListener('click', (e) => {
      const actionBtn = e.target.closest('[data-action]');
      if (!actionBtn) return;
      
      const actionItem = actionBtn.closest('.action-item');
      const actionId = actionItem?.dataset.id;
      const action = actionBtn.dataset.action;
      const entry = state.actionHistory.A.find(a => a.id === actionId);
      if (!entry) return;
      
      if (action === 'delete') {
        undoActionById('A', actionId);
      } else if (action === 'highlight') {
        entry.highlighted = !entry.highlighted;
        renderActionLog('A');
      } else if (action === 'note') {
        const newNote = prompt('Add note to this action:', entry.note || '');
        if (newNote !== null) {
          entry.note = newNote;
          renderActionLog('A');
        }
      }
    });
  }

  if (els.b.actions) {
    wireActionHover(els.b.actions, 'B');
    els.b.actions.addEventListener('click', (e) => {
      const actionBtn = e.target.closest('[data-action]');
      if (!actionBtn) return;
      
      const actionItem = actionBtn.closest('.action-item');
      const actionId = actionItem?.dataset.id;
      const action = actionBtn.dataset.action;
      const entry = state.actionHistory.B.find(a => a.id === actionId);
      if (!entry) return;
      
      if (action === 'delete') {
        undoActionById('B', actionId);
      } else if (action === 'highlight') {
        entry.highlighted = !entry.highlighted;
        renderActionLog('B');
      } else if (action === 'note') {
        const newNote = prompt('Add note to this action:', entry.note || '');
        if (newNote !== null) {
          entry.note = newNote;
          renderActionLog('B');
        }
      }
    });
  }

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
        timeoutModal.playerABtn.textContent = getActivePlayerForTeam('A')?.name || 'Team A';
      }
      if (timeoutModal.playerBBtn) {
        timeoutModal.playerBBtn.textContent = getActivePlayerForTeam('B')?.name || 'Team B';
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
        showStartError(`Assign ${requiredPlayersPerTeam()} player(s) to each team and press Start Game.`);
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
      const playerName = getActivePlayerForTeam('A')?.name || 'Team A';
      console.log('Timeout called by', playerName);
      state.history.push({ type: 'timeout', team: 'A', timestamp: new Date() });
      addActionEntry('A', {
        label: 'Timeout Called',
        type: 'timeout',
        gameSeconds: secondsElapsed,
        playerId: getPlayerId('A'),
        playerName
      });
      // Block stats but keep timer running
      isTimeout = true;
      if (pauseGameBtn) pauseGameBtn.innerHTML = 'Resume <span class="hotkey-hint">P</span>';
      closeTimeoutModal();
      updateUI();
    });
  }

  if (timeoutModal.playerBBtn) {
    timeoutModal.playerBBtn.addEventListener('click', () => {
      const playerName = getActivePlayerForTeam('B')?.name || 'Team B';
      console.log('Timeout called by', playerName);
      state.history.push({ type: 'timeout', team: 'B', timestamp: new Date() });
      addActionEntry('B', {
        label: 'Timeout Called',
        type: 'timeout',
        gameSeconds: secondsElapsed,
        playerId: getPlayerId('B'),
        playerName
      });
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
        return;
      }
      openModal(key, 1);
    });
    if (set.assignBtn2) set.assignBtn2.addEventListener('click', () => {
      if (isGameRunning) {
        showGameInProgressAlert();
        return;
      }
      openModal(key, 2);
    });
  });

  if (els.teamAActivePlayer) {
    els.teamAActivePlayer.addEventListener('change', (e) => {
      gameContext.activePlayerIndex.A = Number(e.target.value) || 0;
      updateUI();
    });
  }
  if (els.teamBActivePlayer) {
    els.teamBActivePlayer.addEventListener('change', (e) => {
      gameContext.activePlayerIndex.B = Number(e.target.value) || 0;
      updateUI();
    });
  }

  if (els.gameRuleSelect) {
    els.gameRuleSelect.addEventListener('change', (e) => {
      setRuleMode(e.target.value);
    });
  }

  if (els.teamANameInput) {
    els.teamANameInput.addEventListener('input', (e) => {
      gameContext.customTeamNames.A = (e.target.value || '').trim();
      updateUI();
    });
  }
  if (els.teamBNameInput) {
    els.teamBNameInput.addEventListener('input', (e) => {
      gameContext.customTeamNames.B = (e.target.value || '').trim();
      updateUI();
    });
  }



  if (els.teamAStatsView) {
    els.teamAStatsView.addEventListener('change', (e) => {
      state.statsView.A = e.target.value === 'team' ? 'team' : 'player';
      updateUI();
    });
  }

  if (els.teamBStatsView) {
    els.teamBStatsView.addEventListener('change', (e) => {
      state.statsView.B = e.target.value === 'team' ? 'team' : 'player';
      updateUI();
    });
  }

  if (modalEls.close) modalEls.close.addEventListener('click', closeModal);
  if (modalEls.overlay) modalEls.overlay.addEventListener('click', (e) => {
    if (e.target === modalEls.overlay) closeModal();
  });
  if (modalEls.createBtn) modalEls.createBtn.addEventListener('click', () => {
    if (!currentAssignTarget) return;
    createAndAssign(currentAssignTarget.teamKey, currentAssignTarget.slotIndex);
  });
  if (modalEls.searchInput) modalEls.searchInput.addEventListener('input', (e) => {
    if (!currentAssignTarget) return;
    const term = e.target.value;
    if (searchDebounce) clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => searchAndRender(currentAssignTarget.teamKey, currentAssignTarget.slotIndex, term), 200);
    if (modalEls.results) modalEls.results.classList.add('show');
  });
  if (modalEls.searchInput) modalEls.searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && currentAssignTarget) {
      e.preventDefault();
      searchAndRender(currentAssignTarget.teamKey, currentAssignTarget.slotIndex, modalEls.searchInput.value);
    }
  });
  if (modalEls.searchInput) modalEls.searchInput.addEventListener('focus', () => {
    if (!currentAssignTarget) return;
    if (searchDebounce) clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => searchAndRender(currentAssignTarget.teamKey, currentAssignTarget.slotIndex, modalEls.searchInput.value || ''), 50);
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
      if (!isGameRunning) { showStartError(`Assign ${requiredPlayersPerTeam()} player(s) to each team and press Start Game.`); return; }
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
  if (els.a.panel) els.a.panel.addEventListener('click', () => { if (!isGameRunning) return showStartError(`Assign ${requiredPlayersPerTeam()} player(s) to each team and press Start Game.`); controller.setActive('A'); });
  if (els.b.panel) els.b.panel.addEventListener('click', () => { if (!isGameRunning) return showStartError(`Assign ${requiredPlayersPerTeam()} player(s) to each team and press Start Game.`); controller.setActive('B'); });

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

  // ===== Court Image Picker Modal (Game Logger) =====
  const gameCourtImageModal = document.getElementById('gameCourtImageModal');
  const gameCourtImageUploadInput = document.getElementById('gameCourtImageUploadInput');
  const gameCourtImageOptions = document.getElementById('gameCourtImageOptions');
  const gameCourtImageCloseBtn = document.getElementById('gameCourtImageCloseBtn');
  
  let gameSelectedCourtImageSrc = DEFAULT_COURT_IMAGE_SRC;

  function getReusableGameCourtImages() {
    const reusableImages = new Set();
    
    // Add default court
    reusableImages.add(DEFAULT_COURT_IMAGE_SRC);
    
    // Load previously uploaded court images from localStorage
    try {
      const key = 'tnc_custom_court_images_v1';
      const stored = localStorage.getItem(key);
      if (stored) {
        const images = JSON.parse(stored);
        if (Array.isArray(images)) {
          images.forEach(img => {
            if (isCustomCourtImageSrc(img)) {
              reusableImages.add(img);
            }
          });
        }
      }
    } catch (err) {
      console.error('Failed to load saved court images:', err);
    }
    
    return Array.from(reusableImages);
  }

  function renderGameCourtImageOptions() {
    gameCourtImageOptions.innerHTML = '';
    const images = getReusableGameCourtImages();
    
    images.forEach((imageSrc, index) => {
      const option = document.createElement('div');
      option.className = 'court-image-option' + (imageSrc === gameSelectedCourtImageSrc ? ' selected' : '');
      
      const img = document.createElement('img');
      img.src = imageSrc;
      img.alt = `Court image ${index + 1}`;
      
      const label = document.createElement('div');
      label.className = 'label';
      label.textContent = imageSrc === DEFAULT_COURT_IMAGE_SRC ? 'Default Court' : `Court ${index}`;
      
      option.appendChild(img);
      option.appendChild(label);
      
      option.addEventListener('click', () => {
        document.querySelectorAll('#gameCourtImageOptions .court-image-option').forEach(el => {
          el.classList.remove('selected');
        });
        option.classList.add('selected');
        gameSelectedCourtImageSrc = imageSrc;
        applyGameCourtImage();
      });
      
      gameCourtImageOptions.appendChild(option);
    });
  }

  function handleGameCourtImageUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Please select a valid image file.');
      return;
    }

    if (file.size > MAX_CUSTOM_COURT_IMAGE_BYTES) {
      alert(`Image must be under 1.5MB. Your file is ${(file.size / 1024 / 1024).toFixed(2)}MB.`);
      return;
    }

    const reader = new FileReader();
    reader.onload = (readerEvent) => {
      const dataUrl = readerEvent.target?.result;
      if (typeof dataUrl === 'string') {
        gameSelectedCourtImageSrc = dataUrl;
        
        // Re-render with new image
        gameCourtImageOptions.innerHTML = '';
        const images = getReusableGameCourtImages();
        images.push(dataUrl); // Add uploaded image to selection
        
        images.forEach((imageSrc, index) => {
          const option = document.createElement('div');
          option.className = 'court-image-option' + (imageSrc === gameSelectedCourtImageSrc ? ' selected' : '');
          
          const img = document.createElement('img');
          img.src = imageSrc;
          img.alt = `Court image ${index + 1}`;
          
          const label = document.createElement('div');
          label.className = 'label';
          label.textContent = imageSrc === DEFAULT_COURT_IMAGE_SRC ? 'Default' : imageSrc === dataUrl ? 'Your Upload' : `Court ${index}`;
          
          option.appendChild(img);
          option.appendChild(label);
          
          option.addEventListener('click', () => {
            document.querySelectorAll('#gameCourtImageOptions .court-image-option').forEach(el => {
              el.classList.remove('selected');
            });
            option.classList.add('selected');
            gameSelectedCourtImageSrc = imageSrc;
            applyGameCourtImage();
          });
          
          gameCourtImageOptions.appendChild(option);
        });
        
        applyGameCourtImage();
      }
    };
    reader.readAsDataURL(file);
  }

  function applyGameCourtImage() {
    gameContext.courtImageSrc = gameSelectedCourtImageSrc;
    const courtImg = document.getElementById('court_image');
    if (courtImg) {
      courtImg.src = gameSelectedCourtImageSrc;
    }
    
    // Save uploaded image to localStorage for future use
    if (isCustomCourtImageSrc(gameSelectedCourtImageSrc)) {
      try {
        const key = 'tnc_custom_court_images_v1';
        const stored = localStorage.getItem(key);
        const images = stored ? JSON.parse(stored) : [];
        
        // Add if not already stored
        if (!images.includes(gameSelectedCourtImageSrc)) {
          images.push(gameSelectedCourtImageSrc);
          localStorage.setItem(key, JSON.stringify(images));
        }
        
        // Also save to current game context for backend persistence
        if (gameContext.gameId) {
          persistCustomCourtImageForGame(gameContext.gameId, gameSelectedCourtImageSrc);
        }
      } catch (err) {
        console.error('Failed to save court image:', err);
      }
    }
  }

  function closeGameCourtImageModal() {
    if (gameCourtImageModal) gameCourtImageModal.style.display = 'none';
  }

  function openGameCourtImageModal() {
    if (gameCourtImageModal) {
      gameCourtImageModal.style.display = 'flex';
      gameSelectedCourtImageSrc = DEFAULT_COURT_IMAGE_SRC;
      renderGameCourtImageOptions();
    }
  }

  // Wire up court image modal handlers
  if (gameCourtImageUploadInput) {
    gameCourtImageUploadInput.addEventListener('change', handleGameCourtImageUpload);
  }

  if (gameCourtImageCloseBtn) {
    gameCourtImageCloseBtn.addEventListener('click', closeGameCourtImageModal);
  }

  if (gameCourtImageModal) {
    gameCourtImageModal.addEventListener('click', (e) => {
      if (e.target === gameCourtImageModal) closeGameCourtImageModal();
    });
  }

  function generateGamePDF() {
    if (!gameContext.gameId) {
      alert('No completed game report is available yet.');
      return;
    }

    // Use the dedicated report page so downloaded PDFs always match report styling.
    const reportUrl = `game-report.html?id=${encodeURIComponent(gameContext.gameId)}&autodownload=1`;
    const reportWindow = window.open(reportUrl, '_blank', 'noopener');
    if (!reportWindow) {
      window.location.href = reportUrl;
    }
  }

  function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  function resetGameUI() {
    // Clear all game stats from previous game
    state.A = { twoPA: 0, twoPM: 0, threePA: 0, threePM: 0, fourPA: 0, fourPM: 0, ftA: 0, ftM: 0, fouls: 0 };
    state.B = { twoPA: 0, twoPM: 0, threePA: 0, threePM: 0, fourPA: 0, fourPM: 0, ftA: 0, ftM: 0, fouls: 0 };
    state.playerStats = {};
    state.teamPlayerIds = { A: [], B: [] };
    state.statsView = { A: 'player', B: 'player' };
    state.history = [];
    state.active = 'A';
    isTimeout = false;
    clearLiveGameSnapshot();
    closePlaybackModal();
    
    // Clear shot markers from court
    const shotMarkersEl = document.getElementById('shot_markers');
    if (shotMarkersEl) shotMarkersEl.innerHTML = '';
    clearActionLogs();

    // Clear game context
    gameContext.gameId = null;
    gameContext.players = { A: null, A2: null, B: null, B2: null };
    gameContext.activePlayerIndex = { A: 0, B: 0 };
    gameContext.customTeamNames = { A: '', B: '' };
    gameContext.teams = {};
    gameContext.finalResult = null;
    gameContext.finalStats = null;

    // Reset scores
    document.getElementById("teamAScore").textContent = "0";
    document.getElementById("teamBScore").textContent = "0";
    
    // Reset all stat displays
    updateUI();
    
    // Re-enable player assignment buttons
    if (selectorEls.A.assignBtn) {
      selectorEls.A.assignBtn.textContent = 'Assign Player';
      selectorEls.A.assignBtn.classList.remove('assigned');
    }
    if (selectorEls.B.assignBtn) {
      selectorEls.B.assignBtn.textContent = 'Assign Player';
      selectorEls.B.assignBtn.classList.remove('assigned');
    }
    if (selectorEls.A.assignBtn2) {
      selectorEls.A.assignBtn2.textContent = 'Assign Tag Partner';
      selectorEls.A.assignBtn2.classList.remove('assigned');
    }
    if (selectorEls.B.assignBtn2) {
      selectorEls.B.assignBtn2.textContent = 'Assign Tag Partner';
      selectorEls.B.assignBtn2.classList.remove('assigned');
    }
    
    // Disable start button until players assigned
    startGameBtn.disabled = true;
    startGameBtn.textContent = "Start Game";
    
    // Enable change court image button when game ends
    const changeCourtImageBtn = document.getElementById('changeCourtImageBtn');
    if (changeCourtImageBtn) changeCourtImageBtn.disabled = false;
    
    refreshRuleModeUI();
    showStartError(`Assign ${requiredPlayersPerTeam()} player(s) to each team before starting the game.`);
  }

  function clearGameStats() {
    // Clear stats at the START of a new game (before first shot is logged)
    state.A = { twoPA: 0, twoPM: 0, threePA: 0, threePM: 0, fourPA: 0, fourPM: 0, ftA: 0, ftM: 0, fouls: 0 };
    state.B = { twoPA: 0, twoPM: 0, threePA: 0, threePM: 0, fourPA: 0, fourPM: 0, ftA: 0, ftM: 0, fouls: 0 };
    state.playerStats = {};
    state.teamPlayerIds = { A: [], B: [] };
    state.statsView = { A: 'player', B: 'player' };
    state.history = [];
    state.shotHistory = { A: [], B: [] };  // Clear individual shot histories
    state.active = 'A';
    clearLiveGameSnapshot();
    closePlaybackModal();
    
    // Clear shot markers
    const shotMarkersEl = document.getElementById('shot_markers');
    if (shotMarkersEl) shotMarkersEl.innerHTML = '';
    clearActionLogs();
    
    // Reset score displays
    document.getElementById("teamAScore").textContent = "0";
    document.getElementById("teamBScore").textContent = "0";
    
    updateUI();
    updateShotLogDisplay();  // Reset shot log display
  }

  function clearActionLogs() {
    state.actionHistory = { A: [], B: [] };
    renderActionLog('A');
    renderActionLog('B');
  }

  const STARRED_PLAYS_STORAGE_PREFIX = 'tnc_starred_plays_';
  const GAME_ACTIONS_STORAGE_PREFIX = 'tnc_game_actions_';

  function buildGameActionsSnapshot() {
    const combined = [
      ...(state.actionHistory.A || []),
      ...(state.actionHistory.B || [])
    ];

    return combined
      .filter((action) => !!action)
      .sort((a, b) => Number(a.timestamp || 0) - Number(b.timestamp || 0))
      .map((action) => ({
        id: action.id,
        teamKey: action.teamKey,
        playerId: action.playerId || '',
        playerName: action.playerName || `Team ${action.teamKey || ''}`,
        label: action.label || 'Play',
        type: action.type || 'action',
        gameSeconds: typeof action.gameSeconds === 'number' ? action.gameSeconds : null,
        gameTimeLabel: action.timeLabel || '—',
        timeLabel: action.timeLabel || '—',
        timestamp: action.timestamp || Date.now(),
        note: action.note || '',
        highlighted: !!action.highlighted
      }));
  }

  function buildStarredPlaysSnapshot() {
    const combined = [
      ...(state.actionHistory.A || []),
      ...(state.actionHistory.B || [])
    ];

    return combined
      .filter((action) => action && action.highlighted)
      .sort((a, b) => {
        const aTs = Number(a.timestamp || 0);
        const bTs = Number(b.timestamp || 0);
        return aTs - bTs;
      })
      .map((action) => ({
        id: action.id,
        teamKey: action.teamKey,
        playerId: action.playerId || '',
        playerName: action.playerName || `Team ${action.teamKey || ''}`,
        label: action.label || 'Play',
        type: action.type || 'action',
        timeLabel: action.timeLabel || '—',
        timestamp: action.timestamp || Date.now(),
        note: action.note || ''
      }));
  }

  function persistStarredPlaysForGame(gameId) {
    if (!gameId) return;
    try {
      const key = `${STARRED_PLAYS_STORAGE_PREFIX}${gameId}`;
      const payload = {
        gameId,
        updatedAt: Date.now(),
        plays: buildStarredPlaysSnapshot()
      };
      localStorage.setItem(key, JSON.stringify(payload));
    } catch (err) {
      console.warn('Failed to persist starred plays snapshot for report.', err);
    }
  }

  function persistGameActionsForGame(gameId) {
    if (!gameId) return;
    try {
      const key = `${GAME_ACTIONS_STORAGE_PREFIX}${gameId}`;
      const payload = {
        gameId,
        updatedAt: Date.now(),
        actions: buildGameActionsSnapshot()
      };
      localStorage.setItem(key, JSON.stringify(payload));
    } catch (err) {
      console.warn('Failed to persist game actions snapshot for report.', err);
    }
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
    if (els.teamAPlaybackBtn) els.teamAPlaybackBtn.disabled = !enabled;
    if (els.teamBPlaybackBtn) els.teamBPlaybackBtn.disabled = !enabled;
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
          showStartError(`Assign ${requiredPlayersPerTeam()} player(s) to each team before starting the game.`);
          return;
        }
        // Ensure a game exists on the backend before starting
        try {
          if (!gameContext.gameId) {
            const teamAPlayers = getTeamPlayers('A').map((p) => p._id || p);
            const teamBPlayers = getTeamPlayers('B').map((p) => p._id || p);
            const requiredCount = requiredPlayersPerTeam();

            if (teamAPlayers.length < requiredCount || teamBPlayers.length < requiredCount) {
              showStartError(`Each team requires ${requiredCount} player(s) for ${gameContext.ruleMode === 'tag-team-1v1' ? 'Tag Team 1v1' : '1v1'}.`);
              return;
            }

            const gameType = gameContext.ruleMode === 'tag-team-1v1' ? '2v2' : '1v1';
            let newGame;
            const createPayloadLegacy = {
              game_type: gameType,
              team_a: teamAPlayers,
              team_b: teamBPlayers,
              score_to_win: 50
            };
            const createPayloadTeams = {
              game_type: gameType,
              teams: {
                team_a: teamAPlayers,
                team_b: teamBPlayers
              },
              score_to_win: 50
            };

            if (isCustomCourtImageSrc(gameContext.courtImageSrc)) {
              createPayloadLegacy.custom_court_image = gameContext.courtImageSrc;
              createPayloadTeams.custom_court_image = gameContext.courtImageSrc;
            }

            // Try legacy payload first, then fallback to nested teams payload.
            try {
              newGame = await apiClient.createGame(createPayloadLegacy);
            } catch (legacyErr) {
              console.warn('Legacy create game payload failed, retrying with teams object:', legacyErr);
              newGame = await apiClient.createGame(createPayloadTeams);
            }

            gameContext.gameId = newGame._id;
            persistCustomCourtImageForGame(gameContext.gameId, gameContext.courtImageSrc);
            console.log('Created new game:', newGame._id);
          }
        } catch (err) {
          console.error('Failed to create game before start:', err);
          alert(`Unable to start game: ${err?.message || 'Unknown error'}`);
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
        setTeamNameInputsLocked(true);
        setActionsEnabled(true);
        refreshRuleModeUI();
        
        // Disable change court image button during game
        const changeCourtImageBtn = document.getElementById('changeCourtImageBtn');
        if (changeCourtImageBtn) changeCourtImageBtn.disabled = true;
        
        persistLiveGameSnapshot('game-started');
      } else {
        // End Game - finalize and save to database
        stopTimer();
        try {
          startGameBtn.disabled = true;
          startGameBtn.textContent = 'Saving...';

          const teamAScore = parseInt(document.getElementById('teamAScore').textContent || 0);
          const teamBScore = parseInt(document.getElementById('teamBScore').textContent || 0);

          await flushBufferedEventsToBackend();

          const localWinner = teamAScore === teamBScore ? 'draw' : (teamAScore > teamBScore ? 'team_a' : 'team_b');
          const result = await apiClient.finalizeGame(gameContext.gameId, {
            final_score: {
              team_a: teamAScore,
              team_b: teamBScore
            },
            winner: localWinner
          });
          console.log('Game finalized successfully:', result);

          gameContext.finalResult = result;
          gameContext.finalStats = {
            teamAScore,
            teamBScore,
            teamAName: getTeamDisplayName('A'),
            teamBName: getTeamDisplayName('B'),
            duration: secondsElapsed,
            winner: result.game.winner === 'team_a' ? getTeamDisplayName('A') : result.game.winner === 'team_b' ? getTeamDisplayName('B') : 'Tie'
          };

          persistStarredPlaysForGame(gameContext.gameId);
          persistGameActionsForGame(gameContext.gameId);

          clearActionLogs();

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
          setTeamNameInputsLocked(false);
          setActionsEnabled(false);
          refreshRuleModeUI();
          clearLiveGameSnapshot();
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
        addActionEntry(state.active, {
          label: 'Resumed From Timeout',
          type: 'hotkey',
          gameSeconds: secondsElapsed,
          playerId: getPlayerId(state.active),
          playerName: getActivePlayerForTeam(state.active)?.name || `Team ${state.active}`
        });
        return;
      }

      if (!isPaused) {
        stopTimer();
        pauseGameBtn.innerHTML = 'Play <span class="hotkey-hint">P</span>';
        isPaused = true;
        addActionEntry(state.active, {
          label: 'Paused Game',
          type: 'hotkey',
          gameSeconds: secondsElapsed,
          playerId: getPlayerId(state.active),
          playerName: getActivePlayerForTeam(state.active)?.name || `Team ${state.active}`
        });
      } else {
        startTimer();
        pauseGameBtn.innerHTML = 'Pause <span class="hotkey-hint">P</span>';
        isPaused = false;
        isTimeout = false; // Clear timeout when resuming from pause
        addActionEntry(state.active, {
          label: 'Resumed Game',
          type: 'hotkey',
          gameSeconds: secondsElapsed,
          playerId: getPlayerId(state.active),
          playerName: getActivePlayerForTeam(state.active)?.name || `Team ${state.active}`
        });
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
      if (!isGameRunning) { showStartError(`Assign ${requiredPlayersPerTeam()} player(s) to each team and press Start Game.`); return; }
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

  // Open court image picker on page load
  openGameCourtImageModal();

  const autosaveIntervalMs = 5000;
  setInterval(() => {
    if (isGameRunning) {
      persistLiveGameSnapshot('interval');
    }
  }, autosaveIntervalMs);

  window.addEventListener('beforeunload', () => {
    if (isGameRunning || state.history.length > 0) {
      persistLiveGameSnapshot('beforeunload');
    }
  });

  window.addEventListener('pagehide', () => {
    if (isGameRunning || state.history.length > 0) {
      persistLiveGameSnapshot('pagehide');
    }
  });

  window.addEventListener('offline', () => {
    persistLiveGameSnapshot('offline');
  });

  window.addEventListener('online', () => {
    if (isGameRunning) {
      persistLiveGameSnapshot('online');
    }
  });

  // Keyboard shortcuts handler
  document.addEventListener('keydown', (e) => {
    // Don't trigger if user is typing in an input field or if a modal is open
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (e.repeat) return;
    
    const isModalOpen = Array.from(document.querySelectorAll('.modal-overlay'))
      .some((modal) => window.getComputedStyle(modal).display !== 'none');
    
    if (isModalOpen) return;

    const key = e.key.toLowerCase();
    const isShift = e.shiftKey;
    
    // Tab - Switch active team
    if (key === 'tab') {
      e.preventDefault();
      if (!isGameRunning) return;
      const currentActive = state.active;
      const newActive = currentActive === 'A' ? 'B' : 'A';
      setActive(newActive, { logAction: true, label: 'Switched Active Team (Tab)' });
      return;
    }

    // S - Swap active teammate (tag-team mode only)
    if (key === 's' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      if (!isGameRunning) return;
      swapActiveTeammate(state.active);
      return;
    }

    // C - Change court image before a game starts
    if (key === 'c') {
      e.preventDefault();
      if (!isGameRunning) {
        openGameCourtImageModal();
      }
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
    
    // A - Foul on active player Team A
    if (key === 'a') {
      e.preventDefault();
      logFoulForTeam('A');
      return;
    }

    // B - Foul on active player Team B
    if (key === 'b') {
      e.preventDefault();
      logFoulForTeam('B');
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

      // Must have cursor over court to record shot
      if (!lastCursorPos) {
        alert('Cannot log shot off court image. Hover cursor over the court first.');
        return;
      }

      const pos = { ...lastCursorPos }; // Copy position before it changes
      const actualZone = inferShotTypeFromPos(pos);
      const warning = checkZoneContradiction(shotType, actualZone);
      if (warning && !confirm(`${warning}\n\nContinue logging anyway?`)) {
        return;
      }
      const markerEl = addShotMarker(controller.getActiveTeam(), shotType, result, pos);
      controller.applyShot(controller.getActiveTeam(), shotType, result, markerEl, pos);
      return;
    }

    // 4 - 4PT Made, Shift+4 - 4PT Missed
    if (key === '4' || key === '$') {
      e.preventDefault();
      if (isPaused || isTimeout) return;
      const shotType = '4pt';
      const result = isShift ? 'missed' : 'made';

      if (!lastCursorPos) {
        alert('Cannot log shot off court image. Hover cursor over the court first.');
        return;
      }

      const pos = { ...lastCursorPos }; // Copy position before it changes
      const markerEl = addShotMarker(controller.getActiveTeam(), shotType, result, pos);
      controller.applyShot(controller.getActiveTeam(), shotType, result, markerEl, pos);
      return;
    }

    // 2 - 2PT Made, Shift+2 - 2PT Missed
    if (key === '2' || key === '@') {
      e.preventDefault();
      if (isPaused || isTimeout) return;
      const shotType = '2pt';
      const result = isShift ? 'missed' : 'made';

      // Must have cursor over court to record shot
      if (!lastCursorPos) {
        alert('Cannot log shot off court image. Hover cursor over the court first.');
        return;
      }

      const pos = { ...lastCursorPos }; // Copy position before it changes
      const actualZone = inferShotTypeFromPos(pos);
      const warning = checkZoneContradiction(shotType, actualZone);
      if (warning && !confirm(`${warning}\n\nContinue logging anyway?`)) {
        return;
      }
      const markerEl = addShotMarker(controller.getActiveTeam(), shotType, result, pos);
      controller.applyShot(controller.getActiveTeam(), shotType, result, markerEl, pos);
      return;
    }

    // F - FT Made, Shift+F - FT Missed
    if (key === 'f') {
      e.preventDefault();
      if (isPaused || isTimeout) return;
      const shotType = 'ft';
      const result = isShift ? 'missed' : 'made';

      // Free throws don't show on court, only in actions and score
      controller.applyShot(controller.getActiveTeam(), shotType, result, null, null);
      return;
    }
  });
  
  // Change court image button handler
  const changeCourtImageBtn = document.getElementById('changeCourtImageBtn');
  if (changeCourtImageBtn) {
    changeCourtImageBtn.addEventListener('click', () => {
      if (!isGameRunning) {
        openGameCourtImageModal();
      }
    });
  }
  
  // Hotkey toggle functionality
  const hotkeyToggleBtn = document.getElementById('hotkeyToggleBtn');
  const hotkeyHints = document.querySelectorAll('.hotkey-hint');
  const topControlsToHide = [
    document.getElementById('target_side'),
    document.getElementById('shot_controls_row'),
    document.getElementById('undo_controls_row')
  ].filter(Boolean);

  const topControlDefaultDisplay = new Map();
  topControlsToHide.forEach((el) => {
    topControlDefaultDisplay.set(el, window.getComputedStyle(el).display || 'block');
  });
  
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

    topControlsToHide.forEach((el) => {
      if (visible) {
        el.style.display = topControlDefaultDisplay.get(el) || '';
      } else {
        el.style.display = 'none';
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
  const restoredLiveGame = restoreLiveGameSnapshotIfAvailable();
  if (!restoredLiveGame) {
    updateUI();
    // Lock all controls until game starts
    isGameRunning = false;
    setActionsEnabled(false);
  }
});

// Controller now lives within DOMContentLoaded for local state access
