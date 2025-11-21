let timerInterval;
let secondsElapsed = 0;
let isPaused = false;

const timerDisplay = document.getElementById("gameTimer");
const startGameBtn = document.getElementById("startGameBtn");
const pauseGameBtn = document.getElementById("pauseGameBtn");

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

    // Scores
    document.getElementById("teamAScore").textContent = game.final_score?.team_a ?? 0;
    document.getElementById("teamBScore").textContent = game.final_score?.team_b ?? 0;

    // Helper: find player details by ID
    function getPlayerName(playerId) {
      const player = game.all_player_ids.find(p => p._id === playerId);
      return player ? player.name : "Unknown Player";
    }

    // Team A players
    const teamAPlayers = document.getElementById("team_a_players");
    teamAPlayers.innerHTML = `<h5>Team A</h5>` + game.teams.team_a
      .map(id => `<p>${getPlayerName(id)}</p>`)
      .join("");

    // Team B players
    const teamBPlayers = document.getElementById("team_b_players");
    teamBPlayers.innerHTML = `<h5>Team B</h5>` + game.teams.team_b
      .map(id => `<p>${getPlayerName(id)}</p>`)
      .join("");

    // Optional: show game type
    document.getElementById("gameType").textContent = `${game.game_type} game`;
  } catch (error) {
    console.error("Failed to load game data:", error);
  }
}

// Run once on DOM load
document.addEventListener("DOMContentLoaded", () => {
  const urlParams = new URLSearchParams(window.location.search);
  const gameId = urlParams.get("gameId") || "69177809198ba3f3c08868c9"; // fallback test ID
  loadGameData(gameId);
});