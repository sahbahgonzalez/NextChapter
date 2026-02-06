const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const userSchema = new Schema({
    email: {
        type: String,
        required: true, // Email is mandatory
        unique: true,   // Each email must be unique in the collection
        lowercase: true, // Store emails in lowercase for consistency
        trim: true       // Remove leading/trailing whitespace
    },
    hashed_password: {
        type: String,
        required: true  // Password hash is mandatory
    },
    role: {
        type: String,
        required: true,
        enum: ['admin'], // Defined roles
        default: 'admin' // Default role
    }
}, {
    timestamps: true // Automatically adds createdAt and updatedAt fields
});

module.exports = mongoose.model('User', userSchema);