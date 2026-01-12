const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// Sub-schema for game events
const eventSchema = new Schema({
    type: {
        type: String,
        required: true,
        enum: ['shot', 'rebound', 'turnover', 'steal', 'block', 'foul', 'free_throw'] // Add other event types as needed
    },
    player_id: { type: Schema.Types.ObjectId, ref: 'Player', required: true },
    team: { type: String, required: true, enum: ['team_a', 'team_b'] },
    timestamp: { type: Date, required: true, default: Date.now },
    // Optional fields depending on event type:
    location: { // For shots
        x: { type: Number },
        y: { type: Number }
    },
    made: { type: Boolean }, // For shots and free throws
    points: { type: Number, enum: [1, 2, 3] }, // For shots and free throws
    rebound_type: { type: String, enum: ['offensive', 'defensive'] }, // For rebounds
    turnover_type: { type: String } // Could add specific turnover types later
}, { _id: false, strict: false }); // Allow extra fields if needed later

// Sub-schema for the per-player summary within a game
const playerGameStatsSchema = new Schema({
    pts: { type: Number, default: 0 },
    fga: { type: Number, default: 0 },
    fgm: { type: Number, default: 0 },
    // fg_percentage calculated on frontend or when generating summary
    '3pa': { type: Number, default: 0 }, // Use quotes for keys starting with numbers
    '3pm': { type: Number, default: 0 },
    // 3p_percentage calculated
    fta: { type: Number, default: 0 },
    ftm: { type: Number, default: 0 },
    // ft_percentage calculated
    reb: { type: Number, default: 0 },
    oreb: { type: Number, default: 0 },
    dreb: { type: Number, default: 0 },
    ast: { type: Number, default: 0 },
    tov: { type: Number, default: 0 },
    stl: { type: Number, default: 0 },
    blk: { type: Number, default: 0 },
    pf: { type: Number, default: 0 },
    plus_minus: { type: Number, default: 0 },
    is_double_double: { type: Boolean, default: false },
    is_triple_double: { type: Boolean, default: false }
}, { _id: false });

const gameSchema = new Schema({
    created_by: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    game_type: {
        type: String,
        required: true,
        enum: ['1v1', '2v2', '3v3', '5v5']
    },
    status: {
        type: String,
        required: true,
        // Add 'canceled' here
        enum: ['in_progress', 'finished', 'canceled'],
        default: 'in_progress'
    },
    all_player_ids: [{
        type: Schema.Types.ObjectId,
        ref: 'Player',
        required: true
    }],
    teams: {
        team_a: [{ type: Schema.Types.ObjectId, ref: 'Player', required: true }],
        team_b: [{ type: Schema.Types.ObjectId, ref: 'Player', required: true }]
    },
    score_to_win: {
        type: Number
    },
    final_score: {
        team_a: { type: Number, default: 0 },
        team_b: { type: Number, default: 0 }
    },
    winner: {
        type: String,
        enum: ['team_a', 'team_b', null], // Use null if game isn't finished or tied (if ties are possible)
        default: null
    },
    live_stats_applied: {
        type: Boolean,
        default: false
    },
    events: [eventSchema],
    // Use Map for game_stats_summary where keys are Player ObjectIds (as strings)
    game_stats_summary: {
        type: Map,
        of: playerGameStatsSchema,
        default: {}
    }
}, {
    timestamps: true // Adds createdAt and updatedAt
});

module.exports = mongoose.model('Game', gameSchema);