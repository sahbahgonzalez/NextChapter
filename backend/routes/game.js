const express = require('express');
const controller = require('../tables/game/controller');
const { protect, restrictTo } = require('../middleware/auth');

const router = express.Router();

// -- Admin Functions ---
router.post('/', protect, restrictTo('admin'), controller.createGame);
router.patch('/:id', protect, restrictTo('admin'), controller.updateGame);
router.post('/:id/event', protect, restrictTo('admin'), controller.addGameEvent);
router.patch('/:id/finish', protect, restrictTo('admin'), controller.finalizeGame);
router.patch('/:id/cancel', protect, restrictTo('admin'), controller.cancelGame);

// --- Public Data Retrieval ---
router.get('/:id', controller.getGameById);

module.exports = router;