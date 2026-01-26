const bcrypt = require('bcryptjs');

/**
 * PasswordHasher
 * Simple OOP wrapper around bcrypt for hashing and verifying passwords.
 * Usage:
 *   const hasher = require('./hashPassword');
 *   const hash = await hasher.hash('plainPassword');
 *   const ok = await hasher.compare('plainPassword', hash);
 */
class PasswordHasher {
    static async hash(plainText) {
        if (typeof plainText !== 'string') throw new TypeError('Password must be a string');
        const saltRounds = 10;
        return await bcrypt.hash(plainText, saltRounds);
    }

    static async compare(plainText, hashed) {
        if (typeof plainText !== 'string' || typeof hashed !== 'string') return false;
        return await bcrypt.compare(plainText, hashed);
    }
}

module.exports = PasswordHasher;