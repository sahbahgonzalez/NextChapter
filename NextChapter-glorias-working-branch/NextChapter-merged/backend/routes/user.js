const express = require('express');
const controller = require('../tables/user/controller');

const router = express.Router();

// -- Admin Functions ---
router.post('/login', controller.login);
// May add signout idk yet

module.exports = router;