// Dependencies
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const path = require('path');

// Require Routes/API Endpoints
const gameRouter = require('./routes/game');
const playerRouter = require('./routes/player');
const userRouter = require('./routes/user');

// App Initialization
const app = express();
const port = process.env.PORT || 3000;

// DB Connection
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('Successfully connected to MongoDB Atlas!'))
    .catch(error => console.error('Error connecting to MongoDB Atlas:', error));

// Middleware
app.use(cors());
app.use(express.json());

// API Routes (these must come BEFORE static file serving)
app.use('/game', gameRouter);
app.use('/player', playerRouter);
app.use('/user', userRouter);

// Serve static files from the frontend directory
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// Serve index.html for all other routes (SPA fallback)
app.use((req, res) => {
    res.sendFile(path.join(__dirname, '..', 'frontend', 'index.html'));
});

// Begin Listening
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
    console.log(`Visit http://localhost:${port} to view the website`);
});

// Export App
module.exports = app;