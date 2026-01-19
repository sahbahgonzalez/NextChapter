const Game = require('./model');
const Player = require('../player/model'); // Import Player model for stat updates
const mongoose = require('mongoose');

// --- Helper Functions ---
// --- Internally Calculating Stats ---
const _internalCalculateStats = (game) => {
    const statsSummary = new Map(); // Use a Map to store stats per player ID

    // Initialize stats for all players in the game
    game.all_player_ids.forEach(playerId => {
        statsSummary.set(playerId.toString(), {
            pts: 0, fga: 0, fgm: 0, '3pa': 0, '3pm': 0, fta: 0, ftm: 0,
            reb: 0, oreb: 0, dreb: 0, ast: 0, tov: 0, stl: 0, blk: 0, pf: 0,
            // We'll calculate plus_minus, dd2, td3 later if needed, more complex
        });
    });

    // Iterate through events to tally stats
    game.events.forEach(event => {
        const playerIdStr = event.player_id.toString();
        const playerStats = statsSummary.get(playerIdStr);

        if (!playerStats) return; // Should not happen if initialized correctly

        switch (event.type) {
            case 'shot':
                playerStats.fga += 1;
                if (event.points === 3) playerStats['3pa'] += 1;
                if (event.made) {
                    playerStats.fgm += 1;
                    playerStats.pts += event.points;
                    if (event.points === 3) playerStats['3pm'] += 1;
                }
                break;
            case 'free_throw':
                 playerStats.fta += 1;
                 if (event.made) {
                     playerStats.ftm += 1;
                     playerStats.pts += 1;
                 }
                 break;
            case 'rebound':
                playerStats.reb += 1;
                if (event.rebound_type === 'offensive') playerStats.oreb += 1;
                else playerStats.dreb += 1;
                break;
            case 'turnover':
                playerStats.tov += 1;
                break;
            case 'steal':
                playerStats.stl += 1;
                break;
            case 'block':
                playerStats.blk += 1;
                break;
            case 'foul':
                playerStats.pf += 1;
                break;
            // Add case for 'assist' which will add some complexity later
            default:
                break;
        }
        statsSummary.set(playerIdStr, playerStats);
    });

    // Calculate DD2/TD3 flags (Simplified example)
    statsSummary.forEach((stats, playerId) => {
        let count10 = 0;
        if (stats.pts >= 10) count10++;
        if (stats.reb >= 10) count10++;
        if (stats.ast >= 10) count10++;
        if (stats.stl >= 10) count10++;
        if (stats.blk >= 10) count10++;

        if (count10 >= 3) {
            stats.is_triple_double = true;
            stats.is_double_double = true;
        } else if (count10 >= 2) {
        stats.is_double_double = true;
        }
            statsSummary.set(playerId, stats);
    });


    return statsSummary;
};

// Apply per-event increments directly to the player's aggregate stats during live play
const _applyLivePlayerDelta = async (gameId, event) => {
    const playerId = event.player_id;
    if (!playerId) return;

    const inc = {};
    const points = event.points !== undefined && event.points !== null
        ? event.points
        : (event.type === 'free_throw' ? 1 : 0);

    if (event.type === 'shot') {
        inc['overall_stats.total_fga'] = 1;
        if (points === 3) {
            inc['overall_stats.total_3pa'] = 1;
        } else {
            inc['overall_stats.total_2pa'] = 1;
        }
        if (event.made) {
            inc['overall_stats.total_fgm'] = 1;
            inc['overall_stats.total_points'] = points;
            if (points === 3) inc['overall_stats.total_3pm'] = 1;
            else inc['overall_stats.total_2pm'] = 1;
        }
    } else if (event.type === 'free_throw') {
        inc['overall_stats.total_fta'] = 1;
        if (event.made) {
            inc['overall_stats.total_ftm'] = 1;
            inc['overall_stats.total_points'] = 1;
        }
    } else if (event.type === 'foul') {
        inc['overall_stats.total_fouls'] = 1;
    }

    const update = { $inc: inc };

    // Optionally push shot data if coordinates are provided
    const hasCoords = event.location && typeof event.location.x === 'number' && typeof event.location.y === 'number';
    if (hasCoords && (event.type === 'shot' || event.type === 'free_throw')) {
        update.$push = {
            all_time_shot_data: {
                x: event.location.x,
                y: event.location.y,
                made: !!event.made,
                points: points || 0,
                game_id: gameId,
                timestamp: event.timestamp || new Date()
            }
        };
    }

    // If no increments (unexpected type), exit
    if (!Object.keys(inc).length) return;

    await Player.findByIdAndUpdate(playerId, update);
};

// --- Update Player Overall Stats ---
const _internalUpdatePlayerStats = async (game, options = {}) => {
    const { skipTotals = false } = options;
    let playerUpdatePromises = [];
    const shotsByPlayer = {};

    game.events.forEach(event => {
        if (event.type === 'shot') {
            const playerIdStr = event.player_id.toString();
            if (!shotsByPlayer[playerIdStr]) {
                shotsByPlayer[playerIdStr] = [];
            }
            shotsByPlayer[playerIdStr].push({
                x: event.location?.x, // Optional just in case
                y: event.location?.y,
                made: event.made,
                points: event.points,
                game_id: game._id, // Add the game ID reference
                timestamp: event.timestamp // Use the event's timestamp
            });
        }
    });

    game.game_stats_summary.forEach((stats, playerIdStr) => {
        // --- Determine Win/Loss/Neither based on game status ---
        let winIncrement = 0;
        let lossIncrement = 0;
        
        if (game.status === 'finished') {
            // Is player on TeamA or TeamB
            const isTeamA = game.teams.team_a.map(id => id.toString()).includes(playerIdStr);
            const isTeamB = game.teams.team_b.map(id => id.toString()).includes(playerIdStr);

            console.log(`Player ${playerIdStr}: isTeamA=${isTeamA}, isTeamB=${isTeamB}, gameWinner=${game.winner}`);

            if (game.winner === 'team_a' && isTeamA) {
                winIncrement = 1;
            } else if (game.winner === 'team_b' && isTeamB) {
                winIncrement = 1;
            } else if (game.winner === 'team_a' && isTeamB) {
                lossIncrement = 1;
            } else if (game.winner === 'team_b' && isTeamA) {
                lossIncrement = 1;
            }

            console.log(`Player ${playerIdStr}: winInc=${winIncrement}, lossInc=${lossIncrement}`);
        }

        const updateData = {
            $inc: {
                'overall_stats.games_played': 1,
                'overall_stats.wins': winIncrement,
                'overall_stats.losses': lossIncrement,
            }
        };

        if (!skipTotals) {
            Object.assign(updateData.$inc, {
                'overall_stats.total_points': stats.pts || 0,
                'overall_stats.total_fga': stats.fga || 0,
                'overall_stats.total_fgm': stats.fgm || 0,
                'overall_stats.total_3pa': stats['3pa'] || 0,
                'overall_stats.total_3pm': stats['3pm'] || 0,
                'overall_stats.total_2pa': (stats.fga || 0) - (stats['3pa'] || 0),
                'overall_stats.total_2pm': (stats.fgm || 0) - (stats['3pm'] || 0),
                'overall_stats.total_fta': stats.fta || 0,
                'overall_stats.total_ftm': stats.ftm || 0,
                'overall_stats.total_rebounds': stats.reb || 0,
                'overall_stats.total_oreb': stats.oreb || 0,
                'overall_stats.total_dreb': stats.dreb || 0,
                'overall_stats.total_assists': stats.ast || 0,
                'overall_stats.total_turnovers': stats.tov || 0,
                'overall_stats.total_steals': stats.stl || 0,
                'overall_stats.total_blocks': stats.blk || 0,
                'overall_stats.total_fouls': stats.pf || 0,
                'overall_stats.total_double_doubles': stats.is_double_double ? 1 : 0,
                'overall_stats.total_triple_doubles': stats.is_triple_double ? 1 : 0,
            });
        }

        if (!skipTotals && shotsByPlayer[playerIdStr] && shotsByPlayer[playerIdStr].length > 0) {
            updateData.$push = {
                all_time_shot_data: { $each: shotsByPlayer[playerIdStr] }
            };
        }

        playerUpdatePromises.push(
            Player.findByIdAndUpdate(playerIdStr, updateData)
        );
    });

    try {
        await Promise.all(playerUpdatePromises); // Execute all updates concurrently
        console.log(`Successfully updated overall stats for players in game ${game._id} (Status: ${game.status})`);
    } catch (error) {
        console.error(`Error updating player stats for game ${game._id}:`, error);
    }
};

// --- Internally Finalizing Game ---
const _internalFinalizeGame = async (gameId) => {
    try {
        const game = await Game.findById(gameId);

        if (!game) {
            console.error(`Finalize Error: Game ${gameId} not found.`);
            return null; // game not found
        }
        if (game.status !== 'in_progress') {
            console.warn(`Finalize Warning: Game ${gameId} is already '${game.status}'. Cannot finalize again.`);
            return null; // game not in progress
        }

        // Determine winner based on current score
        if (game.final_score.team_a > game.final_score.team_b) {
            game.winner = 'team_a';
        } else if (game.final_score.team_b > game.final_score.team_a) {
            game.winner = 'team_b';
        } else {
            game.winner = null; // Handle ties
        }

        game.status = 'finished';
        game.game_stats_summary = _internalCalculateStats(game);
        const finalizedGame = await game.save();

        _internalUpdatePlayerStats(finalizedGame, { skipTotals: finalizedGame.live_stats_applied }).catch(err => {
             console.error(`Background player stat update failed for finalized game ${gameId}:`, err);
         });

        return finalizedGame;
     } catch (error) {
        console.error(`Error during internal finalization for game ${gameId}:`, error);
        throw error;
    }
};

// --- APIs ---
const createGame = async (request, response) => {
    const created_by = request.user._id;
    const { game_type, team_a, team_b, score_to_win } = request.body;

    if (!game_type || !team_a || !team_b || team_a.length === 0 || team_b.length === 0) {
        return response.status(400).json({ message: 'Missing required game creation fields (game_type, team_a, team_b)' });
    }

    const allIds = [...team_a, ...team_b];
    const uniqueIds = [...new Set(allIds)];

    for (const id of uniqueIds) {
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return response.status(400).json({ message: `Invalid player ID format: ${id}` });
        }
    }

    try {
        const foundPlayers = await Player.find({ '_id': { $in: uniqueIds } }).select('_id');

        if (foundPlayers.length !== uniqueIds.length) {
            const foundIds = foundPlayers.map(p => p._id.toString());
            const missingIds = uniqueIds.filter(id => !foundIds.includes(id));
            return response.status(404).json({
                 message: 'One or more player IDs were not found',
                 missing_ids: missingIds
             });
        }

        // If all checks pass, proceed to create the game
        const newGame = new Game({
            created_by,
            game_type,
            all_player_ids: uniqueIds, // Use the validated unique IDs
            teams: { team_a, team_b },
            score_to_win, // Optional score_to_win
            status: 'in_progress',
        });

        const savedGame = await newGame.save();
        response.status(201).json(savedGame);

    } catch (error) {
        console.error("Game Creation Error:", error);
        response.status(500).json({ message: 'Server error during game creation' });
    }
};

const addGameEvent = async (request, response) => {
    const { id: gameId } = request.params;
    const eventData = request.body;

    // Basic event data validation (add more robust validation)
    if (!eventData.type || !eventData.player_id || !eventData.team) {
        return response.status(400).json({ message: 'Event data requires type, player_id, and team' });
    }

    if (!mongoose.Types.ObjectId.isValid(gameId)) {
        return response.status(400).json({ message: 'Invalid game ID format' });
    }

    try {
        const game = await Game.findById(gameId);

        if (!game) {
            return response.status(404).json({ message: 'Game not found' });
        }

        if (game.status !== 'in_progress') {
            return response.status(400).json({ message: `Cannot add event, game status is '${game.status}'` });
        }

        // Add timestamp if not provided by client (usually better to let server do it)
        eventData.timestamp = new Date();

        // Push event
        game.events.push(eventData);

        // Mark that live stat deltas are being applied so finalize won't double count
        game.live_stats_applied = true;

        // Update score if it was a made shot/FT
        if ((eventData.type === 'shot' || eventData.type === 'free_throw') && eventData.made) {
            const points = eventData.points || (eventData.type === 'free_throw' ? 1 : 0); // Default FT to 1 point
            if (eventData.team === 'team_a') {
                game.final_score.team_a += points;
            } else if (eventData.team === 'team_b') {
                game.final_score.team_b += points;
            }
        }

        // --- Check for Win Condition ---

        /*
        let finalizedGame = null;
        if (game.final_score.team_a >= game.score_to_win || game.final_score.team_b >= game.score_to_win) {
            console.log(`Game ${gameId} win condition met. Finalizing...`);
            // Don't await this if you want to send response faster, but awaiting ensures
            // the game document you send back *is* the finalized one.
            finalizedGame = await _internalFinalizeGame(gameId);
            if (!finalizedGame) {
                // Finalization failed internally, likely already finished/canceled
                // Might need to refetch the game to send current state
                const currentGame = await Game.findById(gameId);
                return response.status(200).json({ message: 'Event added, but game was likely already finalized.', game: currentGame });
            }
        } else {
            // Save game with new event and potentially updated score if not finished
            await game.save();
        }
        */

        // Apply live player stat delta before persisting the game for consistency
        await _applyLivePlayerDelta(game._id, eventData);

        await game.save();

        response.status(200).json({
            message: 'Event added successfully',
            game: game
        });


    } catch (error) {
        console.error("Game Event Error:", error);
        response.status(500).json({ message: 'Server error during game event processing' });
    }
};

const getGameById = async (request, response) => {
    const { id } = request.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
        return response.status(400).json({ message: 'Invalid game ID format' });
    }

    try {
        const game = await Game.findById(id)
            .populate('all_player_ids', 'name instagram_handle')
            .populate('created_by', 'email');

        if (!game) {
            return response.status(404).json({ message: 'Game not found' });
        }

        response.status(200).json(game);

    } catch (error) {
        console.error("Game Retrieval Error:", error);
        response.status(500).json({ message: 'Server error during game retrieval by id' });
    }
};

const getAllGames = async (request, response) => {
    try {
        const games = await Game.find()
            .sort({ createdAt: -1 })
            .lean();

        console.log('Successfully retrieved games:', games.length);
        response.status(200).json(games);

    } catch (error) {
        console.error("Games Retrieval Error:", error.message);
        console.error("Full error:", error);
        response.status(500).json({ message: 'Server error during games retrieval', error: error.message });
    }
};

const finalizeGame = async (request, response) => {
    const { id: gameId } = request.params;

     if (!mongoose.Types.ObjectId.isValid(gameId)) {
        return response.status(400).json({ message: 'Invalid game ID format' });
    }

    try {
        const finalizedGame = await _internalFinalizeGame(gameId);

        if (!finalizedGame) {
        const game = await Game.findById(gameId);
        if (!game) return response.status(404).json({ message: 'Game not found' });
        return response.status(400).json({ message: `Game cannot be finalized, status is already '${game.status}'`});
        }

        response.status(200).json({ message: 'Game finalized successfully', game: finalizedGame });

    } catch (error) {
        console.error("Game Finalization Error:", error);
        response.status(500).json({ message: 'Server error during finalizing game' });
    }
};

const cancelGame = async (request, response) => {
    const { id: gameId } = request.params;

    if (!mongoose.Types.ObjectId.isValid(gameId)) {
        return response.status(400).json({ message: 'Invalid game ID format' });
    }

    try {
        const game = await Game.findById(gameId);

        if (!game) {
            return response.status(404).json({ message: 'Game not found' });
        }

        if (game.status !== 'in_progress') {
            return response.status(400).json({ message: `Game cannot be canceled, status is already '${game.status}'` });
        }

        game.status = 'canceled'; // Set status to canceled
        game.winner = null; // Ensure winner is null

        game.game_stats_summary = _internalCalculateStats(game);

        const canceledGame = await game.save();

        _internalUpdatePlayerStats(canceledGame, { skipTotals: canceledGame.live_stats_applied }).catch(err => {
             console.error(`Background player stat update failed for canceled game ${gameId}:`, err);
         });

        response.status(200).json({ message: 'Game canceled successfully, partial stats recorded.', game: canceledGame });

    } catch (error) {
        console.error("Game Cancellation Error:", error);
        response.status(500).json({ message: 'Server error during canceling game' });
    }
};

class GameController {
    async createGame(request, response) {
        return await createGame(request, response);
    }

    async addGameEvent(request, response) {
        return await addGameEvent(request, response);
    }

    async getGameById(request, response) {
        return await getGameById(request, response);
    }

    async getAllGames(request, response) {
        return await getAllGames(request, response);
    }

    async finalizeGame(request, response) {
        return await finalizeGame(request, response);
    }

    async cancelGame(request, response) {
        return await cancelGame(request, response);
    }
}

module.exports = new GameController();

