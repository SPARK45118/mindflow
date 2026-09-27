// =========================================================
// MINDFLOW NOSQL DATABASE LAYER (MONGODB ATLAS + MONGOOSE)
// Document-Based Storage for Players, Logins, Sessions,
// Cognitive Radar, LeetCode Heatmaps & Global Leaderboards
// =========================================================

require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

// Local fallback JSON path when offline or MONGODB_URI not yet configured
const LOCAL_STORE_PATH = path.join(__dirname, 'mindflow-nosql.json');

let isConnectedToMongo = false;
let localDb = { users: [] };

// -------------------------------------------------------------
// MONGOOSE SCHEMA DEFINITIONS
// -------------------------------------------------------------
const UserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, index: true, trim: true },
  displayName: { type: String, default: '' },
  avatar: { type: String, default: '🧠' },
  pin: { type: String, default: '' },
  focusIndex: { type: Number, default: 68 },
  streak: { type: Number, default: 1 },
  maxStreak: { type: Number, default: 1 },
  totalMinutes: { type: Number, default: 0 },
  totalSessions: { type: Number, default: 0 },
  tier: { type: String, default: 'Bronze Anchor' },
  level: { type: Number, default: 1 },
  cognitiveScores: {
    workingMemory: { type: Number, default: 60 },
    inhibitoryControl: { type: Number, default: 65 },
    spatialAttention: { type: Number, default: 62 },
    rhythmicPrecision: { type: Number, default: 58 },
    reactionSpeed: { type: Number, default: 64 },
    updatedAt: { type: Date, default: Date.now }
  },
  badges: [{
    badgeKey: String,
    title: String,
    description: String,
    icon: String,
    unlockedAt: { type: Date, default: Date.now }
  }],
  activityDays: [{
    dateStr: String, // YYYY-MM-DD
    minutes: { type: Number, default: 0 },
    sessionsCount: { type: Number, default: 1 }
  }],
  sessions: [{
    gameMode: String,
    score: Number,
    accuracy: Number,
    reactionMs: Number,
    durationSeconds: Number,
    createdAt: { type: Date, default: Date.now }
  }],
  lastActive: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now }
});

const UserModel = mongoose.models.User || mongoose.model('User', UserSchema);

// -------------------------------------------------------------
// DATABASE INITIALIZATION (MONGODB ATLAS WITH SEAMLESS FALLBACK)
// -------------------------------------------------------------
async function initDb() {
  const mongoUri = process.env.MONGODB_URI;

  if (mongoUri && mongoUri.trim()) {
    try {
      console.log('[MindFlow NoSQL] Connecting to MongoDB Atlas...');
      await mongoose.connect(mongoUri, {
        serverSelectionTimeoutMS: 8000
      });
      isConnectedToMongo = true;
      console.log('[MindFlow NoSQL] 🍃 Connected successfully to MongoDB Atlas!');
      await seedGlobalChampions();
      return;
    } catch (err) {
      console.warn('[MindFlow NoSQL] ⚠️ MongoDB Atlas connection failed:', err.message);
      console.log('[MindFlow NoSQL] Falling back to local NoSQL JSON document store.');
    }
  } else {
    console.log('[MindFlow NoSQL] No MONGODB_URI found in environment. Using local NoSQL JSON document store (mindflow-nosql.json).');
  }

  // Fallback to local JSON document store
  loadLocalDb();
  seedLocalChampions();
}

function loadLocalDb() {
  try {
    if (fs.existsSync(LOCAL_STORE_PATH)) {
      const raw = fs.readFileSync(LOCAL_STORE_PATH, 'utf8');
      localDb = JSON.parse(raw);
      if (!Array.isArray(localDb.users)) localDb.users = [];
    } else {
      localDb = { users: [] };
      saveLocalDb();
    }
  } catch (err) {
    console.warn('[MindFlow NoSQL] Error reading local JSON store:', err.message);
    localDb = { users: [] };
  }
}

function saveLocalDb() {
  try {
    fs.writeFileSync(LOCAL_STORE_PATH, JSON.stringify(localDb, null, 2), 'utf8');
  } catch (err) {
    console.error('[MindFlow NoSQL] Failed to save local store:', err.message);
  }
}

// -------------------------------------------------------------
// SEED INITIAL COMPETITIVE CHAMPIONS
// -------------------------------------------------------------
const CHAMPIONS_DATA = [
  { username: 'ZenMaster_Li', displayName: 'Li Chen (Zen Master)', avatar: '🧘', focus: 97, streak: 34, mins: 420, sessions: 98, tier: 'Grandmaster Zen', wm: 95, ic: 98, sa: 96, rp: 99, rs: 94 },
  { username: 'KiraFlow', displayName: 'Kira Vance', avatar: '⚡', focus: 93, streak: 21, mins: 310, sessions: 76, tier: 'Diamond Flow', wm: 92, ic: 95, sa: 94, rp: 90, rs: 96 },
  { username: 'NeuralNinja', displayName: 'Aiden Sparks', avatar: '🦊', focus: 89, streak: 15, mins: 245, sessions: 54, tier: 'Emerald Mind', wm: 88, ic: 90, sa: 91, rp: 86, rs: 92 },
  { username: 'AstralAnchor', displayName: 'Seraphina Vale', avatar: '🔮', focus: 84, streak: 12, mins: 190, sessions: 42, tier: 'Gold Resonance', wm: 82, ic: 86, sa: 85, rp: 84, rs: 82 },
  { username: 'GazeSeeker', displayName: 'Marcus Brody', avatar: '🦉', focus: 79, streak: 8, mins: 140, sessions: 31, tier: 'Silver Focus', wm: 78, ic: 80, sa: 82, rp: 76, rs: 78 },
  { username: 'EchoMind', displayName: 'Elena Rostova', avatar: '🌸', focus: 74, streak: 6, mins: 95, sessions: 22, tier: 'Silver Focus', wm: 72, ic: 75, sa: 74, rp: 73, rs: 76 }
];

async function seedGlobalChampions() {
  try {
    const count = await UserModel.countDocuments();
    if (count > 0) return;

    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');

    for (const champ of CHAMPIONS_DATA) {
      const activities = [];
      for (let day = 1; day <= Math.min(26, today.getDate()); day++) {
        if ((day + champ.focus) % 3 !== 0) {
          activities.push({
            dateStr: `${year}-${month}-${String(day).padStart(2, '0')}`,
            minutes: 15 + ((day * 7) % 30),
            sessionsCount: 1 + (day % 3)
          });
        }
      }

      await UserModel.create({
        username: champ.username,
        displayName: champ.displayName,
        avatar: champ.avatar,
        focusIndex: champ.focus,
        streak: champ.streak,
        maxStreak: champ.streak + 5,
        totalMinutes: champ.mins,
        totalSessions: champ.sessions,
        tier: champ.tier,
        level: Math.floor(champ.mins / 30) + 1,
        cognitiveScores: {
          workingMemory: champ.wm,
          inhibitoryControl: champ.ic,
          spatialAttention: champ.sa,
          rhythmicPrecision: champ.rp,
          reactionSpeed: champ.rs
        },
        badges: [
          { badgeKey: 'first_spark', title: 'First Spark', description: 'Completed initial focus practice session.', icon: '🌱' },
          { badgeKey: 'zen_flow', title: 'Zen Master', description: 'Maintained a Focus Index of 85+.', icon: '🏆' },
          { badgeKey: 'streak_hero', title: 'Flame Keeper', description: 'Maintained a daily focus streak of 7+ days.', icon: '🔥' }
        ],
        activityDays: activities
      });
    }
    console.log('[MindFlow NoSQL] Seeded champions in MongoDB Atlas.');
  } catch (err) {
    console.warn('[MindFlow NoSQL] Seeding error:', err.message);
  }
}

function seedLocalChampions() {
  if (localDb.users.length > 0) return;

  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');

  CHAMPIONS_DATA.forEach((champ, idx) => {
    const activities = [];
    for (let day = 1; day <= Math.min(26, today.getDate()); day++) {
      if ((day + champ.focus) % 3 !== 0) {
        activities.push({
          dateStr: `${year}-${month}-${String(day).padStart(2, '0')}`,
          minutes: 15 + ((day * 7) % 30),
          sessionsCount: 1 + (day % 3)
        });
      }
    }

    localDb.users.push({
      _id: 'champ_' + (idx + 1),
      username: champ.username,
      displayName: champ.displayName,
      avatar: champ.avatar,
      pin: '',
      focusIndex: champ.focus,
      streak: champ.streak,
      maxStreak: champ.streak + 5,
      totalMinutes: champ.mins,
      totalSessions: champ.sessions,
      tier: champ.tier,
      level: Math.floor(champ.mins / 30) + 1,
      cognitiveScores: {
        workingMemory: champ.wm,
        inhibitoryControl: champ.ic,
        spatialAttention: champ.sa,
        rhythmicPrecision: champ.rp,
        reactionSpeed: champ.rs,
        updatedAt: new Date().toISOString()
      },
      badges: [
        { badgeKey: 'first_spark', title: 'First Spark', description: 'Completed initial focus practice session.', icon: '🌱', unlockedAt: new Date().toISOString() },
        { badgeKey: 'zen_flow', title: 'Zen Master', description: 'Maintained a Focus Index of 85+.', icon: '🏆', unlockedAt: new Date().toISOString() },
        { badgeKey: 'streak_hero', title: 'Flame Keeper', description: 'Maintained a daily focus streak of 7+ days.', icon: '🔥', unlockedAt: new Date().toISOString() }
      ],
      activityDays: activities,
      sessions: [],
      lastActive: new Date().toISOString(),
      createdAt: new Date().toISOString()
    });
  });

  saveLocalDb();
  console.log('[MindFlow NoSQL] Seeded champions in local NoSQL store.');
}

// -------------------------------------------------------------
// HELPER: FORMAT MONGO/LOCAL DOCUMENT FOR CLIENT COMPATIBILITY
// -------------------------------------------------------------
function formatUserOutput(doc) {
  if (!doc) return null;
  const raw = doc.toObject ? doc.toObject() : doc;

  const user = {
    id: raw._id ? raw._id.toString() : raw.id,
    username: raw.username,
    display_name: raw.displayName || raw.username,
    avatar: raw.avatar || '🧠',
    pin: raw.pin || '',
    focus_index: raw.focusIndex || 68,
    streak: raw.streak || 1,
    max_streak: raw.maxStreak || 1,
    total_minutes: raw.totalMinutes || 0,
    total_sessions: raw.totalSessions || 0,
    tier: raw.tier || 'Bronze Anchor',
    level: raw.level || 1,
    last_active: raw.lastActive,
    created_at: raw.createdAt
  };

  const scores = {
    working_memory: raw.cognitiveScores?.workingMemory || 50,
    inhibitory_control: raw.cognitiveScores?.inhibitoryControl || 50,
    spatial_attention: raw.cognitiveScores?.spatialAttention || 50,
    rhythmic_precision: raw.cognitiveScores?.rhythmicPrecision || 50,
    reaction_speed: raw.cognitiveScores?.reactionSpeed || 50
  };

  const activity = (raw.activityDays || []).map(a => ({
    date_str: a.dateStr,
    minutes: a.minutes,
    sessions_count: a.sessionsCount
  }));

  const badges = (raw.badges || []).map(b => ({
    badge_key: b.badgeKey,
    title: b.title,
    description: b.description,
    icon: b.icon,
    unlocked_at: b.unlockedAt
  }));

  const recentSessions = (raw.sessions || []).slice(-10).reverse().map(s => ({
    game_mode: s.gameMode,
    score: s.score,
    accuracy: s.accuracy,
    reaction_ms: s.reactionMs,
    duration_seconds: s.durationSeconds,
    created_at: s.createdAt
  }));

  return { user, scores, activity, badges, recentSessions };
}

// -------------------------------------------------------------
// USER AUTHENTICATION & LOGIN (NoSQL)
// -------------------------------------------------------------
async function loginOrCreateUser({ username, avatar = '🧠', pin = '' }) {
  const cleanName = (username || '').trim();
  if (!cleanName) throw new Error('Username is required');

  if (isConnectedToMongo) {
    let userDoc = await UserModel.findOne({ username: new RegExp(`^${cleanName}$`, 'i') });

    if (userDoc) {
      if (userDoc.pin && pin && userDoc.pin !== pin) {
        throw new Error('Incorrect PIN for this username.');
      }
      if (avatar && avatar !== userDoc.avatar) {
        userDoc.avatar = avatar;
      }
      userDoc.lastActive = new Date();
      await userDoc.save();
    } else {
      userDoc = await UserModel.create({
        username: cleanName,
        displayName: cleanName,
        avatar: avatar || '🧠',
        pin: pin || '',
        focusIndex: 68,
        streak: 1,
        maxStreak: 1,
        totalMinutes: 0,
        totalSessions: 0,
        tier: 'Bronze Anchor',
        level: 1,
        cognitiveScores: {
          workingMemory: 60,
          inhibitoryControl: 65,
          spatialAttention: 62,
          rhythmicPrecision: 58,
          reactionSpeed: 64
        },
        badges: [
          { badgeKey: 'first_spark', title: 'First Spark', description: 'Entered the MindFlow Focus Sanctuary.', icon: '🌱' }
        ],
        activityDays: [],
        sessions: []
      });
    }

    const formatted = formatUserOutput(userDoc);
    return { user: formatted.user, scores: formatted.scores, badges: formatted.badges };
  }

  // Local JSON fallback
  loadLocalDb();
  let user = localDb.users.find(u => u.username.toLowerCase() === cleanName.toLowerCase());

  if (user) {
    if (user.pin && pin && user.pin !== pin) {
      throw new Error('Incorrect PIN for this username.');
    }
    if (avatar) user.avatar = avatar;
    user.lastActive = new Date().toISOString();
  } else {
    user = {
      _id: 'user_' + Date.now(),
      username: cleanName,
      displayName: cleanName,
      avatar: avatar || '🧠',
      pin: pin || '',
      focusIndex: 68,
      streak: 1,
      maxStreak: 1,
      totalMinutes: 0,
      totalSessions: 0,
      tier: 'Bronze Anchor',
      level: 1,
      cognitiveScores: {
        workingMemory: 60,
        inhibitoryControl: 65,
        spatialAttention: 62,
        rhythmicPrecision: 58,
        reactionSpeed: 64,
        updatedAt: new Date().toISOString()
      },
      badges: [
        { badgeKey: 'first_spark', title: 'First Spark', description: 'Entered the MindFlow Focus Sanctuary.', icon: '🌱', unlockedAt: new Date().toISOString() }
      ],
      activityDays: [],
      sessions: [],
      lastActive: new Date().toISOString(),
      createdAt: new Date().toISOString()
    };
    localDb.users.push(user);
  }

  saveLocalDb();
  const formatted = formatUserOutput(user);
  return { user: formatted.user, scores: formatted.scores, badges: formatted.badges };
}

// -------------------------------------------------------------
// GET USER PROFILE (LEETCODE STYLE WITH COGNITIVE RADAR & HEATMAP)
// -------------------------------------------------------------
async function getUserProfile(username) {
  const cleanName = (username || '').trim();
  if (!cleanName) return null;

  if (isConnectedToMongo) {
    const userDoc = await UserModel.findOne({ username: new RegExp(`^${cleanName}$`, 'i') });
    if (!userDoc) return null;

    const formatted = formatUserOutput(userDoc);
    const rank = await UserModel.countDocuments({
      $or: [
        { focusIndex: { $gt: userDoc.focusIndex } },
        { focusIndex: userDoc.focusIndex, totalMinutes: { $gt: userDoc.totalMinutes } }
      ]
    }) + 1;

    const totalPlayers = await UserModel.countDocuments();

    return {
      ...formatted,
      rank,
      totalPlayers
    };
  }

  // Local JSON fallback
  loadLocalDb();
  const user = localDb.users.find(u => u.username.toLowerCase() === cleanName.toLowerCase());
  if (!user) return null;

  const formatted = formatUserOutput(user);
  const higherCount = localDb.users.filter(u =>
    (u.focusIndex > user.focusIndex) || (u.focusIndex === user.focusIndex && u.totalMinutes > user.totalMinutes)
  ).length;

  return {
    ...formatted,
    rank: higherCount + 1,
    totalPlayers: localDb.users.length
  };
}

// -------------------------------------------------------------
// RECORD SESSION PROGRESS & ADAPT COGNITIVE RADAR (NoSQL)
// -------------------------------------------------------------
async function recordSession(userId, { gameMode, score, accuracy, reactionMs, durationSeconds = 60 }) {
  const durMins = Math.max(1, Math.round(durationSeconds / 60));
  const todayStr = new Date().toISOString().split('T')[0];

  if (isConnectedToMongo) {
    const userDoc = await UserModel.findOne({
      $or: [{ _id: mongoose.isValidObjectId(userId) ? userId : null }, { username: userId }]
    });

    if (!userDoc) throw new Error('User not found in MongoDB');

    // Add session
    userDoc.sessions.push({
      gameMode,
      score: score || 0,
      accuracy: accuracy || 100,
      reactionMs: reactionMs || 1500,
      durationSeconds,
      createdAt: new Date()
    });

    // Update Activity Days
    const actDay = userDoc.activityDays.find(a => a.dateStr === todayStr);
    if (actDay) {
      actDay.minutes += durMins;
      actDay.sessionsCount += 1;
    } else {
      userDoc.activityDays.push({ dateStr: todayStr, minutes: durMins, sessionsCount: 1 });
    }

    // Adapt Cognitive Radar
    adaptScores(userDoc.cognitiveScores, gameMode, accuracy, reactionMs);

    // Compute new Focus Index & Tier
    const avg = computeAverageDomain(userDoc.cognitiveScores);
    userDoc.focusIndex = avg;
    userDoc.tier = getTierName(avg);
    userDoc.totalMinutes += durMins;
    userDoc.totalSessions += 1;
    userDoc.level = Math.floor(userDoc.totalMinutes / 30) + 1;
    userDoc.lastActive = new Date();

    checkBadgesMongo(userDoc);
    await userDoc.save();

    return getUserProfile(userDoc.username);
  }

  // Local JSON fallback
  loadLocalDb();
  const user = localDb.users.find(u => u._id === userId || u.username.toLowerCase() === String(userId).toLowerCase());
  if (!user) throw new Error('User not found in local store');

  if (!user.sessions) user.sessions = [];
  user.sessions.push({
    gameMode,
    score: score || 0,
    accuracy: accuracy || 100,
    reactionMs: reactionMs || 1500,
    durationSeconds,
    createdAt: new Date().toISOString()
  });

  if (!user.activityDays) user.activityDays = [];
  const actDay = user.activityDays.find(a => a.dateStr === todayStr);
  if (actDay) {
    actDay.minutes += durMins;
    actDay.sessionsCount += 1;
  } else {
    user.activityDays.push({ dateStr: todayStr, minutes: durMins, sessionsCount: 1 });
  }

  adaptScores(user.cognitiveScores, gameMode, accuracy, reactionMs);
  const avg = computeAverageDomain(user.cognitiveScores);
  user.focusIndex = avg;
  user.tier = getTierName(avg);
  user.totalMinutes += durMins;
  user.totalSessions += 1;
  user.level = Math.floor(user.totalMinutes / 30) + 1;
  user.lastActive = new Date().toISOString();

  checkBadgesLocal(user);
  saveLocalDb();

  return getUserProfile(user.username);
}

function adaptScores(scores, gameMode, accuracy, reactionMs) {
  const performanceBonus = Math.round(((accuracy || 100) / 100) * 4) - 1;
  const speedBonus = reactionMs && reactionMs < 1200 ? 2 : 0;

  if (gameMode === 'mot') {
    scores.spatialAttention = Math.min(100, Math.max(20, (scores.spatialAttention || 50) + performanceBonus));
  } else if (gameMode === 'stroop' || gameMode === 'flanker') {
    scores.inhibitoryControl = Math.min(100, Math.max(20, (scores.inhibitoryControl || 50) + performanceBonus));
  } else if (gameMode === 'nback' || gameMode === 'corsi') {
    scores.workingMemory = Math.min(100, Math.max(20, (scores.workingMemory || 50) + performanceBonus));
  } else if (gameMode === 'zen' || gameMode === 'tempo') {
    scores.rhythmicPrecision = Math.min(100, Math.max(20, (scores.rhythmicPrecision || 50) + performanceBonus));
  } else if (gameMode === 'pvt' || gameMode === 'gaze') {
    scores.reactionSpeed = Math.min(100, Math.max(20, (scores.reactionSpeed || 50) + performanceBonus + speedBonus));
  } else if (gameMode === 'circuit') {
    scores.spatialAttention = Math.min(100, (scores.spatialAttention || 50) + 1);
    scores.inhibitoryControl = Math.min(100, (scores.inhibitoryControl || 50) + 1);
    scores.workingMemory = Math.min(100, (scores.workingMemory || 50) + 1);
    scores.rhythmicPrecision = Math.min(100, (scores.rhythmicPrecision || 50) + 1);
  }
}

function computeAverageDomain(scores) {
  const total = (
    (scores.workingMemory || 50) +
    (scores.inhibitoryControl || 50) +
    (scores.spatialAttention || 50) +
    (scores.rhythmicPrecision || 50) +
    (scores.reactionSpeed || 50)
  );
  return Math.min(99, Math.max(30, Math.round(total / 5)));
}

function getTierName(focusIndex) {
  if (focusIndex >= 92) return 'Grandmaster Zen';
  if (focusIndex >= 86) return 'Diamond Flow';
  if (focusIndex >= 80) return 'Emerald Mind';
  if (focusIndex >= 72) return 'Gold Resonance';
  if (focusIndex >= 62) return 'Silver Focus';
  return 'Bronze Anchor';
}

function checkBadgesMongo(userDoc) {
  const hasBadge = (key) => userDoc.badges.some(b => b.badgeKey === key);
  const add = (k, title, description, icon) => {
    if (!hasBadge(k)) userDoc.badges.push({ badgeKey: k, title, description, icon, unlockedAt: new Date() });
  };

  if (userDoc.streak >= 3) add('streak_3', 'Mindful Continuity', 'Maintained a 3-day focus practice streak.', '🔥');
  if (userDoc.streak >= 7) add('streak_7', 'Flame Keeper', '7 consecutive days of contemplative focus.', '⚡');
  if (userDoc.focusIndex >= 80) add('high_resonance', 'Deep Resonance', 'Elevated Focus Index to 80+.', '🔮');
  if (userDoc.focusIndex >= 90) add('zen_flow', 'Zen Master', 'Attained peak mastery with Focus Index 90+.', '🏆');
  if (userDoc.totalMinutes >= 60) add('hour_club', 'Deep Work Anchor', 'Invested 1 full hour of deep cognitive practice.', '⏳');
  if (userDoc.cognitiveScores.workingMemory >= 75) add('memory_adept', 'Stone Archivist', 'Working Memory reached 75+ rating.', '🧩');
  if (userDoc.cognitiveScores.inhibitoryControl >= 75) add('iron_will', 'Still Waters', 'Inhibitory Control reached 75+ rating.', '🛡️');
}

function checkBadgesLocal(user) {
  if (!user.badges) user.badges = [];
  const hasBadge = (key) => user.badges.some(b => b.badgeKey === key);
  const add = (k, title, description, icon) => {
    if (!hasBadge(k)) user.badges.push({ badgeKey: k, title, description, icon, unlockedAt: new Date().toISOString() });
  };

  if (user.streak >= 3) add('streak_3', 'Mindful Continuity', 'Maintained a 3-day focus practice streak.', '🔥');
  if (user.streak >= 7) add('streak_7', 'Flame Keeper', '7 consecutive days of contemplative focus.', '⚡');
  if (user.focusIndex >= 80) add('high_resonance', 'Deep Resonance', 'Elevated Focus Index to 80+.', '🔮');
  if (user.focusIndex >= 90) add('zen_flow', 'Zen Master', 'Attained peak mastery with Focus Index 90+.', '🏆');
  if (user.totalMinutes >= 60) add('hour_club', 'Deep Work Anchor', 'Invested 1 full hour of deep cognitive practice.', '⏳');
  if (user.cognitiveScores.workingMemory >= 75) add('memory_adept', 'Stone Archivist', 'Working Memory reached 75+ rating.', '🧩');
  if (user.cognitiveScores.inhibitoryControl >= 75) add('iron_will', 'Still Waters', 'Inhibitory Control reached 75+ rating.', '🛡️');
}

// -------------------------------------------------------------
// GET COMPETITIVE GLOBAL LEADERBOARD (NoSQL)
// -------------------------------------------------------------
async function getLeaderboard() {
  if (isConnectedToMongo) {
    const docs = await UserModel.find()
      .sort({ focusIndex: -1, totalMinutes: -1 })
      .limit(50)
      .lean();

    return docs.map((doc, idx) => ({
      id: doc._id.toString(),
      username: doc.username,
      display_name: doc.displayName || doc.username,
      avatar: doc.avatar || '🧠',
      focus_index: doc.focusIndex,
      streak: doc.streak,
      total_minutes: doc.totalMinutes,
      total_sessions: doc.totalSessions,
      tier: doc.tier,
      level: doc.level,
      rank: idx + 1
    }));
  }

  // Local JSON fallback
  loadLocalDb();
  const sorted = [...localDb.users].sort((a, b) => {
    if (b.focusIndex !== a.focusIndex) return b.focusIndex - a.focusIndex;
    return b.totalMinutes - a.totalMinutes;
  }).slice(0, 50);

  return sorted.map((u, idx) => ({
    id: u._id,
    username: u.username,
    display_name: u.displayName || u.username,
    avatar: u.avatar || '🧠',
    focus_index: u.focusIndex,
    streak: u.streak,
    total_minutes: u.totalMinutes,
    total_sessions: u.totalSessions,
    tier: u.tier,
    level: u.level,
    rank: idx + 1
  }));
}

// -------------------------------------------------------------
// ADMIN INSPECTION: GET ALL PLAYERS & LOGINS
// -------------------------------------------------------------
async function getAllPlayersForAdmin() {
  if (isConnectedToMongo) {
    const users = await UserModel.find().sort({ lastActive: -1 }).lean();
    return {
      source: 'MongoDB Atlas',
      total: users.length,
      users: users.map(u => ({
        id: u._id.toString(),
        username: u.username,
        avatar: u.avatar,
        pin: u.pin ? '••••' : '(none)',
        raw_pin: u.pin,
        focus_index: u.focusIndex,
        streak: u.streak,
        total_minutes: u.totalMinutes,
        total_sessions: u.totalSessions,
        tier: u.tier,
        sessions_recorded: (u.sessions || []).length,
        last_active: u.lastActive,
        created_at: u.createdAt
      }))
    };
  }

  loadLocalDb();
  return {
    source: 'Local NoSQL JSON',
    total: localDb.users.length,
    users: [...localDb.users].sort((a, b) => new Date(b.lastActive) - new Date(a.lastActive)).map(u => ({
      id: u._id,
      username: u.username,
      avatar: u.avatar,
      pin: u.pin ? '••••' : '(none)',
      raw_pin: u.pin,
      focus_index: u.focusIndex,
      streak: u.streak,
      total_minutes: u.totalMinutes,
      total_sessions: u.totalSessions,
      tier: u.tier,
      sessions_recorded: (u.sessions || []).length,
      last_active: u.lastActive,
      created_at: u.createdAt
    }))
  };
}

module.exports = {
  initDb,
  loginOrCreateUser,
  getUserProfile,
  recordSession,
  getLeaderboard,
  getAllPlayersForAdmin,
  isMongoActive: () => isConnectedToMongo
};
