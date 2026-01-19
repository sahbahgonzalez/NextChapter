const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('./model');

/**
 * UserController
 * Encapsulates user-related operations (login, registration, etc.)
 * Methods are instance methods so they can be extended or mocked in tests.
 */
class UserController {
    async login(req, res) {
        const { email, password } = req.body;

        try {
            if (!email || !password) {
                return res.status(400).json({ message: 'Email and password are required' });
            }

            const user = await User.findOne({ email: email.toLowerCase() });
            if (!user) {
                return res.status(401).json({ message: 'Invalid Email' });
            }

            const isMatch = await bcrypt.compare(password, user.hashed_password);
            if (!isMatch) {
                return res.status(401).json({ message: 'Invalid credentials' });
            }

            const payload = { userId: user._id, role: user.role };
            const secret = process.env.JWT_SECRET;
            if (!secret) {
                console.error('FATAL ERROR: JWT_SECRET is not defined in .env file');
                return res.status(500).json({ message: 'Server configuration error, cannot issue token' });
            }

            const token = jwt.sign(payload, secret, { expiresIn: '90d' });

            return res.status(200).json({
                message: 'Login successful',
                token,
                user: { id: user._id, email: user.email, role: user.role }
            });
        } catch (error) {
            console.error('Login Error:', error);
            return res.status(500).json({ message: 'Server error during login' });
        }
    }
}

module.exports = new UserController();