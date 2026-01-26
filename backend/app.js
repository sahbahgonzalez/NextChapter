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
mongoose.connect(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: 30000,
    socketTimeoutMS: 45000,
    dbName: 'nextChapterDb'
})
mongoose.connect(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: 30000,
    socketTimeoutMS: 45000,
    dbName: 'nextChapterDb'
})
    .then(() => console.log('Successfully connected to MongoDB Atlas!'))
    .catch(error => console.error('Error connecting to MongoDB Atlas:', error));

// Middleware
app.use(cors());
app.use(express.json());

// API Routes (these must come BEFORE static file serving)
// API Routes (these must come BEFORE static file serving)
app.use('/game', gameRouter);
app.use('/player', playerRouter);
app.use('/user', userRouter);

// Serve static files from the frontend directory
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// Serve index.html for root path
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'frontend', 'index.html'));
});

// Fallback: serve index.html for SPA routes (only for non-API paths)
app.use((req, res, next) => {
    // If request doesn't match static files, API routes, and is not a static file extension, serve index.html
    if (!req.path.startsWith('/game') && !req.path.startsWith('/player') && !req.path.startsWith('/user') && 
        !req.path.match(/\.(js|css|png|jpg|jpeg|gif|svg|ico|json|woff|woff2|ttf|eot)$/)) {
        return res.sendFile(path.join(__dirname, '..', 'frontend', 'index.html'));
    }
    next();
});

// 404 Handler
app.use((req, res) => {
    res.status(404).json({ error: 'Endpoint not found' });
});

// Global Error Handler (must be last)
app.use((err, req, res, next) => {
    const statusCode = err.statusCode || 500;
    const message = err.message || 'Internal Server Error';
    
    console.error('Unhandled Error:', {
        statusCode,
        message,
        stack: err.stack,
        path: req.path,
        method: req.method
    });

    res.status(statusCode).json({
        error: message,
        status: statusCode,
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
});

// Serve static files from the frontend directory
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// Serve index.html for root path
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'frontend', 'index.html'));
});

// Fallback: serve index.html for SPA routes (only for non-API paths)
app.use((req, res, next) => {
    // If request doesn't match static files and is not an API, serve index.html
    if (!req.path.match(/\.(js|css|png|jpg|jpeg|gif|svg|ico|json)$/)) {
        return res.sendFile(path.join(__dirname, '..', 'frontend', 'index.html'));
    }
    next();
});

// Begin Listening
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
    console.log(`Visit http://localhost:${port} to view the website`);
    console.log(`Server running on port ${port}`);
    console.log(`Visit http://localhost:${port} to view the website`);
});

// Export App
module.exports = app;