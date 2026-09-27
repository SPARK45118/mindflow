// =========================================================
// MINDFLOW EXPRESS SERVER (NoSQL / MONGODB ATLAS BACKEND)
// Node.js + Express + Mongoose (MongoDB NoSQL)
// Serving Static Frontend, REST APIs & Live Admin Database Viewer
// =========================================================

require('dotenv').config();
const express = require('express');
const path = require('path');
const db = require('./db.js');

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize NoSQL Database (MongoDB Atlas with fallback)
db.initDb();

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// -------------------------------------------------------------
// AUTHENTICATION: LOGIN OR REGISTER
// -------------------------------------------------------------
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, avatar, pin } = req.body;
    if (!username || !username.trim()) {
      return res.status(400).json({ error: 'Username is required' });
    }
    const result = await db.loginOrCreateUser({ username, avatar, pin });
    return res.json(result);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// USER PROFILE: LEETCODE STYLE WITH COGNITIVE RADAR & STATS
// -------------------------------------------------------------
app.get('/api/profile/:username', async (req, res) => {
  try {
    const { username } = req.params;
    const profile = await db.getUserProfile(username);
    if (!profile) {
      return res.status(404).json({ error: 'Player profile not found' });
    }
    return res.json(profile);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// RECORD GAMEPLAY SESSION & PROGRESSION
// -------------------------------------------------------------
app.post('/api/sessions/record', async (req, res) => {
  try {
    const { userId, gameMode, score, accuracy, reactionMs, durationSeconds } = req.body;
    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }
    const updatedProfile = await db.recordSession(userId, {
      gameMode: gameMode || 'mot',
      score: score || 0,
      accuracy: accuracy || 100,
      reactionMs: reactionMs || 1500,
      durationSeconds: durationSeconds || 60
    });
    return res.json(updatedProfile);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// GLOBAL COMPETITIVE LEADERBOARD
// -------------------------------------------------------------
app.get('/api/leaderboard', async (req, res) => {
  try {
    const leaderboard = await db.getLeaderboard();
    return res.json({ leaderboard });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// ADMIN DATABASE VIEWER (See All Logins & Players in Real Time)
// -------------------------------------------------------------
app.get('/api/admin/users', async (req, res) => {
  try {
    const data = await db.getAllPlayersForAdmin();
    return res.json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Live Web Page to Inspect Database Players & Logins in Browser
app.get('/admin', async (req, res) => {
  try {
    const data = await db.getAllPlayersForAdmin();
    const rowsHtml = data.users.map(u => `
      <tr style="border-bottom: 1px solid #e7e5e4;">
        <td style="padding: 10px 14px; font-weight: 700;">${u.avatar} ${u.username}</td>
        <td style="padding: 10px 14px; font-family: monospace; color: #78716c;">${u.raw_pin ? u.raw_pin : '<em style="color:#a8a29e;">(None)</em>'}</td>
        <td style="padding: 10px 14px; color: #047857; font-weight: 700;">${u.focus_index} FI</td>
        <td style="padding: 10px 14px;">${u.streak} Days 🔥</td>
        <td style="padding: 10px 14px;">${u.total_minutes} min (${u.total_sessions} sess)</td>
        <td style="padding: 10px 14px;"><span style="background: #f5f5f4; border: 1px solid #d6d3d1; padding: 2px 8px; border-radius: 6px; font-size: 11px;">${u.tier}</span></td>
        <td style="padding: 10px 14px; font-size: 12px; color: #57534e;">${new Date(u.last_active).toLocaleString()}</td>
      </tr>
    `).join('');

    const html = `<!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>MindFlow • NoSQL Database Admin Viewer</title>
      <link href="https://fonts.googleapis.com/css2?family=Fredoka:wght@600;700&family=Quicksand:wght@500;600;700&display=swap" rel="stylesheet">
      <style>
        body { font-family: 'Quicksand', sans-serif; background: #FAF7F2; color: #292524; margin: 0; padding: 32px; }
        .admin-card { max-width: 1060px; margin: 0 auto; background: #ffffff; border-radius: 20px; border: 2px solid #E7E5E4; box-shadow: 0 10px 30px rgba(0,0,0,0.06); padding: 28px; }
        h1 { font-family: 'Fredoka', cursive; font-size: 26px; color: #1c1917; margin: 0 0 6px 0; }
        .meta-strip { display: flex; gap: 16px; margin: 12px 0 24px 0; font-size: 13px; font-weight: 600; }
        .pill { background: #ECFDF5; color: #065F46; border: 1px solid #A7F3D0; padding: 4px 12px; border-radius: 12px; }
        table { width: 100%; border-collapse: collapse; text-align: left; font-size: 13px; }
        th { background: #FAF7F2; padding: 12px 14px; font-family: 'Fredoka', cursive; font-weight: 700; color: #44403C; border-bottom: 2px solid #E7E5E4; }
        .btn-refresh { background: #047857; color: white; border: none; padding: 8px 16px; border-radius: 10px; font-weight: 700; cursor: pointer; text-decoration: none; font-size: 13px; }
        .btn-home { background: #f5f5f4; color: #292524; border: 1px solid #d6d3d1; padding: 8px 16px; border-radius: 10px; font-weight: 600; text-decoration: none; font-size: 13px; margin-left: 8px; }
      </style>
    </head>
    <body>
      <div class="admin-card">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <div>
            <h1>🍃 MindFlow NoSQL Player Database</h1>
            <div class="meta-strip">
              <span class="pill">Database Source: <strong>${data.source}</strong></span>
              <span class="pill">Total Players Registered: <strong>${data.total}</strong></span>
            </div>
          </div>
          <div>
            <a href="/admin" class="btn-refresh">↻ Refresh</a>
            <a href="/" class="btn-home">&larr; Back to App</a>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Player / Username</th>
              <th>PIN (Password)</th>
              <th>Focus Index</th>
              <th>Streak</th>
              <th>Practice Time</th>
              <th>Rank Tier</th>
              <th>Last Active / Login</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
      </div>
    </body>
    </html>`;

    return res.send(html);
  } catch (err) {
    return res.status(500).send('Admin error: ' + err.message);
  }
});

// Fallback to index.html for SPA screens
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`[MindFlow Server] 🍃 Focus Sanctuary (NoSQL) running on http://localhost:${PORT}`);
  console.log(`[MindFlow Server] 📊 Live Database Admin view available at http://localhost:${PORT}/admin`);
});
