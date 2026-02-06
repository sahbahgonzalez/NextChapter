/**
 TO USE:
 * 1. Include this file in your HTML:
 * <script src="/utils/api.js"></script>
 *
 * 2. In your other JS files, you can now call functions like:
 * await apiClient.login('admin@test.com', 'password123');
 * const players = await apiClient.searchPlayers('jordan');
 * const newPlayer = await apiClient.createPlayer({ name: 'New Player' });
 */

(function(window) {
  'use strict';

  const API_BASE_URL = 'https://the-next-chapter-backend.onrender.com';

  // -----------------------------------------------------------------
  // 2. CORE HELPER FUNCTIONS
  // -----------------------------------------------------------------

  /**
   * A private helper function to handle all protected API requests.
   * It automatically gets the token from localStorage and adds it
   * to the Authorization header.
   *
   * @param {string} endpoint - The API endpoint (e.g., '/players')
   * @param {string} method - The HTTP method (e.g., 'POST', 'PATCH')
   * @param {object} [body] - The JSON data to send (optional)
   * @returns {Promise<object>} The JSON response from the server
   */
  async function _fetchWithToken(endpoint, method = 'GET', body = null) {
    const token = localStorage.getItem('authToken');

    if (!token) {
      console.error('No auth token found. Redirecting to login.');
      // If you have a login page, uncomment this to auto-redirect
      // window.location.href = '/login.html'; 
      throw new Error('No auth token found. Please log in.');
    }

    const options = {
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    try {
      const response = await fetch(`${API_BASE_URL}${endpoint}`, options);
      const data = await response.json();

      if (!response.ok) {
        // If server returns an error (4xx, 5xx), throw it
        throw new Error(data.message || `Error: ${response.status}`);
      }

      return data; // Success
    } catch (error) {
      console.error(`API Error (${method} ${endpoint}):`, error);
      throw error; // Re-throw the error for the page to handle
    }
  }

  /**
   * A private helper for public (non-auth) GET requests.
   */
  async function _fetchPublic(endpoint) {
    try {
      const response = await fetch(`${API_BASE_URL}${endpoint}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || `Error: ${response.status}`);
      }
      return data; // Success
    } catch (error) {
      console.error(`API Error (GET ${endpoint}):`, error);
      throw error;
    }
  }

  // APIs
  const apiClient = {};

  apiClient.login = async function(email, password) {
    // This is the only request that *doesn't* use the helper
    const response = await fetch(`${API_BASE_URL}/user/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || 'Login failed');
    }

    // Save token and user to localStorage
    localStorage.setItem('authToken', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));

    return data;
  };

  apiClient.logout = function() {
    localStorage.removeItem('authToken');
    localStorage.removeItem('user');
    // Redirect to login page
    window.location.href = '/login.html';
    console.log('Logged out');
  };

  apiClient.getUser = function() {
    const user = localStorage.getItem('user');
    return user ? JSON.parse(user) : null;
  };

  apiClient.getToken = function() {
    return localStorage.getItem('authToken');
  };


  // =============================================================
  // PLAYERS API
  // =============================================================
  apiClient.listAllPlayers = async function(page = 1, limit = 25) {
    return _fetchPublic(`/player/all?page=${page}&limit=${limit}`);
  };

  apiClient.createPlayer = async function(playerData) {
    return _fetchWithToken('/player', 'POST', playerData);
  };

  apiClient.updatePlayer = async function(playerId, updates) {
    return _fetchWithToken(`/player/${playerId}`, 'PATCH', updates);
  };

  apiClient.deletePlayer = async function(playerId) {
    return _fetchWithToken(`/player/${playerId}`, 'DELETE');
  };

  apiClient.searchPlayers = async function(searchTerm) {
    return _fetchPublic(`/player?search=${encodeURIComponent(searchTerm)}`);
  };

  apiClient.getPlayerById = async function(playerId) {
    return _fetchPublic(`/player/${playerId}`);
  };

  apiClient.getPlayerRecentGames = async function(playerId) {
    return _fetchPublic(`/player/${playerId}/games`);
  };


  // =============================================================
  // GAMES API
  // =============================================================

  apiClient.createGame = async function(gameData) {
    return _fetchWithToken('/game', 'POST', gameData);
  };

  apiClient.updateGame = async function(gameId, updates) {
    return _fetchWithToken(`/game/${gameId}`, 'PATCH', updates);
  };

  apiClient.addGameEvent = async function(gameId, eventData) {
    return _fetchWithToken(`/game/${gameId}/event`, 'POST', eventData);
  };

  apiClient.finalizeGame = async function(gameId) {
    return _fetchWithToken(`/game/${gameId}/finish`, 'PATCH');
  };

  apiClient.cancelGame = async function(gameId) {
    return _fetchWithToken(`/game/${gameId}/cancel`, 'PATCH');
  };

  apiClient.getGameById = async function(gameId) {
    return _fetchPublic(`/game/${gameId}`);
  };

  window.apiClient = apiClient;

})(window);