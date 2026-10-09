// =========================================================
// MINDFLOW EXPRESS SERVER (NoSQL / MONGODB ATLAS BACKEND)
// Node.js + Express + Mongoose (MongoDB NoSQL)
// Serving Static Frontend, REST APIs & Live Admin Database Viewer
// =========================================================

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const db = require('./db.js');

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize NoSQL Database (MongoDB Atlas with fallback)
db.initDb();

// Middleware: Enable CORS for cross-origin frontend requests
app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve client static files if running together locally
const clientDir = path.join(__dirname, '../client');
if (fs.existsSync(clientDir)) {
  app.use(express.static(clientDir));
} else {
  app.use(express.static(path.join(__dirname, '..')));
}

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
// ADMIN SECURITY & DATABASE VIEWER (Protected by Master Password)
// -------------------------------------------------------------
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'mindflow@admin123';

function checkAdminAuth(req) {
  const adminSecret = process.env.ADMIN_PASSWORD || 'mindflow@admin123';

  // 1. Check Cookie
  const rawCookie = req.headers.cookie || '';
  const cookies = Object.fromEntries(
    rawCookie.split(';').map(c => {
      const [k, ...v] = c.trim().split('=');
      return [k, decodeURIComponent(v.join('='))];
    }).filter(([k]) => Boolean(k))
  );

  const expectedToken = Buffer.from(`admin:${adminSecret}`).toString('base64');
  if (cookies['mindflow_admin_auth'] === expectedToken) {
    return true;
  }

  // 2. Check query parameter ?key=
  if (req.query.key && req.query.key === adminSecret) {
    return true;
  }

  // 3. Check custom header x-admin-key
  if (req.headers['x-admin-key'] && req.headers['x-admin-key'] === adminSecret) {
    return true;
  }

  // 4. Check Authorization Bearer header
  if (req.headers.authorization) {
    const parts = req.headers.authorization.split(' ');
    if (parts.length === 2 && parts[1] === adminSecret) {
      return true;
    }
  }

  return false;
}

// Protected JSON API: Get All Users
app.get('/api/admin/users', async (req, res) => {
  if (!checkAdminAuth(req)) {
    return res.status(401).json({ error: 'Unauthorized: Admin Master Password required.' });
  }
  try {
    const data = await db.getAllPlayersForAdmin();
    return res.json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Protected JSON API: Delete User
app.delete('/api/admin/users/:id', async (req, res) => {
  if (!checkAdminAuth(req)) {
    return res.status(401).json({ error: 'Unauthorized: Admin Master Password required.' });
  }
  try {
    const success = await db.deleteUserById(req.params.id);
    return res.json({ success, message: success ? 'User deleted' : 'User not found' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Protected JSON API: Custom User Action (delete, clear_pin, reset_stats)
app.post('/api/admin/users/:id/action', async (req, res) => {
  if (!checkAdminAuth(req)) {
    return res.status(401).json({ error: 'Unauthorized: Admin Master Password required.' });
  }
  try {
    const { action } = req.body;
    const { id } = req.params;
    let success = false;

    if (action === 'delete') {
      success = await db.deleteUserById(id);
    } else if (action === 'clear_pin') {
      success = await db.clearUserPin(id);
    } else if (action === 'reset_stats') {
      success = await db.resetUserData(id);
    } else {
      return res.status(400).json({ error: 'Invalid action type' });
    }

    return res.json({ success, action });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Admin Login Form POST
app.post('/admin/login', (req, res) => {
  const adminSecret = process.env.ADMIN_PASSWORD || 'mindflow@admin123';
  const inputPass = req.body && req.body.password;

  if (inputPass && inputPass === adminSecret) {
    const token = Buffer.from(`admin:${adminSecret}`).toString('base64');
    res.setHeader('Set-Cookie', `mindflow_admin_auth=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400`);
    return res.redirect('/admin');
  } else {
    return res.redirect('/admin?error=1');
  }
});

// Admin Form POST Action (Delete / Clear PIN / Reset Stats from web UI)
app.post('/admin/action', async (req, res) => {
  if (!checkAdminAuth(req)) {
    return res.redirect('/admin');
  }

  const { userId, actionType } = req.body;
  if (!userId) return res.redirect('/admin');

  try {
    if (actionType === 'delete') {
      await db.deleteUserById(userId);
      return res.redirect('/admin?msg=deleted');
    } else if (actionType === 'clear_pin') {
      await db.clearUserPin(userId);
      return res.redirect('/admin?msg=pin_cleared');
    } else if (actionType === 'reset_stats') {
      await db.resetUserData(userId);
      return res.redirect('/admin?msg=stats_reset');
    }
  } catch (err) {
    return res.redirect(`/admin?error=${encodeURIComponent(err.message)}`);
  }

  return res.redirect('/admin');
});

// Admin Logout
app.get('/admin/logout', (req, res) => {
  res.setHeader('Set-Cookie', 'mindflow_admin_auth=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax');
  return res.redirect('/admin');
});

// Live Web Page to Inspect & Manage Database (Password Gated)
app.get('/admin', async (req, res) => {
  // If not authenticated, show password prompt
  if (!checkAdminAuth(req)) {
    const hasError = req.query.error === '1';
    const loginHtml = `<!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>MindFlow Admin • Restricted Access</title>
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <link href="https://fonts.googleapis.com/css2?family=Fredoka:wght@600;700&family=Quicksand:wght@500;600;700&display=swap" rel="stylesheet">
      <style>
        * { box-sizing: border-box; }
        body { font-family: 'Quicksand', sans-serif; background: #FAF7F2; color: #292524; min-height: 100vh; display: flex; align-items: center; justify-content: center; margin: 0; padding: 20px; }
        .login-card { background: #ffffff; border-radius: 24px; border: 2px solid #E7E5E4; box-shadow: 0 16px 40px rgba(0,0,0,0.06); padding: 36px; width: 100%; max-width: 420px; text-align: center; }
        .icon { font-size: 48px; margin-bottom: 12px; }
        h1 { font-family: 'Fredoka', cursive; font-size: 26px; color: #1c1917; margin: 0 0 8px 0; }
        p { color: #78716c; font-size: 14px; margin: 0 0 24px 0; font-weight: 500; line-height: 1.5; }
        .error-badge { background: #FEF2F2; color: #DC2626; border: 1px solid #FECACA; padding: 10px 14px; border-radius: 12px; font-size: 13px; font-weight: 600; margin-bottom: 20px; }
        .form-group { text-align: left; margin-bottom: 20px; }
        label { display: block; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #44403C; margin-bottom: 8px; }
        input[type="password"] { width: 100%; padding: 14px 16px; border: 2px solid #E7E5E4; border-radius: 14px; font-size: 15px; font-family: inherit; outline: none; transition: all 0.2s; }
        input[type="password"]:focus { border-color: #047857; box-shadow: 0 0 0 4px rgba(4, 120, 87, 0.1); }
        .btn-submit { width: 100%; background: #047857; color: white; border: none; padding: 14px; border-radius: 14px; font-family: 'Fredoka', cursive; font-size: 16px; font-weight: 600; cursor: pointer; transition: all 0.2s; box-shadow: 0 4px 12px rgba(4, 120, 87, 0.2); }
        .btn-submit:hover { background: #065F46; transform: translateY(-1px); }
        .back-link { display: inline-block; margin-top: 20px; color: #78716c; font-size: 13px; font-weight: 600; text-decoration: none; }
        .back-link:hover { color: #1c1917; }
      </style>
    </head>
    <body>
      <div class="login-card">
        <div class="icon">🔐</div>
        <h1>Admin Database Access</h1>
        <p>This portal is restricted. Please enter the master admin password to inspect & manage player records.</p>
        ${hasError ? '<div class="error-badge">⚠️ Incorrect master password. Please try again.</div>' : ''}
        <form method="POST" action="/admin/login">
          <div class="form-group">
            <label for="password">Master Admin Password</label>
            <input type="password" id="password" name="password" placeholder="Enter admin password..." required autofocus>
          </div>
          <button type="submit" class="btn-submit">Unlock Admin Panel</button>
        </form>
        <a href="/" class="back-link">&larr; Return to MindFlow</a>
      </div>
    </body>
    </html>`;
    return res.send(loginHtml);
  }

  // Authenticated Admin Dashboard
  try {
    const data = await db.getAllPlayersForAdmin();

    let msgBanner = '';
    if (req.query.msg === 'deleted') {
      msgBanner = '<div class="banner banner-success">🗑️ Player account and all associated data permanently deleted.</div>';
    } else if (req.query.msg === 'pin_cleared') {
      msgBanner = '<div class="banner banner-success">🔑 Player PIN / password cleared. User can now sign in freely without PIN.</div>';
    } else if (req.query.msg === 'stats_reset') {
      msgBanner = '<div class="banner banner-success">🔄 Player stats (minutes, sessions, streaks) reset to initial state.</div>';
    }

    const rowsHtml = data.users.length > 0 ? data.users.map(u => `
      <tr style="border-bottom: 1px solid #e7e5e4;">
        <td style="padding: 10px 14px; font-weight: 700;">${u.avatar} ${u.username}</td>
        <td style="padding: 10px 14px; font-family: monospace; color: #78716c;">${u.raw_pin ? u.raw_pin : '<em style="color:#a8a29e;">(None)</em>'}</td>
        <td style="padding: 10px 14px; color: #047857; font-weight: 700;">${u.focus_index} FI</td>
        <td style="padding: 10px 14px;">${u.streak} Days 🔥</td>
        <td style="padding: 10px 14px;">${u.total_minutes} min (${u.total_sessions} sess)</td>
        <td style="padding: 10px 14px;"><span style="background: #f5f5f4; border: 1px solid #d6d3d1; padding: 2px 8px; border-radius: 6px; font-size: 11px;">${u.tier}</span></td>
        <td style="padding: 10px 14px; font-size: 12px; color: #57534e;">${new Date(u.last_active).toLocaleString()}</td>
        <td style="padding: 10px 14px; white-space: nowrap;">
          <form method="POST" action="/admin/action" style="display:inline;" onsubmit="return confirm('Permanently delete player \\'${u.username}\\'? This removes all account and login data.');">
            <input type="hidden" name="userId" value="${u.id}">
            <input type="hidden" name="actionType" value="delete">
            <button type="submit" class="btn-del" title="Permanently delete user">🗑️ Delete</button>
          </form>
          <form method="POST" action="/admin/action" style="display:inline; margin-left: 4px;" onsubmit="return confirm('Clear PIN password for \\'${u.username}\\'?');">
            <input type="hidden" name="userId" value="${u.id}">
            <input type="hidden" name="actionType" value="clear_pin">
            <button type="submit" class="btn-pin" title="Clear PIN password">🔑 Clear PIN</button>
          </form>
          <form method="POST" action="/admin/action" style="display:inline; margin-left: 4px;" onsubmit="return confirm('Reset practice minutes, streaks, and sessions for \\'${u.username}\\'?');">
            <input type="hidden" name="userId" value="${u.id}">
            <input type="hidden" name="actionType" value="reset_stats">
            <button type="submit" class="btn-rst" title="Reset stats to zero">🔄 Reset Stats</button>
          </form>
        </td>
      </tr>
    `).join('') : `
      <tr>
        <td colspan="8" style="text-align: center; padding: 36px; color: #78716c; font-weight: 500;">
          No registered players found in database.
        </td>
      </tr>
    `;

    const html = `<!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>MindFlow • NoSQL Database Admin Viewer</title>
      <link href="https://fonts.googleapis.com/css2?family=Fredoka:wght@600;700&family=Quicksand:wght@500;600;700&display=swap" rel="stylesheet">
      <style>
        * { box-sizing: border-box; }
        body { font-family: 'Quicksand', sans-serif; background: #FAF7F2; color: #292524; margin: 0; padding: 32px; }
        .admin-card { max-width: 1180px; margin: 0 auto; background: #ffffff; border-radius: 20px; border: 2px solid #E7E5E4; box-shadow: 0 10px 30px rgba(0,0,0,0.06); padding: 28px; }
        h1 { font-family: 'Fredoka', cursive; font-size: 26px; color: #1c1917; margin: 0 0 6px 0; }
        .meta-strip { display: flex; gap: 16px; margin: 12px 0 20px 0; font-size: 13px; font-weight: 600; }
        .pill { background: #ECFDF5; color: #065F46; border: 1px solid #A7F3D0; padding: 4px 12px; border-radius: 12px; }
        .banner { padding: 12px 18px; border-radius: 12px; font-size: 13px; font-weight: 700; margin-bottom: 20px; }
        .banner-success { background: #ECFDF5; color: #047857; border: 1px solid #A7F3D0; }
        table { width: 100%; border-collapse: collapse; text-align: left; font-size: 13px; }
        th { background: #FAF7F2; padding: 12px 14px; font-family: 'Fredoka', cursive; font-weight: 700; color: #44403C; border-bottom: 2px solid #E7E5E4; }
        .btn-refresh { background: #047857; color: white; border: none; padding: 8px 16px; border-radius: 10px; font-weight: 700; cursor: pointer; text-decoration: none; font-size: 13px; display: inline-flex; align-items: center; }
        .btn-logout { background: #FEE2E2; color: #B91C1C; border: 1px solid #FCA5A5; padding: 8px 16px; border-radius: 10px; font-weight: 700; text-decoration: none; font-size: 13px; margin-left: 8px; }
        .btn-home { background: #f5f5f4; color: #292524; border: 1px solid #d6d3d1; padding: 8px 16px; border-radius: 10px; font-weight: 600; text-decoration: none; font-size: 13px; margin-left: 8px; }
        .btn-del { background: #FEE2E2; color: #DC2626; border: 1px solid #FECACA; padding: 5px 10px; border-radius: 8px; font-weight: 700; cursor: pointer; font-size: 11px; transition: all 0.15s; }
        .btn-del:hover { background: #DC2626; color: white; }
        .btn-pin { background: #FEF3C7; color: #D97706; border: 1px solid #FDE68A; padding: 5px 10px; border-radius: 8px; font-weight: 700; cursor: pointer; font-size: 11px; transition: all 0.15s; }
        .btn-pin:hover { background: #D97706; color: white; }
        .btn-rst { background: #E0F2FE; color: #0284C7; border: 1px solid #BAE6FD; padding: 5px 10px; border-radius: 8px; font-weight: 700; cursor: pointer; font-size: 11px; transition: all 0.15s; }
        .btn-rst:hover { background: #0284C7; color: white; }
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
              <span class="pill" style="background:#EFF6FF; color:#1D4ED8; border-color:#BFDBFE;">🔐 Authenticated</span>
            </div>
          </div>
          <div>
            <a href="/admin" class="btn-refresh">↻ Refresh</a>
            <a href="/admin/logout" class="btn-logout">🚪 Log Out</a>
            <a href="/" class="btn-home">&larr; Back to App</a>
          </div>
        </div>

        ${msgBanner}

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
              <th>Actions</th>
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

// Fallback for SPA screens when served locally
app.use((req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/admin')) return next();
  const clientIndex = path.join(__dirname, '../client/index.html');
  if (fs.existsSync(clientIndex)) {
    return res.sendFile(clientIndex);
  }
  const rootIndex = path.join(__dirname, '../index.html');
  if (fs.existsSync(rootIndex)) {
    return res.sendFile(rootIndex);
  }
  return res.json({ status: 'MindFlow API Server Active' });
});

if (process.env.NODE_ENV !== 'test' && !process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`[MindFlow Server] 🍃 Focus Sanctuary (NoSQL) running on http://localhost:${PORT}`);
    console.log(`[MindFlow Server] 📊 Live Database Admin view available at http://localhost:${PORT}/admin`);
  });
}

module.exports = app;
