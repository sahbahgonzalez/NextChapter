const jwt = require('jsonwebtoken');
const User = require('../tables/user/model');

/**
 * Middleware to verify JWT token and attach user to request object.
 * Protects routes that require authentication.
 */
const protect = async (req, res, next) => {
    let token;

    // Check if token exists in the Authorization header (Bearer token)
    if (
        req.headers.authorization &&
        req.headers.authorization.startsWith('Bearer')
    ) {
        try {
            // Get token from header (Bearer Token)
            token = req.headers.authorization.split(' ')[1];

            // Verify the token using the secret key in environment (loaded by app.js)
            const decoded = jwt.verify(token, process.env.JWT_SECRET);

            // Fetch the user associated with the token
            // This ensures the user still exists
            req.user = await User.findById(decoded.userId).select('-hashed_password');

            if (!req.user) {
                return res.status(401).json({ message: 'Not authorized, user not found' });
            }

            next(); // If token is valid and user exists, proceed to the next middleware/route handler
        } catch (error) {
            console.error('Token verification failed:', error);
            return res.status(401).json({ message: 'Not authorized, token failed' });
        }
    }

    // If no token is found in the header
    if (!token) {
        return res.status(401).json({ message: 'Not authorized, no token' });
    }
};

/**
 * Middleware to restrict access to specific roles (e.g., 'admin').
 * Should be used AFTER the 'protect' middleware.
 */
const restrictTo = (...roles) => {
    return (req, res, next) => {
        // req.user should be populated by the 'protect' middleware
        if (!req.user || !roles.includes(req.user.role)) {
            return res.status(403).json({ message: 'Forbidden: You do not have permission to perform this action' });
        }
        // If user has the required role, proceed
        next();
    };
};


module.exports = { protect, restrictTo };