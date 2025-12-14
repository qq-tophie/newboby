# RobBob Telegram Backend & Bot

This is a minimal backend + Telegram bot implementation for the RobBob Launcher Telegram gate.

## Features

- REST API for Electron launcher:
  - `POST /api/auth/start` – start auth session, returns `sessionId` and bot link
  - `GET /api/auth/status?sessionId=...` – check session status (`pending` / `verified` / `expired`)
  - `POST /api/auth/validate` – validate membership token on launcher startup
- Telegram bot (long polling):
  - `/start <sessionId>` – links Telegram user to launcher session
  - `/check` – verifies that user is a member of the required channel and issues a membership token

## Requirements

- Node.js 18+
- PostgreSQL database

## Setup

1. Create a PostgreSQL database and user.

2. Create a Telegram bot via **@BotFather** and obtain the bot token.

3. Determine your channel ID:
   - For public channels: use `@YourChannelName`
   - For private channels: numeric ID like `-1001234567890`

4. Create `.env` file in `telegram-backend/`:

```env
PORT=3000
DATABASE_URL=postgresql://user:password@localhost:5432/robbob

TELEGRAM_BOT_TOKEN=123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11
BOT_USERNAME=YourBotName
CHANNEL_ID=@YourChannelName
```

5. Install dependencies and run:

```bash
cd telegram-backend
npm install
npm start
```

The service will start on `http://localhost:3000` and the bot will begin polling.

## Launcher Integration

The Electron launcher expects the backend at:

- `POST http://localhost:3000/api/auth/start`
- `GET  http://localhost:3000/api/auth/status?sessionId=...`
- `POST http://localhost:3000/api/auth/validate`

These endpoints are already implemented in [`server.js`](telegram-backend/src/server.js).

On the Telegram side, the bot will:

1. Receive `/start <sessionId>` from the deep link opened by the launcher.
2. Store `telegram_user_id` and `telegram_username` for that `sessionId`.
3. On `/check`, verify membership in `CHANNEL_ID`.
4. If the user is a member, generate `membership_token` and mark `channel_member = TRUE`.

The launcher then polls `/api/auth/status` using `sessionId`, retrieves `membershipToken`, stores it locally, and later validates it with `/api/auth/validate` on every startup.

