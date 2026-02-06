const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// Sub-schema for individual shots in the all_time_shot_data array
const shotSchema = new Schema({
    x: { type: Number, required: true },
    y: { type: Number, required: true },
    made: { type: Boolean, required: true },
    points: { type: Number, required: true, enum: [1, 2, 3] }, // Assuming 1=FT, 2=FG, 3=3PT
    game_id: { type: Schema.Types.ObjectId, ref: 'Game', required: true },
    timestamp: { type: Date, required: true }
}, { _id: false }); // Don't create separate _id for each shot object

const playerSchema = new Schema({
    created_by: {
        type: Schema.Types.ObjectId, // Link to the User who created this player
        ref: 'User',
        required: true
    },
    name: {
        type: String,
        trim: true
    },
    instagram_handle: {
        type: String,
        trim: true,
        // unique: true // Consider if IG handles must be unique
    },
    profile_image_url: {
        type: String,
        trim: true,
        default: '../public/images/default_image.png'
    },
    bio: {
        type: String,
        trim: true,
        default: 'Player at TheNextChapter!'
    },
    height_inches: {
        type: Number
    },
    weight_lbs: {
        type: Number
    },
    hometown: {
        type: String,
        trim: true
    },
    date_of_birth: {
        type: Date
    },
    city: {
        type: String,
        trim: true
    },
    state: {
        type: String,
        trim: true
    },
    overall_stats: {
        games_played: { type: Number, default: 0 },
        wins: { type: Number, default: 0 },
        losses: { type: Number, default: 0 },
        // win_percentage calculated on frontend
        total_minutes: { type: Number, default: 0 },
        total_points: { type: Number, default: 0 },
        total_fga: { type: Number, default: 0 },
        total_fgm: { type: Number, default: 0 },
        // fg_percentage calculated on frontend
        total_3pa: { type: Number, default: 0 },
        total_3pm: { type: Number, default: 0 },
        // 3p_percentage calculated on frontend
        total_2pa: { type: Number, default: 0 },
        total_2pm: { type: Number, default: 0 },
        // 2p_percentage calculated on frontend
        total_fta: { type: Number, default: 0 },
        total_ftm: { type: Number, default: 0 },
        // ft_percentage calculated on frontend
        total_rebounds: { type: Number, default: 0 },
        total_oreb: { type: Number, default: 0 },
        total_dreb: { type: Number, default: 0 },
        total_assists: { type: Number, default: 0 },
        total_turnovers: { type: Number, default: 0 },
        total_steals: { type: Number, default: 0 },
        total_blocks: { type: Number, default: 0 },
        total_fouls: { type: Number, default: 0 },
        total_plus_minus: { type: Number, default: 0 },
        total_double_doubles: { type: Number, default: 0 },
        total_triple_doubles: { type: Number, default: 0 }
    },
    all_time_shot_data: [shotSchema] // Array using the sub-schema defined above
}, {
    timestamps: true // Adds createdAt and updatedAt
});

module.exports = mongoose.model('Player', playerSchema);