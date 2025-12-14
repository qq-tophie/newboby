# Complete Setup Guide - RobBob Launcher New Architecture

This guide walks you through setting up the complete RobBob Launcher system with the new integrated network engine and Telegram authentication.

## Overview

The system consists of four main components:

1. **Electron Launcher** (JavaScript/Node.js) - User interface
2. **Telegram Backend** (Node.js) - Authentication server and bot
3. **Network Engine** (C++ DLL) - Packet processing
4. **Windows Service** (C++ EXE) - Service host for the engine

## Prerequisites

### For Launcher Development
- Node.js 18+ 
- npm or yarn
- Windows 10/11

### For Backend Development
- Node.js 18+
- PostgreSQL 14+
- Telegram Bot Token (from @BotFather)

### For Native Components
- Visual Studio 2019+ or MinGW-w64
- CMake 3.15+
- Windows SDK

## Step-by-Step Setup

### 1. Clone and Install Launcher

```bash
git clone https://github.com/qq-tophie/newboby.git
cd newboby
git checkout feature/integrated-network-engine-architecture

# Install dependencies
npm install

# Run in development mode
npm start -- --dev
```

### 2. Set Up Telegram Backend

#### 2.1 Create PostgreSQL Database

```bash
# Connect to PostgreSQL
psql -U postgres

# Create database and user
CREATE DATABASE robbob;
CREATE USER robbob WITH PASSWORD 'your_secure_password';
GRANT ALL PRIVILEGES ON DATABASE robbob TO robbob;

# Exit psql
\q
```

#### 2.2 Initialize Database Schema

```bash
cd telegram-backend

# Apply schema
psql -U robbob -d robbob -f database/schema.sql
```

#### 2.3 Configure Environment

```bash
# Copy example environment file
cp .env.example .env

# Edit .env with your values
nano .env
```

Fill in:
- `DATABASE_URL` - Your PostgreSQL connection string
- `TELEGRAM_BOT_TOKEN` - Get from @BotFather on Telegram
- `BOT_USERNAME` - Your bot's username (without @)
- `CHANNEL_ID` - Your Telegram channel ID (@YourChannel or -1001234567890)

#### 2.4 Install Dependencies and Start

```bash
npm install
npm start
```

The backend will start on `http://localhost:3000` and the bot will begin polling.

### 3. Create Telegram Bot

1. Open Telegram and find **@BotFather**
2. Send `/newbot` command
3. Follow prompts to choose name and username
4. Copy the bot token to your `.env` file
5. Set bot commands:
   ```
   /setcommands
   start - Link launcher to Telegram
   check - Verify channel membership
   ```
6. Set bot description and about text

### 4. Build Native Components (Optional - Stubs Provided)

The repository includes stub implementations that compile but don't perform actual packet processing. For testing the architecture, these are sufficient.

```bash
cd native

# Create build directory
mkdir build
cd build

# Generate project files (Visual Studio)
cmake .. -G "Visual Studio 17 2022" -A x64

# Build
cmake --build . --config Release
```

See [`native/BUILD.md`](native/BUILD.md) for detailed build instructions.

### 5. Deploy Native Components (Optional)

```powershell
# Create deployment directories
New-Item -ItemType Directory -Force -Path "C:\ProgramData\RobBobNet\bin"
New-Item -ItemType Directory -Force -Path "C:\ProgramData\RobBobNet\config"
New-Item -ItemType Directory -Force -Path "C:\ProgramData\RobBobNet\logs"

# Copy built files
Copy-Item "native\build\RobBobNetEngine\Release\RobBobNetEngine.dll" "C:\ProgramData\RobBobNet\bin\"
Copy-Item "native\build\RobBobNetService\Release\RobBobNetService.exe" "C:\ProgramData\RobBobNet\bin\"

# Copy configuration
Copy-Item "specs\rules.json" "C:\ProgramData\RobBobNet\config\"

# Register service (requires administrator)
sc create RobBobNetService binPath= "C:\ProgramData\RobBobNet\bin\RobBobNetService.exe" start= auto
sc start RobBobNetService
```

### 6. Configure Launcher to Use Backend

Set environment variable for the launcher:

```powershell
# For development
$env:ROBBOB_TELEGRAM_BACKEND_URL = "http://localhost:3000"

# For production (replace with your server URL)
$env:ROBBOB_TELEGRAM_BACKEND_URL = "https://your-server.com"
```

Or edit in [`main.js`](main.js) line 52:
```javascript
const TELEGRAM_CONFIG = {
  baseUrl: process.env.ROBBOB_TELEGRAM_BACKEND_URL || 'https://your-server.com'
};
```

## Testing the Setup

### Test Telegram Backend

```bash
# Test auth/start endpoint
curl -X POST http://localhost:3000/api/auth/start \
  -H "Content-Type: application/json" \
  -d '{"launcherDeviceId": "test-device-123"}'

# Should return: {"success":true,"sessionId":"...","botLink":"...","expiresIn":600}
```

### Test Bot

1. Open Telegram and find your bot
2. Send `/start test-session-id`
3. Bot should respond with welcome message
4. Join your channel
5. Send `/check`
6. Bot should confirm membership

### Test Full Flow

1. Launch the Electron app
2. On first start, Telegram gate will appear
3. Click "Авторизоваться через Telegram"
4. Telegram should open with your bot
5. Follow bot instructions
6. Return to launcher - should be unlocked

## Production Deployment

### Deploy Backend to Server

1. Choose a VPS provider (DigitalOcean, AWS, etc.)
2. Install Node.js and PostgreSQL
3. Clone your repository
4. Set up SSL with Let's Encrypt
5. Use PM2 or systemd to run backend
6. Configure firewall and security

Example with PM2:
```bash
npm install -g pm2
pm2 start telegram-backend/src/server.js --name robbob-backend
pm2 startup
pm2 save
```

### Build Launcher for Distribution

```bash
# Install electron-builder
npm install -g electron-builder

# Build for Windows
npm run build
```

### Create Installer

Package with:
- Electron launcher
- Native components (DLL + Service)
- Rules configuration
- Installer script

See [`bootstrapper/BUILD.md`](bootstrapper/BUILD.md) for details.

## Troubleshooting

### Launcher Can't Connect to Backend

- Check `ROBBOB_TELEGRAM_BACKEND_URL` is set correctly
- Verify backend is running: `curl http://localhost:3000/api/auth/status?sessionId=test`
- Check firewall settings

### Bot Not Responding

- Verify `TELEGRAM_BOT_TOKEN` in `.env`
- Check bot is running: `ps aux | grep node`
- View logs for errors

### Service Won't Start

- Check Event Viewer for errors
- Verify service is registered: `sc query RobBobNetService`
- Check file permissions on `C:\ProgramData\RobBobNet`

### Database Connection Errors

- Verify PostgreSQL is running
- Check `DATABASE_URL` format
- Test connection: `psql $DATABASE_URL`

## Architecture Diagram

```
┌─────────────────────────────────┐
│ Electron Launcher (main.js)     │
│ - Telegram Gate UI              │
│ - Engine Client IPC             │
└────────┬────────────────────────┘
         │ HTTP(S)
         ▼
┌─────────────────────────────────┐
│ Telegram Backend (Node.js)      │
│ - REST API                      │
│ - Telegram Bot                  │
│ - PostgreSQL Database           │
└─────────────────────────────────┘
         
┌────────┬────────────────────────┐
│        │ Named Pipe IPC         │
│        ▼                        │
│ ┌──────────────────────────┐   │
│ │ RobBobNetService.exe     │   │
│ │ - IPC Server             │   │
│ │ - Loads Engine DLL       │   │
│ └──────┬───────────────────┘   │
│        │ C API                 │
│        ▼                        │
│ ┌──────────────────────────┐   │
│ │ RobBobNetEngine.dll      │   │
│ │ - Packet Processing      │   │
│ │ - DPI Desync Logic       │   │
│ └──────┬───────────────────┘   │
│        │ WinDivert API         │
│        ▼                        │
│ ┌──────────────────────────┐   │
│ │ WinDivert64.sys          │   │
│ │ (Kernel Driver)          │   │
│ └──────────────────────────┘   │
└─────────────────────────────────┘
```

## Next Steps

1. Review documentation:
   - [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) - System design
   - [`docs/ENGINE_SPEC.md`](docs/ENGINE_SPEC.md) - Engine implementation
   - [`docs/SERVICE_SPEC.md`](docs/SERVICE_SPEC.md) - Service implementation
   - [`docs/TELEGRAM_BACKEND_SPEC.md`](docs/TELEGRAM_BACKEND_SPEC.md) - Backend spec
   - [`docs/MIGRATION_GUIDE.md`](docs/MIGRATION_GUIDE.md) - Migration phases

2. Implement full engine (Phase 3):
   - Integrate WinDivert
   - Implement packet processing
   - Add DPI desync techniques

3. Convert service to real Windows Service (Phase 4):
   - Implement IPC server
   - Add proper service control

4. Test end-to-end integration

## Support

For questions or issues:
- Check [`docs/`](docs/) directory for detailed specifications
- Review [`native/BUILD.md`](native/BUILD.md) for build issues
- Check [`telegram-backend/README.md`](telegram-backend/README.md) for backend setup

## Credits

This architecture redesign integrates:
- DPI bypass techniques from zapret
- Telegram bot authentication
- Windows Service architecture
- Modern Electron launcher UI
