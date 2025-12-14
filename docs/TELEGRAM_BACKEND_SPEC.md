# Telegram Backend & Bot Specification

## Overview

The Telegram backend provides authentication and channel membership verification for the RobBob Launcher. Users must join a specific Telegram channel to use the launcher.

## Architecture

```
┌─────────────────┐
│  RobBob         │
│  Launcher       │
└────────┬────────┘
         │ HTTPS
         │
┌────────▼────────────────────────────────────┐
│  Backend Server (Node.js/Python/Go)         │
│                                             │
│  REST API:                                  │
│  - POST /api/auth/start                     │
│  - GET  /api/auth/status                    │
│  - POST /api/auth/validate                  │
│  - POST /api/bot/start      (bot only)      │
│  - POST /api/bot/verify     (bot only)      │
│                                             │
│  Database: PostgreSQL/MySQL                 │
│  - telegram_sessions table                  │
└──────────────┬──────────────────────────────┘
               │
               │ Telegram Bot API
               │
┌──────────────▼──────────────────────────────┐
│  Telegram Bot                               │
│  - Handles /start <sessionId>               │
│  - Handles /check                           │
│  - Verifies channel membership              │
└─────────────────────────────────────────────┘
```

## Database Schema

### PostgreSQL

```sql
CREATE TABLE telegram_sessions (
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

CREATE INDEX idx_session_id ON telegram_sessions(session_id);
CREATE INDEX idx_device_id ON telegram_sessions(launcher_device_id);
CREATE INDEX idx_membership_token ON telegram_sessions(membership_token);
CREATE INDEX idx_telegram_user_id ON telegram_sessions(telegram_user_id);

-- Optional: audit log
CREATE TABLE auth_logs (
  id SERIAL PRIMARY KEY,
  device_id VARCHAR(255),
  action VARCHAR(50),
  success BOOLEAN,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## REST API Specification

### Base URL

```
https://your-server.com
```

### Authentication

Internal endpoints (bot callbacks) use a shared secret in the `X-Bot-Secret` header.

### Endpoints

#### 1. POST /api/auth/start

**Description:** Initialize authentication session

**Request:**
```json
{
  "launcherDeviceId": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Response (Success):**
```json
{
  "success": true,
  "sessionId": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
  "botLink": "https://t.me/YourBot?start=7c9e6679-7425-40de-944b-e07fc1f90ae7",
  "expiresIn": 600
}
```

**Response (Error):**
```json
{
  "success": false,
  "error": "Invalid device ID format"
}
```

**Implementation:**
```javascript
// Node.js/Express example
app.post('/api/auth/start', async (req, res) => {
  const { launcherDeviceId } = req.body;
  
  // Validate device ID
  if (!launcherDeviceId || !isValidUUID(launcherDeviceId)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid device ID format'
    });
  }
  
  // Generate session ID
  const sessionId = uuidv4();
  
  // Store in database
  await db.query(
    `INSERT INTO telegram_sessions (session_id, launcher_device_id)
     VALUES ($1, $2)`,
    [sessionId, launcherDeviceId]
  );
  
  // Log the request
  await logAuthAction(launcherDeviceId, 'auth_start', true, req.ip);
  
  res.json({
    success: true,
    sessionId: sessionId,
    botLink: `https://t.me/${process.env.BOT_USERNAME}?start=${sessionId}`,
    expiresIn: 600
  });
});
```

#### 2. GET /api/auth/status

**Description:** Check authentication session status

**Query Parameters:**
- `sessionId` (required): Session UUID

**Response (Pending):**
```json
{
  "status": "pending",
  "message": "Waiting for Telegram verification"
}
```

**Response (Verified):**
```json
{
  "status": "verified",
  "membershipToken": "tok_550e8400e29b41d4a716446655440000",
  "expiresAt": "2025-02-14T00:00:00Z",
  "telegramUsername": "user123"
}
```

**Response (Expired):**
```json
{
  "status": "expired",
  "error": "Session expired, please restart authentication"
}
```

**Implementation:**
```javascript
app.get('/api/auth/status', async (req, res) => {
  const { sessionId } = req.query;
  
  if (!sessionId || !isValidUUID(sessionId)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid session ID'
    });
  }
  
  const session = await db.queryOne(
    `SELECT * FROM telegram_sessions WHERE session_id = $1`,
    [sessionId]
  );
  
  if (!session) {
    return res.json({
      status: 'expired',
      error: 'Session not found or expired'
    });
  }
  
  // Check if session is too old (e.g., 10 minutes)
  const age = Date.now() - new Date(session.created_at).getTime();
  if (age > 10 * 60 * 1000) {
    return res.json({
      status: 'expired',
      error: 'Session expired, please restart authentication'
    });
  }
  
  if (!session.channel_member) {
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
});
```

#### 3. POST /api/auth/validate

**Description:** Validate membership token

**Request:**
```json
{
  "launcherDeviceId": "550e8400-e29b-41d4-a716-446655440000",
  "membershipToken": "tok_550e8400e29b41d4a716446655440000"
}
```

**Response (Valid):**
```json
{
  "allowed": true,
  "telegramUsername": "user123",
  "expiresAt": "2025-02-14T00:00:00Z"
}
```

**Response (Invalid):**
```json
{
  "allowed": false,
  "reason": "Token expired or invalid"
}
```

**Implementation:**
```javascript
app.post('/api/auth/validate', async (req, res) => {
  const { launcherDeviceId, membershipToken } = req.body;
  
  const session = await db.queryOne(
    `SELECT * FROM telegram_sessions 
     WHERE launcher_device_id = $1 
       AND membership_token = $2 
       AND channel_member = TRUE`,
    [launcherDeviceId, membershipToken]
  );
  
  if (!session) {
    await logAuthAction(launcherDeviceId, 'validate_failed', false, req.ip);
    return res.json({
      allowed: false,
      reason: 'Token not found or invalid'
    });
  }
  
  // Check token expiration
  if (session.token_expires_at && 
      new Date(session.token_expires_at) < new Date()) {
    return res.json({
      allowed: false,
      reason: 'Token expired'
    });
  }
  
  // Update last validated timestamp
  await db.query(
    `UPDATE telegram_sessions 
     SET last_validated_at = NOW() 
     WHERE id = $1`,
    [session.id]
  );
  
  await logAuthAction(launcherDeviceId, 'validate_success', true, req.ip);
  
  res.json({
    allowed: true,
    telegramUsername: session.telegram_username,
    expiresAt: session.token_expires_at
  });
});
```

#### 4. POST /api/bot/start (Internal - Bot Only)

**Description:** Bot callback when user starts bot

**Headers:**
```
X-Bot-Secret: your-shared-secret
```

**Request:**
```json
{
  "sessionId": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
  "telegramUserId": 123456789,
  "telegramUsername": "user123"
}
```

**Response:**
```json
{
  "success": true
}
```

**Implementation:**
```javascript
app.post('/api/bot/start', authenticateBot, async (req, res) => {
  const { sessionId, telegramUserId, telegramUsername } = req.body;
  
  await db.query(
    `UPDATE telegram_sessions 
     SET telegram_user_id = $1, telegram_username = $2 
     WHERE session_id = $3`,
    [telegramUserId, telegramUsername, sessionId]
  );
  
  res.json({ success: true });
});
```

#### 5. POST /api/bot/verify (Internal - Bot Only)

**Description:** Bot callback after verifying channel membership

**Headers:**
```
X-Bot-Secret: your-shared-secret
```

**Request:**
```json
{
  "sessionId": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
  "isMember": true
}
```

**Response:**
```json
{
  "success": true,
  "membershipToken": "tok_550e8400e29b41d4a716446655440000"
}
```

**Implementation:**
```javascript
app.post('/api/bot/verify', authenticateBot, async (req, res) => {
  const { sessionId, isMember } = req.body;
  
  if (!isMember) {
    return res.json({ success: false, error: 'Not a member' });
  }
  
  // Generate membership token
  const token = 'tok_' + crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date();
  expiresAt.setMonth(expiresAt.getMonth() + 1); // 1 month validity
  
  await db.query(
    `UPDATE telegram_sessions 
     SET channel_member = TRUE,
         membership_token = $1,
         token_expires_at = $2,
         verified_at = NOW()
     WHERE session_id = $3`,
    [token, expiresAt, sessionId]
  );
  
  res.json({
    success: true,
    membershipToken: token
  });
});
```

## Telegram Bot Implementation

### Bot Commands

#### /start [sessionId]

**Description:** Link launcher to Telegram account

**Response:**
```
🎮 Привет! Это бот RobBob Launcher.

Для использования лаунчера необходимо:
1. Вступить в наш канал: @YourChannel
2. Отправить команду /check

После этого лаунчер будет разблокирован.
```

#### /check

**Description:** Verify channel membership

**Response (Success):**
```
✅ Отлично! Вы участник канала.

Ваш лаунчер разблокирован. Можете вернуться в приложение.
```

**Response (Not Member):**
```
❌ Вы ещё не вступили в канал.

Пожалуйста, вступите в @YourChannel и попробуйте снова.
```

### Bot Code Example (Node.js with node-telegram-bot-api)

```javascript
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });
const CHANNEL_ID = process.env.CHANNEL_ID; // e.g., '@yourchannel' or -1001234567890
const BACKEND_URL = process.env.BACKEND_URL;
const BOT_SECRET = process.env.BOT_SECRET;

// Handle /start command
bot.onText(/\/start (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const sessionId = match[1];
  const userId = msg.from.id;
  const username = msg.from.username;
  
  // Notify backend
  try {
    await axios.post(`${BACKEND_URL}/api/bot/start`, {
      sessionId,
      telegramUserId: userId,
      telegramUsername: username
    }, {
      headers: { 'X-Bot-Secret': BOT_SECRET }
    });
    
    bot.sendMessage(chatId, 
      `🎮 Привет, ${msg.from.first_name}!\n\n` +
      `Для использования лаунчера необходимо:\n` +
      `1. Вступить в наш канал: @YourChannel\n` +
      `2. Отправить команду /check\n\n` +
      `После этого лаунчер будет разблокирован.`
    );
  } catch (err) {
    console.error('Backend error:', err);
    bot.sendMessage(chatId, '❌ Ошибка связи с сервером. Попробуйте позже.');
  }
});

// Handle /check command
bot.onText(/\/check/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  
  try {
    // Check if user is channel member
    const member = await bot.getChatMember(CHANNEL_ID, userId);
    const isMember = ['creator', 'administrator', 'member'].includes(member.status);
    
    if (!isMember) {
      bot.sendMessage(chatId,
        `❌ Вы ещё не вступили в канал.\n\n` +
        `Пожалуйста, вступите в @YourChannel и попробуйте снова.`
      );
      return;
    }
    
    // Find session for this user
    const session = await db.queryOne(
      `SELECT session_id FROM telegram_sessions 
       WHERE telegram_user_id = $1 
       ORDER BY created_at DESC LIMIT 1`,
      [userId]
    );
    
    if (!session) {
      bot.sendMessage(chatId,
        `❌ Сессия не найдена.\n\n` +
        `Пожалуйста, откройте лаунчер и начните процесс авторизации заново.`
      );
      return;
    }
    
    // Notify backend
    const response = await axios.post(`${BACKEND_URL}/api/bot/verify`, {
      sessionId: session.session_id,
      isMember: true
    }, {
      headers: { 'X-Bot-Secret': BOT_SECRET }
    });
    
    bot.sendMessage(chatId,
      `✅ Отлично! Вы участник канала.\n\n` +
      `Ваш лаунчер разблокирован. Можете вернуться в приложение.`
    );
    
  } catch (err) {
    console.error('Check error:', err);
    bot.sendMessage(chatId, '❌ Ошибка проверки. Попробуйте позже.');
  }
});

console.log('Bot started');
```

## Security Considerations

### Rate Limiting

Implement rate limiting on all endpoints:
- `/api/auth/start`: 5 requests per minute per IP
- `/api/auth/status`: 60 requests per minute per session
- `/api/auth/validate`: 10 requests per minute per device

### Token Security

- Tokens are cryptographically random (32 bytes)
- Tokens have expiration dates
- Tokens are validated on every launcher start
- Tokens can be revoked by admin

### Bot Secret

- Shared secret between bot and backend
- Rotate periodically
- Store in environment variables
- Never expose in client code

### HTTPS Only

All communication must use HTTPS with valid certificates.

## Deployment

### Environment Variables

```bash
# Backend
DATABASE_URL=postgresql://user:pass@localhost/robbob
BOT_SECRET=your-random-secret-here
BOT_USERNAME=YourBot
CHANNEL_ID=@YourChannel

# Bot
TELEGRAM_BOT_TOKEN=123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11
BACKEND_URL=https://your-server.com
BOT_SECRET=your-random-secret-here
CHANNEL_ID=@YourChannel
```

### Docker Compose Example

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:14
    environment:
      POSTGRES_DB: robbob
      POSTGRES_USER: robbob
      POSTGRES_PASSWORD: secure_password
    volumes:
      - postgres_data:/var/lib/postgresql/data
  
  backend:
    build: ./backend
    ports:
      - "3000:3000"
    environment:
      DATABASE_URL: postgresql://robbob:secure_password@postgres/robbob
      BOT_SECRET: ${BOT_SECRET}
      BOT_USERNAME: ${BOT_USERNAME}
      CHANNEL_ID: ${CHANNEL_ID}
    depends_on:
      - postgres
  
  bot:
    build: ./bot
    environment:
      TELEGRAM_BOT_TOKEN: ${TELEGRAM_BOT_TOKEN}
      BACKEND_URL: http://backend:3000
      BOT_SECRET: ${BOT_SECRET}
      CHANNEL_ID: ${CHANNEL_ID}
    depends_on:
      - backend

volumes:
  postgres_data:
```

## Testing

### Manual Testing Flow

1. Start launcher → calls `/api/auth/start`
2. Open bot link → bot receives `/start <sessionId>`
3. Bot calls `/api/bot/start`
4. User joins channel
5. User sends `/check` → bot verifies membership
6. Bot calls `/api/bot/verify`
7. Launcher polls `/api/auth/status` → receives token
8. Launcher stores token locally
9. On next start, launcher calls `/api/auth/validate`

### Automated Tests

```javascript
describe('Telegram Auth API', () => {
  it('should create session', async () => {
    const res = await request(app)
      .post('/api/auth/start')
      .send({ launcherDeviceId: validUUID });
    expect(res.body.success).toBe(true);
    expect(res.body.sessionId).toBeDefined();
  });
  
  it('should return pending status', async () => {
    const res = await request(app)
      .get('/api/auth/status')
      .query({ sessionId: testSessionId });
    expect(res.body.status).toBe('pending');
  });
  
  // More tests...
});
```

## Monitoring

### Metrics to Track

- Auth attempts per hour
- Successful verifications per hour
- Active tokens count
- Token validation requests
- Failed validation attempts
- Average time to verification

### Alerts

- High rate of failed validations (possible abuse)
- Backend API errors
- Bot disconnections
- Database connection issues

## Future Enhancements

- [ ] Multiple channel support
- [ ] Subscription tiers
- [ ] Token refresh mechanism
- [ ] Admin dashboard
- [ ] Ban/unban users
- [ ] Usage analytics per user
