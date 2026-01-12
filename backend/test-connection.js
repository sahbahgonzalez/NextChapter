require('dotenv').config();
const mongoose = require('mongoose');

console.log('Testing MongoDB connection...');
console.log('Connection string:', process.env.MONGODB_URI.replace(/:[^:@]+@/, ':****@'));

mongoose.connect(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: 5000
})
.then(() => {
    console.log('✅ Successfully connected to MongoDB Atlas!');
    process.exit(0);
})
.catch(error => {
    console.error('❌ Connection failed:', error.message);
    console.error('\nPossible causes:');
    console.error('1. Cluster is PAUSED - Resume it in MongoDB Atlas');
    console.error('2. Wrong database password');
    console.error('3. IP whitelist not properly configured');
    process.exit(1);
});

setTimeout(() => {
    console.log('⏱️ Connection timeout - cluster may be paused');
    process.exit(1);
}, 6000);
