#!/usr/bin/env node
require('dotenv').config();
const mongoose = require('mongoose');
const Player = require('../tables/player/model');

async function migrate() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI is not set in environment. Aborting.');
    process.exit(1);
  }

  await mongoose.connect(uri, { keepAlive: true });
  console.log('Connected to MongoDB for migration');

  const players = await Player.find({}).lean();
  console.log(`Found ${players.length} player documents`);

  let updated = 0;

  for (const p of players) {
    const setObj = {};
    const unsetObj = {};

    // Normalize / trim name
    if (p.name !== undefined && p.name !== null) {
      const n = String(p.name).trim();
      if (n.length === 0) unsetObj.name = '';
      else if (n !== p.name) setObj.name = n;
    }

    // Normalize / trim instagram_handle
    if (p.instagram_handle !== undefined && p.instagram_handle !== null) {
      const ig = String(p.instagram_handle).trim();
      if (ig.length === 0) unsetObj.instagram_handle = '';
      else if (ig !== p.instagram_handle) setObj.instagram_handle = ig;
    }

    // Move `position` -> `hometown` if hometown missing
    if ((p.hometown === undefined || p.hometown === null || String(p.hometown).trim().length === 0) && (p.position !== undefined && p.position !== null)) {
      const pos = String(p.position).trim();
      if (pos.length > 0) setObj.hometown = pos;
    }

    // Normalize / trim hometown
    if (p.hometown !== undefined && p.hometown !== null) {
      const h = String(p.hometown).trim();
      if (h.length === 0) unsetObj.hometown = '';
      else if (h !== p.hometown) setObj.hometown = h;
    }

    // Remove legacy `position` field if present
    if (p.position !== undefined) unsetObj.position = '';

    // Apply update if necessary
    if (Object.keys(setObj).length > 0 || Object.keys(unsetObj).length > 0) {
      const update = {};
      if (Object.keys(setObj).length) update.$set = setObj;
      if (Object.keys(unsetObj).length) update.$unset = unsetObj;
      await Player.updateOne({ _id: p._id }, update);
      updated++;
    }
  }

  console.log(`Migration complete. Processed ${players.length}, updated ${updated} documents.`);
  await mongoose.disconnect();
}

migrate().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
