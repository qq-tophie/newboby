# RobBob Launcher - New Architecture

## Overview

This document describes the comprehensive architectural redesign of RobBob Launcher, replacing the external `winws.exe` dependency with an integrated network engine and adding Telegram-based authentication.

## Architecture Layers

```
┌─────────────────────────────────────────────────────────────┐
│ Layer 1: Launcher UI (Electron)                            │
│ - Main Process (main.js)                                    │
│ - Renderer Process (HTML/CSS/JS)                            │
│ - Telegram Gate UI                                          │
└────────────────┬────────────────────────────────────────────┘
                 │ IPC (Named Pipe)
                 │ \\.\pipe\RobBobNet
┌────────────────▼────────────────────────────────────────────┐
│ Layer 3: Windows Service (RobBobNetService.exe)            │
│ - Service Control                                           │
│ - IPC Server (Named Pipe)                                   │
│ - Loads and controls Layer 2                                │
└────────────────┬────────────────────────────────────────────┘
                 │ C API Calls
┌────────────────▼────────────────────────────────────────────┐
│ Layer 2: User-Mode Engine (RobBobNetEngine.dll)            │
│ - Packet Processing Logic                                   │
│ - Rules Engine (rules.json)                                 │
│ - WinDivert API Wrapper                                     │
└────────────────┬────────────────────────────────────────────┘
                 │ WinDivert API
┌────────────────▼────────────────────────────────────────────┐
│ Layer 4: Kernel Driver (WinDivert64.sys)                   │
│ - Packet Interception                                       │
│ - Network Stack Integration                                 │
└─────────────────────────────────────────────────────────────┘

External:
┌─────────────────────────────────────────────────────────────┐
│ Telegram Backend (REST API + Bot)                          │
│ - Authentication Service                                    │
│ - Channel Membership Verification                           │
└─────────────────────────────────────────────────────────────┘
```

## Component Descriptions

### Layer 1: Launcher UI (Electron)

**Responsibilities:**
- User interface and interaction
- Telegram authentication gate
- Communication with service via IPC
- Settings management
- No direct network manipulation

**Files:**
- `main.js` - Main Electron process
- `src/index.html` - UI markup
- `src/scripts/telegram-gate.js` - Telegram authentication UI
- `src/scripts/bypass.js` - Network mode UI (modified)
- `engineClient.js` - IPC client for service communication

**Key Changes:**
- Add Telegram gate overlay that blocks all functionality until authenticated
- Replace `winws.exe` spawn code with `engineClient` IPC calls
- Remove all direct process management (cmd.exe, taskkill, etc.)

### Layer 2: User-Mode Engine (C/C++ DLL)

**File:** `RobBobNetEngine.dll`

**API:**
```c
int Engine_Initialize(const char* config_dir);
int Engine_Start(const char* mode);
int Engine_Stop(void);
int Engine_ApplyRules(const char* rules_path);
int Engine_GetState(EngineState* out_state);
```

**Responsibilities:**
- Read and parse `rules.json`
- Load domain lists from config directory
- Open WinDivert handles with appropriate filters
- Process packets according to DPI bypass rules
- Implement desync techniques (fake, split, etc.)
- Maintain statistics

**Configuration Location:**
- `%ProgramData%\RobBobNet\config\rules.json`
- `%ProgramData%\RobBobNet\config\lists\*.txt`

### Layer 3: Windows Service (C/C++ EXE)

**File:** `RobBobNetService.exe`

**Responsibilities:**
- Windows Service lifecycle management
- Load and control `RobBobNetEngine.dll`
- Named Pipe IPC server (`\\.\pipe\RobBobNet`)
- Logging and diagnostics
- No UI or console output

**Service Configuration:**
- Name: `RobBobNetService`
- Display Name: `RobBob Network Service`
- Startup Type: Automatic (Delayed Start)
- Run As: LocalSystem

### Layer 4: Kernel Driver

**Files:**
- `WinDivert64.sys`
- `WinDivert.dll` (user-mode API)

**Status:** Existing component, no changes needed.

### Telegram Backend

**Components:**
1. **REST API** (Your server)
   - `POST /api/auth/start` - Initialize session
   - `GET /api/auth/status` - Check session status
   - `POST /api/auth/validate` - Validate token
   - `POST /api/bot/start` - Bot callback
   - `POST /api/bot/verify` - Verify membership

2. **Telegram Bot**
   - `/start <sessionId>` - Link device
   - `/check` - Verify channel membership

3. **Database Schema:**
```sql
CREATE TABLE telegram_sessions (
  id SERIAL PRIMARY KEY,
  session_id UUID UNIQUE NOT NULL,
  launcher_device_id TEXT NOT NULL,
  telegram_user_id BIGINT,
  telegram_username TEXT,
  channel_member BOOLEAN DEFAULT FALSE,
  membership_token TEXT,
  created_at TIMESTAMP DEFAULT now(),
  verified_at TIMESTAMP
);
```

## IPC Protocol

### Named Pipe: `\\.\pipe\RobBobNet`

**Message Format:** JSON over named pipe

**Commands:**

1. **ENGINE_INIT**
   ```json
   {
     "command": "ENGINE_INIT",
     "configDir": "C:\\ProgramData\\RobBobNet\\config"
   }
   ```
   Response:
   ```json
   {
     "success": true,
     "error": null
   }
   ```

2. **ENGINE_START**
   ```json
   {
     "command": "ENGINE_START",
     "mode": "general"
   }
   ```
   Response:
   ```json
   {
     "success": true,
     "error": null
   }
   ```

3. **ENGINE_STOP**
   ```json
   {
     "command": "ENGINE_STOP"
   }
   ```
   Response:
   ```json
   {
     "success": true,
     "error": null
   }
   ```

4. **ENGINE_GET_STATE**
   ```json
   {
     "command": "ENGINE_GET_STATE"
   }
   ```
   Response:
   ```json
   {
     "success": true,
     "state": {
       "running": true,
       "mode": "general",
       "packetsProcessed": 12345,
       "uptime": 3600
     }
   }
   ```

## Installation Flow

### Bootstrapper Process

1. **Check Admin Rights**
   - Request elevation if needed

2. **Download Manifest**
   - Fetch `manifest.json` from server

3. **Download Components**
   - Launcher portable executable
   - Network engine DLL
   - Windows service executable
   - WinDivert driver
   - Rules and configuration files

4. **Install Components**
   - Extract launcher to `%LocalAppData%\RobBobLauncher`
   - Extract engine/service to `%ProgramData%\RobBobNet\bin`
   - Extract config to `%ProgramData%\RobBobNet\config`
   - Install driver to system directory

5. **Register Service**
   - Use `sc create` or WinAPI `CreateService`
   - Set to auto-start (delayed)
   - Start service

6. **Create Shortcuts**
   - Desktop shortcut
   - Start menu entry

7. **Launch Launcher**
   - Start main application
   - Exit bootstrapper

### Server Manifest Format

**File:** `https://your-server.com/manifest.json`

```json
{
  "launcher": {
    "version": "1.2.3",
    "url": "https://your-server.com/files/RobBob-Launcher-portable.zip",
    "hash": "sha256:..."
  },
  "netEngine": {
    "version": "0.9.0",
    "url": "https://your-server.com/files/RobBobNetEngine.zip",
    "hash": "sha256:..."
  },
  "service": {
    "version": "0.9.0",
    "url": "https://your-server.com/files/RobBobNetService.zip",
    "hash": "sha256:..."
  },
  "driver": {
    "version": "2.3.1",
    "url": "https://your-server.com/files/WinDivert-driver.zip",
    "hash": "sha256:..."
  },
  "rules": {
    "version": "2025-01-01",
    "url": "https://your-server.com/files/RobBob-rules.zip",
    "hash": "sha256:..."
  },
  "telegramBackend": {
    "baseUrl": "https://your-server.com",
    "botName": "YourBotName"
  }
}
```

## Security Considerations

### Telegram Authentication
- Device IDs generated once and stored locally
- Membership tokens have expiration
- Backend validates all requests
- No sensitive data exposed in launcher

### Network Engine
- Runs as LocalSystem service
- No internet access except through WinDivert
- Configuration files validated before loading
- Logging does not expose sensitive traffic data

### Updates
- All downloads verified with SHA256 hashes
- HTTPS only for all communications
- Signed executables (recommended for production)

## Migration Path

### Phase 1: Preparation (This PR)
- [ ] Create specifications and documentation
- [ ] Implement Telegram gate UI in launcher
- [ ] Implement IPC client in launcher
- [ ] Create rules.json configuration format
- [ ] Update bootstrapper manifest system

### Phase 2: C/C++ Implementation (Separate PR/Project)
- [ ] Implement RobBobNetEngine.dll
- [ ] Implement RobBobNetService.exe
- [ ] Create installer/registration scripts
- [ ] Testing and validation

### Phase 3: Backend Implementation (Separate Project)
- [ ] Create REST API service
- [ ] Implement Telegram bot
- [ ] Set up database
- [ ] Deploy to server

### Phase 4: Integration & Testing
- [ ] End-to-end testing
- [ ] User acceptance testing
- [ ] Performance benchmarking
- [ ] Documentation updates

### Phase 5: Deployment
- [ ] Beta release to limited users
- [ ] Monitor and fix issues
- [ ] Full production release
- [ ] Deprecate old winws.exe method

## File Structure

```
RobBobLauncher/
├── main.js                          # Modified: Remove winws code, add engineClient
├── engineClient.js                  # New: IPC client for service
├── src/
│   ├── index.html                   # Modified: Add Telegram gate overlay
│   ├── scripts/
│   │   ├── telegram-gate.js         # New: Telegram authentication
│   │   ├── bypass.js                # Modified: Use engineClient
│   │   └── ...
│   └── styles/
│       └── main.css                 # Modified: Add Telegram gate styles
├── docs/
│   ├── ARCHITECTURE.md              # This file
│   ├── TELEGRAM_BACKEND_SPEC.md     # Telegram backend specification
│   ├── ENGINE_SPEC.md               # C/C++ engine specification
│   ├── SERVICE_SPEC.md              # Windows service specification
│   └── MIGRATION_GUIDE.md           # Migration guide
└── specs/
    └── rules.json                   # Network rules configuration

%ProgramData%\RobBobNet\
├── bin/
│   ├── RobBobNetEngine.dll
│   ├── RobBobNetService.exe
│   ├── WinDivert.dll
│   └── WinDivert64.sys
├── config/
│   ├── rules.json
│   └── lists/
│       ├── list-general.txt
│       ├── list-google.txt
│       └── ...
└── logs/
    └── service.log
```

## Benefits of New Architecture

1. **No External Dependencies:** Everything integrated into one system
2. **Better Control:** Direct IPC communication instead of process spawning
3. **Cleaner Updates:** Service can be updated without restarting launcher
4. **Better Security:** No cmd.exe/powershell.exe spawning
5. **Centralized Configuration:** All rules in one declarative file
6. **Telegram Gate:** Ensures only authorized users access the launcher
7. **Single Installer:** One bootstrapper handles everything

## Next Steps

See `MIGRATION_GUIDE.md` for detailed implementation steps.
