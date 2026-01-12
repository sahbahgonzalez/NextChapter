const Player = require('./model');
const Game = require('../game/model');
const mongoose = require('mongoose');

// Escape user-provided input for safe regex use
function escapeRegex(text) {
    return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const createPlayer = async (request, response) => {
    // Assumes protect middleware ran and attached request.user
    const created_by = request.user._id;

    // Extract player details from request body
    const {
        name,
        instagram_handle,
        profile_image_url,
        bio,
        height_inches,
        weight_lbs,
        hometown,
        date_of_birth,
        city,
        state
    } = request.body;

    // Basic validation (add more robust validation later, e.g., express-validator)
    // Name is optional now. Prepare name to store: trim surrounding whitespace
    let nameToStore;
    if (name !== undefined && name !== null) {
        const n = String(name).trim();
        if (n.length > 0) nameToStore = n;
    }
    // Trim instagram handle if present
    let igHandleToStore;
    if (instagram_handle !== undefined && instagram_handle !== null) {
        const ig = String(instagram_handle).trim();
        if (ig.length > 0) igHandleToStore = ig;
    }
    // Trim hometown if present
    let hometownToStore;
    if (hometown !== undefined && hometown !== null) {
        const h = String(hometown).trim();
        if (h.length > 0) hometownToStore = h;
    }

    try {
        // Create new player object
        const newPlayerData = {
            created_by,
            profile_image_url,
            bio,
            height_inches,
            weight_lbs,
            date_of_birth,
            city,
            state
        };
        if (nameToStore) newPlayerData.name = nameToStore;
        if (igHandleToStore) newPlayerData.instagram_handle = igHandleToStore;
        if (hometownToStore) newPlayerData.hometown = hometownToStore;

        const newPlayer = new Player(newPlayerData);

        // Save the player to the database
        const savedPlayer = await newPlayer.save();

        // Send back the created player data
        response.status(201).json(savedPlayer);

    } catch (error) {
        console.error("Player Creation Error:", error);
        // Handle potential duplicate key errors if unique constraints are added (like unique IG handle)
        if (error.code === 11000) {
            return response.status(400).json({ message: 'Error creating player: A player with that value already exists.' });
        }
        response.status(500).json({ message: 'Server error during player creation' });
    }
};

const updatePlayer = async (request, response) => {
    // params comes from the /:id
    const { id } = request.params;
    // body comes from frontend
    const updates = request.body; // Contains fields to update

    // Validate if the ID is a valid MongoDB ObjectId
    if (!mongoose.Types.ObjectId.isValid(id)) {
        return response.status(400).json({ message: 'Invalid player ID format' });
    }

    // Prevent updating protected fields like stats directly via this route
    delete updates.overall_stats;
    delete updates.all_time_shot_data;
    delete updates.created_by;

    // Normalize name and instagram handle if provided
    if (updates.name !== undefined && updates.name !== null) {
        if (typeof updates.name === 'string') {
            updates.name = updates.name.trim();
            if (updates.name.length === 0) delete updates.name; // don't set empty string
        }
    }
    if (updates.instagram_handle !== undefined && updates.instagram_handle !== null) {
        if (typeof updates.instagram_handle === 'string') {
            updates.instagram_handle = updates.instagram_handle.trim();
            if (updates.instagram_handle.length === 0) delete updates.instagram_handle;
        }
    }
    if (updates.hometown !== undefined && updates.hometown !== null) {
        if (typeof updates.hometown === 'string') {
            updates.hometown = updates.hometown.trim();
            if (updates.hometown.length === 0) delete updates.hometown;
        }
    }

    try {
        const updatedPlayer = await Player.findByIdAndUpdate(id, updates, { new: true, runValidators: true });

        if (!updatedPlayer) {
            return response.status(404).json({ message: 'Player not found' });
        }

        response.status(200).json(updatedPlayer);

    } catch (error) {
        console.error("Player Update Error: ", error);
        response.status(500).json({ message: 'Server error during player update'});
    }
};

const deletePlayer = async (request, response) => {
    const { id } = request.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
        return response.status(404).json({ message: 'Player not found'});
    }

    try {
        const deletePlayer = await Player.findByIdAndDelete(id);

        if (!deletePlayer) {
            return response.status(404).json({ message: 'Player not found'});
        }

        return response.status(200).json({ message: 'Player Deleted'});
    } catch (error) {
        console.error("Player Deletion Error: ", error);
        response.status(500).json({ message: 'Server error during player deletion'});
    }
}

const searchPlayers = async (request, response) => {
    const searchTerm = request.query.search;
    const rawLimit = request.query.limit;

    // Interpret limit: if provided and >0, apply; if 0 treat as 'no limit'; if omitted, default to no limit
    let parsedLimit;
    if (rawLimit !== undefined) {
        const p = parseInt(rawLimit, 10);
        if (!isNaN(p) && p >= 0) parsedLimit = p; // 0 means no limit, >0 means limit, undefined means no limit by default
    }

    try {
        // If no search term provided or search is only whitespace, return all players
        if (!searchTerm || String(searchTerm).trim().length === 0) {
            let query = Player.find({})
                .select('_id name instagram_handle profile_image_url hometown height_inches weight_lbs overall_stats');

            // Apply limit only when parsedLimit is a positive integer
            if (typeof parsedLimit === 'number' && parsedLimit > 0) {
                query = query.limit(parsedLimit);
            }

            const players = await query;
            return response.status(200).json(players);
        }

        // Normalize search term: remove all whitespace and escape regex chars
        const cleaned = String(searchTerm).replace(/\s+/g, '').toLowerCase();
        const safe = escapeRegex(cleaned);

        // Use aggregation to create a whitespace-stripped, lowercased field for matching
        const pipeline = [
            // add normalized fields
            {
                $addFields: {
                    __normalized_name: { $toLower: { $replaceAll: { input: { $ifNull: ['$name', ''] }, find: ' ', replacement: '' } } },
                    __normalized_instagram: { $toLower: { $replaceAll: { input: { $ifNull: ['$instagram_handle', ''] }, find: ' ', replacement: '' } } }
                }
            },
            // match against normalized fields using the cleaned search term
            {
                $match: {
                    $or: [
                        { __normalized_name: { $regex: safe } },
                        { __normalized_instagram: { $regex: safe } }
                    ]
                }
            },
            // project only the public fields
            {
                $project: {
                    _id: 1,
                    name: 1,
                    instagram_handle: 1,
                    profile_image_url: 1,
                    hometown: 1,
                    height_inches: 1,
                    weight_lbs: 1,
                    overall_stats: 1
                }
            }
        ];

        // Apply limit only when parsedLimit is a positive integer
        if (typeof parsedLimit === 'number' && parsedLimit > 0) {
            pipeline.push({ $limit: parsedLimit });
        }

        const players = await Player.aggregate(pipeline);

        response.status(200).json(players);

    } catch (error) {
        console.error('Player Search Error:', error);
        response.status(500).json({ message: 'Server error during player search' });
    }
};

const getPlayerById = async (request, response) => {
    const { id } = request.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
        return response.status(400).json({ message: 'Invalid player ID format' });
    }

    try {
        const player = await Player.findById(id);

        if (!player) {
            return response.status(404).json({ message: 'Player not found' });
        }

        response.status(200).json(player); // Return the full player document

    } catch (error) {
        console.error("Player Retrieval Error:", error);
        response.status(500).json({ message: 'Server error during player retrieval by ID' });
    }
};

const getPlayerRecentGames = async (request, response) => {
    const { id } = request.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
        return response.status(400).json({ message: 'Invalid player ID format' });
    }

    try {
        const games = await Game.find({ all_player_ids: id })
            .sort({ createdAt: -1 }) // Sort by creation date, newest first
            .limit(10)
            .select('_id game_type status final_score teams winner createdAt');

        response.status(200).json(games);

    } catch (error) {
        console.error("Recent Game Retrieval Error:", error);
        response.status(500).json({ message: 'Server error during player games retrieval' });
    }
};

module.exports = {
    createPlayer,
    updatePlayer,
    deletePlayer,
    searchPlayers,
    getPlayerById,
    getPlayerRecentGames
};