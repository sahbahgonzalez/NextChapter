let timerInterval;
let secondsElapsed = 0;
let isPaused = false;

const timerDisplay = document.getElementById("gameTimer");
const startGameBtn = document.getElementById("startGameBtn");
const pauseGameBtn = document.getElementById("pauseGameBtn");
const courtImage = document.getElementById("court_image");

let selectedPlayerId = null;
let selectedStat = null;
let currentGameId = null;
let currentGameData = null; // keep full game object for team lookup

function formatTime(seconds) {
  const mins = Math.floor(seconds / 60).toString().padStart(2, "0");
  const secs = (seconds % 60).toString().padStart(2, "0");
  return `${mins}:${secs}`;
}

function startTimer() {
  timerInterval = setInterval(() => {
    secondsElapsed++;
    timerDisplay.textContent = formatTime(secondsElapsed);
  }, 1000);
}

function stopTimer() {
  clearInterval(timerInterval);
}

startGameBtn.addEventListener("click", () => {
  if (startGameBtn.textContent === "Start Game") {
    startTimer();
    startGameBtn.textContent = "End Game";
    startGameBtn.classList.remove("btn-primary");
    startGameBtn.classList.add("btn-danger");
  } else {
    stopTimer();
    startGameBtn.textContent = "Start Game";
    startGameBtn.classList.remove("btn-danger");
    startGameBtn.classList.add("btn-primary");
    secondsElapsed = 0;
    timerDisplay.textContent = "00:00";
    pauseGameBtn.textContent = "Pause";
    isPaused = false;
  }
});

pauseGameBtn.addEventListener("click", () => {
  if (!isPaused) {
    stopTimer();
    pauseGameBtn.textContent = "Resume";
    isPaused = true;
  } else {
    startTimer();
    pauseGameBtn.textContent = "Pause";
    isPaused = false;
  }
});

async function loadGameData(gameId) {
  try {
    const game = await apiClient.getGameById(gameId);
    console.log("Game data from API:", game);
    currentGameId = gameId;
    currentGameData = game;

    // Scores
    document.getElementById("teamAScore").textContent = game.final_score?.team_a ?? 0;
    document.getElementById("teamBScore").textContent = game.final_score?.team_b ?? 0;

    // Helper: find player details by ID
    function getPlayer(playerId) {
      return game.all_player_ids.find(p => p._id === playerId);
    }

    // Team A players
    const teamAPlayers = document.getElementById("team_a_players");
    teamAPlayers.innerHTML = `<h5>Team A</h5>` + game.teams.team_a
      .map(id => {
        const player = getPlayer(id);
        return `<p data-player-id="${player?._id}">${player ? player.name : "Unknown Player"}</p>`;
      })
      .join("");

    // Team B players
    const teamBPlayers = document.getElementById("team_b_players");
    teamBPlayers.innerHTML = `<h5>Team B</h5>` + game.teams.team_b
      .map(id => {
        const player = getPlayer(id);
        return `<p data-player-id="${player?._id}">${player ? player.name : "Unknown Player"}</p>`;
      })
      .join("");

    // Game type with score_to_win
    document.getElementById("gameType").textContent = `${game.game_type} game to ${game.score_to_win}`;

    // Setup player selection after rendering
    setupPlayerSelection();
  } catch (error) {
    console.error("Failed to load game data:", error);
  }
}

function setupPlayerSelection() {
  document.querySelectorAll("#team_a_players p, #team_b_players p").forEach(el => {
    el.addEventListener("click", () => {
      selectedPlayerId = el.getAttribute("data-player-id");
      console.log("Selected player:", selectedPlayerId);
      // Highlight selected
      document.querySelectorAll("#team_a_players p, #team_b_players p").forEach(p => p.classList.remove("selected"));
      el.classList.add("selected");
    });
  });
}

function setupStatSelection() {
  document.querySelectorAll("#stat_buttons .btn-stat").forEach(btn => {
    btn.addEventListener("click", () => {
      selectedStat = btn.getAttribute("data-stat");
      console.log("Selected stat:", selectedStat);
      // Highlight selected
      document.querySelectorAll("#stat_buttons .btn-stat").forEach(b => b.classList.remove("selected"));
      btn.classList.add("selected");
    });
  });
}

courtImage.addEventListener("click", (e) => {
  if (!selectedPlayerId || !selectedStat) {
    alert("Select a player and a stat first!");
    return;
  }

  const rect = courtImage.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  console.log(`Court click at (${x}, ${y}) for player ${selectedPlayerId}, stat ${selectedStat}`);

  saveGameEvent(selectedPlayerId, selectedStat, x, y);
});

async function saveGameEvent(playerId, statType, x, y) {
  try {
    let team = null;
    if (currentGameData.teams.team_a.includes(playerId)) {
      team = "team_a";
    } else if (currentGameData.teams.team_b.includes(playerId)) {
      team = "team_b";
    }

    if (!team) {
      console.error("Could not determine team for player:", playerId);
      return;
    }

    const eventData = {
      type: statType,          // e.g. "Assist"
      player_id: playerId,     // backend expects _id
      team: team,              // "team_a" or "team_b"
      location: { x, y },
      timestamp: new Date().toISOString() // ✅ helpful for backend
    };

    console.log("Sending event payload:", eventData);

    await apiClient.addGameEvent(currentGameId, eventData);
    console.log("Event saved:", eventData);

    if (statType === "Shot Made") {
      if (team === "team_a") {
        let score = parseInt(document.getElementById("teamAScore").textContent, 10);
        document.getElementById("teamAScore").textContent = score + 2;
      } else {
        let score = parseInt(document.getElementById("teamBScore").textContent, 10);
        document.getElementById("teamBScore").textContent = score + 2;
      }
    }
  } catch (error) {
    console.error("Failed to save event:", error);
  }
}

// Run once on DOM load
document.addEventListener("DOMContentLoaded", () => {
  setupStatSelection();

  const urlParams = new URLSearchParams(window.location.search);
  const gameId = urlParams.get("gameId") || "69177809198ba3f3c08868c9"; // fallback test ID
  loadGameData(gameId);
});