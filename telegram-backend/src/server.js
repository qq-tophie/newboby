/*
 * RobBob Telegram Backend + Bot
 *
 * This service provides:
 * - REST API for the Electron launcher:
 *   - POST /api/auth/start
 *   - GET  /api/auth/status
 *   - POST /api/auth/validate
 * - Telegram bot that links sessions and verifies channel membership.
 *
 * Environment variables (see README):
 * - PORT
 * - DATABASE_URL (PostgreSQL)
 * - TELEGRAM_BOT_TOKEN
 * - BOT_USERNAME
 * - CHANNEL_ID
 */

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const { Pool } = require('pg');
const TelegramBot = require('node-telegram-bot-api');

// ================================
// Configuration
// ================================

const PORT = process.env.PORT || 3000;
const DATABASE_URL = process.env.DATABASE_URL;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const BOT_USERNAME = process.env.BOT_USERNAME || 'YourBotName';
const CHANNEL_ID = process.env.CHANNEL_ID; // e.g. @yourchannel or -1001234567890

if (!DATABASE_URL) {
  console.error('DATABASE_URL is not set');
}

if (!TELEGRAM_BOT_TOKEN) {
  console.error('TELEGRAM_BOT_TOKEN is not set');
}

if (!CHANNEL_ID) {
  console.error('CHANNEL_ID is not set');
}

// ================================
// Database
// ================================

const pool = new Pool({
  connectionString: DATABASE_URL
});

async function initDb() {
  const createTableSql = `
    CREATE TABLE IF NOT EXISTS telegram_sessions (
      id SERIAL PRIMARY KEY,
      session_id UUID UNIQUE NOT NULL,
      launcher_device_id VARCHAR(255) NOT NULL,
      telegram_user_id BIGINT,
      telegram_username VARCHAR(255),
      channel_member BOOLEAN DEFAULT FALSE,
      membership_token VARCHAR(255),
      token_expires_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      verified_at TIMESTAMP,
      last_validated_at TIMESTAMP
    );
  `;

  await pool.query(createTableSql);
}

// ================================
// Helpers
// ================================

function generateToken() {
  return 'tok_' + crypto.randomBytes(32).toString('hex');
}

// ================================
// Express App
// ================================

const app = express();
app.use(cors());
app.use(express.json());

// POST /api/auth/start
app.post('/api/auth/start', async (req, res) => {
  const { launcherDeviceId } = req.body || {};

  if (!launcherDeviceId || typeof launcherDeviceId !== 'string') {
    return res.status(400).json({
      success: false,
      error: 'Invalid launcherDeviceId'
    });
  }

  const sessionId = crypto.randomUUID();

  try {
    await pool.query(
      `INSERT INTO telegram_sessions (session_id, launcher_device_id)
       VALUES ($1, $2)
       ON CONFLICT (session_id) DO NOTHING`,
      [sessionId, launcherDeviceId]
    );

    const botLink = `https://t.me/${BOT_USERNAME}?start=${sessionId}`;

    res.json({
      success: true,
      sessionId,
      botLink,
      expiresIn: 600
    });
  } catch (err) {
    console.error('auth/start error:', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// GET /api/auth/status?sessionId=...
app.get('/api/auth/status', async (req, res) => {
  const { sessionId } = req.query;

  if (!sessionId) {
    return res.status(400).json({ status: 'error', error: 'Missing sessionId' });
  }

  try {
    const { rows } = await pool.query(
      'SELECT * FROM telegram_sessions WHERE session_id = $1',
      [sessionId]
    );

    if (rows.length === 0) {
      return res.json({ status: 'expired', error: 'Session not found' });
    }

    const session = rows[0];

    // Simple age check (optional)
    const createdAt = session.created_at ? new Date(session.created_at) : null;
    if (createdAt) {
      const ageMs = Date.now() - createdAt.getTime();
      if (ageMs > 10 * 60 * 1000 && !session.channel_member) {
        return res.json({ status: 'expired', error: 'Session expired' });
      }
    }

    if (!session.channel_member || !session.membership_token) {
      return res.json({
        status: 'pending',
        message: 'Waiting for Telegram verification'
      });
    }

    res.json({
      status: 'verified',
      membershipToken: session.membership_token,
      expiresAt: session.token_expires_at,
      telegramUsername: session.telegram_username
    });
  } catch (err) {
    console.error('auth/status error:', err);
    res.status(500).json({ status: 'error', error: 'Internal server error' });
  }
});

// POST /api/auth/validate
app.post('/api/auth/validate', async (req, res) => {
  const { launcherDeviceId, membershipToken } = req.body || {};

  if (!launcherDeviceId || !membershipToken) {
    return res.status(400).json({
      allowed: false,
      reason: 'Missing launcherDeviceId or membershipToken'
    });
  }

  try {
    const { rows } = await pool.query(
      `SELECT * FROM telegram_sessions
       WHERE launcher_device_id = $1
         AND membership_token = $2
         AND channel_member = TRUE
       ORDER BY verified_at DESC
       LIMIT 1`,
      [launcherDeviceId, membershipToken]
    );

    if (rows.length === 0) {
      return res.json({
        allowed: false,
        reason: 'Token not found or invalid'
      });
    }

    const session = rows[0];

    if (session.token_expires_at && new Date(session.token_expires_at) < new Date()) {
      return res.json({ allowed: false, reason: 'Token expired' });
    }

    await pool.query(
      'UPDATE telegram_sessions SET last_validated_at = NOW() WHERE id = $1',
      [session.id]
    );

    res.json({
      allowed: true,
      telegramUsername: session.telegram_username,
      expiresAt: session.token_expires_at
    });
  } catch (err) {
    console.error('auth/validate error:', err);
    res.status(500).json({ allowed: false, reason: 'Internal server error' });
  }
});

// ================================
// Telegram Bot
// ================================

let bot = null;

function initBot() {
  if (!TELEGRAM_BOT_TOKEN) {
    console.warn('TELEGRAM_BOT_TOKEN not set, bot will not start');
    return;
  }

  bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });
  console.log('Telegram bot started');

  // /start <sessionId>
  bot.onText(/\/start(?:\s+(.+))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const sessionId = match && match[1] ? match[1].trim() : null;

    if (!sessionId) {
      bot.sendMessage(chatId,
        'Привет! Запусти лаунчер RobBob, чтобы начать авторизацию.');
      return;
    }

    try {
      await pool.query(
        `UPDATE telegram_sessions
         SET telegram_user_id = $1,
             telegram_username = $2
         WHERE session_id = $3`,
        [msg.from.id, msg.from.username || null, sessionId]
      );

      const text = [
        `🎮 Привет, ${msg.from.first_name || ''}!`,
        '',
        '1. Вступи в наш канал (ссылка в описании бота).',
        '2. Потом отправь /check здесь, чтобы завершить авторизацию.'
      ].join('\n');

      bot.sendMessage(chatId, text);
    } catch (err) {
      console.error('/start error:', err);
      bot.sendMessage(chatId, '❌ Ошибка на сервере. Попробуй позже.');
    }
  });

  // /check
  bot.onText(/\/check/, async (msg) => {
    const chatId = msg.chat.id;

    if (!CHANNEL_ID) {
      bot.sendMessage(chatId, 'CHANNEL_ID не настроен на сервере.');
      return;
    }

    try {
      const member = await bot.getChatMember(CHANNEL_ID, msg.from.id);
      const status = member.status;
      const isMember = ['creator', 'administrator', 'member'].includes(status);

      if (!isMember) {
        bot.sendMessage(chatId,
          '❌ Вы ещё не вступили в канал. Вступите и попробуйте снова.');
        return;
      }

      // Find latest session for this user
      const { rows } = await pool.query(
        `SELECT * FROM telegram_sessions
         WHERE telegram_user_id = $1
         ORDER BY created_at DESC
         LIMIT 1`,
        [msg.from.id]
      );

      if (rows.length === 0) {
        bot.sendMessage(chatId,
          '❌ Сессия не найдена. Открой лаунчер и начни авторизацию заново.');
        return;
      }

      const session = rows[0];
      const token = generateToken();
      const expiresAt = new Date();
      expiresAt.setMonth(expiresAt.getMonth() + 1); // 1 month

      await pool.query(
        `UPDATE telegram_sessions
         SET channel_member = TRUE,
             membership_token = $1,
             token_expires_at = $2,
             verified_at = NOW()
         WHERE id = $3`,
        [token, expiresAt, session.id]
      );

      bot.sendMessage(chatId,
        '✅ Отлично! Вы участник канала. Лаунчер будет разблокирован, можно вернуться в приложение.');
    } catch (err) {
      console.error('/check error:', err);
      bot.sendMessage(chatId, '❌ Ошибка проверки. Попробуй позже.');
    }
  });
}

// ================================
// Startup
// ================================

async function start() {
  try {
    await initDb();
    console.log('Database initialized');

    app.listen(PORT, () => {
      console.log(`Telegram backend listening on port ${PORT}`);
    });

    initBot();
  } catch (err) {
    console.error('Failed to start backend:', err);
    process.exit(1);
  }
}

start();

