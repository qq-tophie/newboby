# RobBobNetService.exe Specification

## Overview

The Windows Service is a system service that hosts the Network Engine DLL and provides IPC communication with the launcher. It runs with elevated privileges to allow packet interception via WinDivert.

## Requirements

- **Language:** C/C++
- **Platform:** Windows x64
- **Service Type:** Win32 Service
- **Start Type:** Automatic (Delayed Start)
- **Account:** LocalSystem

## Service Configuration

### Registration

**Service Name:** `RobBobNetService`
**Display Name:** `RobBob Network Service`
**Description:** `Network optimization service for RobBob Launcher. Required for enhanced connection mode.`

**Installation Command:**
```cmd
sc create RobBobNetService ^
  binPath= "C:\ProgramData\RobBobNet\bin\RobBobNetService.exe" ^
  DisplayName= "RobBob Network Service" ^
  start= auto ^
  depend= Tcpip
```

**Start the Service:**
```cmd
sc start RobBobNetService
```

**Query Status:**
```cmd
sc query RobBobNetService
```

**Uninstall:**
```cmd
sc stop RobBobNetService
sc delete RobBobNetService
```

## Architecture

```
┌──────────────────────────────────────────────┐
│ RobBobNetService.exe                         │
│                                              │
│  ┌────────────────────────────────────────┐ │
│  │ Service Control Manager Interface      │ │
│  │ (ServiceMain, ServiceCtrlHandler)      │ │
│  └──────────┬─────────────────────────────┘ │
│             │                                │
│  ┌──────────▼─────────────────────────────┐ │
│  │ IPC Server (Named Pipe)                │ │
│  │ \\.\pipe\RobBobNet                     │ │
│  └──────────┬─────────────────────────────┘ │
│             │                                │
│  ┌──────────▼─────────────────────────────┐ │
│  │ Engine Controller                      │ │
│  │ - Load RobBobNetEngine.dll             │ │
│  │ - Call Engine API                      │ │
│  │ - Manage lifecycle                     │ │
│  └────────────────────────────────────────┘ │
└──────────────────────────────────────────────┘
```

## Main Components

### 1. Service Entry Point

```cpp
// Service entry point
void WINAPI ServiceMain(DWORD argc, LPSTR* argv) {
    // Register control handler
    g_ServiceStatusHandle = RegisterServiceCtrlHandlerEx(
        SERVICE_NAME,
        ServiceCtrlHandler,
        NULL
    );
    
    if (g_ServiceStatusHandle == NULL) {
        return;
    }
    
    // Report initial status
    ReportServiceStatus(SERVICE_START_PENDING, NO_ERROR, 3000);
    
    // Perform service initialization
    if (!InitializeService()) {
        ReportServiceStatus(SERVICE_STOPPED, ERROR_SERVICE_SPECIFIC_ERROR, 0);
        return;
    }
    
    // Report running status
    ReportServiceStatus(SERVICE_RUNNING, NO_ERROR, 0);
    
    // Service is now running - wait for stop signal
    WaitForSingleObject(g_ServiceStopEvent, INFINITE);
    
    // Cleanup
    CleanupService();
    
    // Report stopped status
    ReportServiceStatus(SERVICE_STOPPED, NO_ERROR, 0);
}
```

### 2. Service Control Handler

```cpp
DWORD WINAPI ServiceCtrlHandler(
    DWORD dwControl,
    DWORD dwEventType,
    LPVOID lpEventData,
    LPVOID lpContext
) {
    switch (dwControl) {
        case SERVICE_CONTROL_STOP:
            ReportServiceStatus(SERVICE_STOP_PENDING, NO_ERROR, 3000);
            SetEvent(g_ServiceStopEvent);
            return NO_ERROR;
            
        case SERVICE_CONTROL_PAUSE:
            ReportServiceStatus(SERVICE_PAUSE_PENDING, NO_ERROR, 1000);
            PauseEngine();
            ReportServiceStatus(SERVICE_PAUSED, NO_ERROR, 0);
            return NO_ERROR;
            
        case SERVICE_CONTROL_CONTINUE:
            ReportServiceStatus(SERVICE_CONTINUE_PENDING, NO_ERROR, 1000);
            ResumeEngine();
            ReportServiceStatus(SERVICE_RUNNING, NO_ERROR, 0);
            return NO_ERROR;
            
        case SERVICE_CONTROL_INTERROGATE:
            return NO_ERROR;
            
        default:
            return ERROR_CALL_NOT_IMPLEMENTED;
    }
}
```

### 3. Engine Controller

```cpp
class EngineController {
private:
    HMODULE engine_dll;
    
    // Function pointers to engine API
    int (*Engine_Initialize)(const char*);
    int (*Engine_Start)(const char*);
    int (*Engine_Stop)(void);
    int (*Engine_GetState)(EngineState*);
    int (*Engine_GetStats)(EngineStats*);
    const char* (*Engine_GetLastError)(void);
    void (*Engine_Cleanup)(void);
    
public:
    bool LoadEngine(const char* dll_path);
    void UnloadEngine();
    
    int Initialize(const char* config_dir);
    int Start(const char* mode);
    int Stop();
    int GetState(EngineState* state);
    int GetStats(EngineStats* stats);
    const char* GetLastError();
};

bool EngineController::LoadEngine(const char* dll_path) {
    engine_dll = LoadLibraryA(dll_path);
    if (engine_dll == NULL) {
        LogError("Failed to load engine DLL: %s", dll_path);
        return false;
    }
    
    // Load function pointers
    Engine_Initialize = (int(*)(const char*))
        GetProcAddress(engine_dll, "Engine_Initialize");
    Engine_Start = (int(*)(const char*))
        GetProcAddress(engine_dll, "Engine_Start");
    Engine_Stop = (int(*)(void))
        GetProcAddress(engine_dll, "Engine_Stop");
    Engine_GetState = (int(*)(EngineState*))
        GetProcAddress(engine_dll, "Engine_GetState");
    Engine_GetStats = (int(*)(EngineStats*))
        GetProcAddress(engine_dll, "Engine_GetStats");
    Engine_GetLastError = (const char*(*)(void))
        GetProcAddress(engine_dll, "Engine_GetLastError");
    Engine_Cleanup = (void(*)(void))
        GetProcAddress(engine_dll, "Engine_Cleanup");
    
    // Verify all functions loaded
    if (!Engine_Initialize || !Engine_Start || !Engine_Stop) {
        LogError("Failed to load engine functions");
        FreeLibrary(engine_dll);
        engine_dll = NULL;
        return false;
    }
    
    return true;
}
```

### 4. Named Pipe IPC Server

```cpp
class IPCServer {
private:
    HANDLE pipe_handle;
    HANDLE thread_handle;
    bool running;
    
    static DWORD WINAPI ClientThreadProc(LPVOID param);
    void HandleClient(HANDLE client_pipe);
    void ProcessCommand(const char* json_cmd, char* json_response, size_t resp_size);
    
public:
    bool Start();
    void Stop();
};

bool IPCServer::Start() {
    running = true;
    
    // Create named pipe
    pipe_handle = CreateNamedPipe(
        "\\\\.\\pipe\\RobBobNet",
        PIPE_ACCESS_DUPLEX | FILE_FLAG_FIRST_PIPE_INSTANCE,
        PIPE_TYPE_MESSAGE | PIPE_READMODE_MESSAGE | PIPE_WAIT,
        PIPE_UNLIMITED_INSTANCES,
        4096,  // Output buffer size
        4096,  // Input buffer size
        0,     // Default timeout
        NULL   // Default security
    );
    
    if (pipe_handle == INVALID_HANDLE_VALUE) {
        LogError("Failed to create named pipe");
        return false;
    }
    
    // Start listener thread
    thread_handle = CreateThread(NULL, 0, ClientThreadProc, this, 0, NULL);
    
    return true;
}

DWORD WINAPI IPCServer::ClientThreadProc(LPVOID param) {
    IPCServer* server = (IPCServer*)param;
    
    while (server->running) {
        // Wait for client connection
        BOOL connected = ConnectNamedPipe(server->pipe_handle, NULL);
        
        if (!connected && GetLastError() != ERROR_PIPE_CONNECTED) {
            continue;
        }
        
        // Handle client
        server->HandleClient(server->pipe_handle);
        
        // Disconnect client
        DisconnectNamedPipe(server->pipe_handle);
    }
    
    return 0;
}

void IPCServer::HandleClient(HANDLE client_pipe) {
    char request[4096];
    char response[4096];
    DWORD bytes_read;
    
    // Read request
    if (!ReadFile(client_pipe, request, sizeof(request) - 1, &bytes_read, NULL)) {
        return;
    }
    
    request[bytes_read] = '\0';
    
    // Process command
    ProcessCommand(request, response, sizeof(response));
    
    // Send response
    DWORD bytes_written;
    WriteFile(client_pipe, response, strlen(response), &bytes_written, NULL);
}
```

### 5. Command Processing

```cpp
void IPCServer::ProcessCommand(const char* json_cmd, 
                              char* json_response, 
                              size_t resp_size) {
    // Parse JSON command
    cJSON* cmd = cJSON_Parse(json_cmd);
    if (cmd == NULL) {
        snprintf(json_response, resp_size, 
                "{\"success\":false,\"error\":\"Invalid JSON\"}");
        return;
    }
    
    cJSON* command = cJSON_GetObjectItem(cmd, "command");
    if (command == NULL || !cJSON_IsString(command)) {
        snprintf(json_response, resp_size,
                "{\"success\":false,\"error\":\"Missing command\"}");
        cJSON_Delete(cmd);
        return;
    }
    
    const char* cmd_str = command->valuestring;
    
    if (strcmp(cmd_str, "ENGINE_INIT") == 0) {
        HandleEngineInit(cmd, json_response, resp_size);
    }
    else if (strcmp(cmd_str, "ENGINE_START") == 0) {
        HandleEngineStart(cmd, json_response, resp_size);
    }
    else if (strcmp(cmd_str, "ENGINE_STOP") == 0) {
        HandleEngineStop(cmd, json_response, resp_size);
    }
    else if (strcmp(cmd_str, "ENGINE_GET_STATE") == 0) {
        HandleEngineGetState(cmd, json_response, resp_size);
    }
    else {
        snprintf(json_response, resp_size,
                "{\"success\":false,\"error\":\"Unknown command\"}");
    }
    
    cJSON_Delete(cmd);
}

void HandleEngineInit(cJSON* cmd, char* response, size_t resp_size) {
    cJSON* config_dir = cJSON_GetObjectItem(cmd, "configDir");
    if (!config_dir || !cJSON_IsString(config_dir)) {
        snprintf(response, resp_size,
                "{\"success\":false,\"error\":\"Missing configDir\"}");
        return;
    }
    
    int result = g_EngineController.Initialize(config_dir->valuestring);
    
    if (result == ENGINE_SUCCESS) {
        snprintf(response, resp_size, "{\"success\":true}");
    } else {
        snprintf(response, resp_size,
                "{\"success\":false,\"error\":\"%s\"}",
                g_EngineController.GetLastError());
    }
}

void HandleEngineStart(cJSON* cmd, char* response, size_t resp_size) {
    cJSON* mode = cJSON_GetObjectItem(cmd, "mode");
    if (!mode || !cJSON_IsString(mode)) {
        snprintf(response, resp_size,
                "{\"success\":false,\"error\":\"Missing mode\"}");
        return;
    }
    
    int result = g_EngineController.Start(mode->valuestring);
    
    if (result == ENGINE_SUCCESS) {
        snprintf(response, resp_size, "{\"success\":true}");
    } else {
        snprintf(response, resp_size,
                "{\"success\":false,\"error\":\"%s\"}",
                g_EngineController.GetLastError());
    }
}

void HandleEngineStop(cJSON* cmd, char* response, size_t resp_size) {
    int result = g_EngineController.Stop();
    
    if (result == ENGINE_SUCCESS) {
        snprintf(response, resp_size, "{\"success\":true}");
    } else {
        snprintf(response, resp_size,
                "{\"success\":false,\"error\":\"%s\"}",
                g_EngineController.GetLastError());
    }
}

void HandleEngineGetState(cJSON* cmd, char* response, size_t resp_size) {
    EngineState state;
    int result = g_EngineController.GetState(&state);
    
    if (result == ENGINE_SUCCESS) {
        snprintf(response, resp_size,
                "{\"success\":true,\"state\":{"
                "\"running\":%s,"
                "\"mode\":\"%s\","
                "\"packetsProcessed\":%llu,"
                "\"uptime\":%llu"
                "}}",
                state.running ? "true" : "false",
                state.mode,
                state.packets_processed,
                state.uptime_seconds);
    } else {
        snprintf(response, resp_size,
                "{\"success\":false,\"error\":\"%s\"}",
                g_EngineController.GetLastError());
    }
}
```

### 6. Logging

```cpp
class Logger {
private:
    FILE* log_file;
    CRITICAL_SECTION lock;
    
public:
    bool Initialize(const char* log_path);
    void Close();
    void Log(const char* level, const char* format, ...);
};

bool Logger::Initialize(const char* log_path) {
    InitializeCriticalSection(&lock);
    
    log_file = fopen(log_path, "a");
    if (log_file == NULL) {
        return false;
    }
    
    return true;
}

void Logger::Log(const char* level, const char* format, ...) {
    EnterCriticalSection(&lock);
    
    // Get current time
    SYSTEMTIME st;
    GetLocalTime(&st);
    
    // Write timestamp and level
    fprintf(log_file, "[%04d-%02d-%02d %02d:%02d:%02d] [%s] ",
            st.wYear, st.wMonth, st.wDay,
            st.wHour, st.wMinute, st.wSecond,
            level);
    
    // Write message
    va_list args;
    va_start(args, format);
    vfprintf(log_file, format, args);
    va_end(args);
    
    fprintf(log_file, "\n");
    fflush(log_file);
    
    LeaveCriticalSection(&lock);
}
```

## Service Lifecycle

### Startup Sequence

1. **ServiceMain** called by SCM
2. Register control handler
3. Report `SERVICE_START_PENDING`
4. Load `RobBobNetEngine.dll`
5. Initialize logging
6. Start IPC server (Named Pipe)
7. Report `SERVICE_RUNNING`
8. Wait for commands or stop signal

### Stop Sequence

1. Receive `SERVICE_CONTROL_STOP`
2. Report `SERVICE_STOP_PENDING`
3. Signal stop event
4. Stop IPC server
5. Stop engine if running
6. Unload engine DLL
7. Close logging
8. Report `SERVICE_STOPPED`

## Error Handling

### Service-Level Errors

- **DLL Load Failure:** Log error, report stopped status
- **IPC Failure:** Attempt recovery, log errors
- **Engine Errors:** Log and report to clients

### Logging Errors

All errors logged to: `%ProgramData%\RobBobNet\logs\service.log`

Format:
```
[2025-01-14 12:34:56] [ERROR] Failed to load engine DLL: Access denied
[2025-01-14 12:34:57] [INFO] Service stopped
```

## Security

### Permissions

- Service runs as **LocalSystem**
- Named pipe allows **Authenticated Users** read/write
- Config directory requires **Administrator** write access
- Log directory allows service write access

### Input Validation

- Sanitize all JSON input
- Validate file paths (no directory traversal)
- Limit command size (4KB max)
- Timeout on IPC operations (30 seconds)

## Build Configuration

**Compiler:** MSVC 2019+

**Preprocessor Definitions:**
```
_WIN32_WINNT=0x0601  # Windows 7+
UNICODE
_UNICODE
```

**Libraries:**
```
advapi32.lib  # Service API
ws2_32.lib    # Winsock
```

**Subsystem:** Console (for service executable)

## Testing

### Manual Testing

```cmd
# Install service
RobBobNetService.exe /install

# Start service
sc start RobBobNetService

# Test IPC
test-client.exe ENGINE_GET_STATE

# Stop service
sc stop RobBobNetService

# Uninstall
RobBobNetService.exe /uninstall
```

### Automated Testing

- Unit tests for command parsing
- Integration tests with mock engine
- Stress tests for IPC server
- Memory leak detection

## Distribution

Package as:
```
RobBobNetService/
├── RobBobNetService.exe
├── install.bat
├── uninstall.bat
└── README.txt
```

**install.bat:**
```bat
@echo off
sc create RobBobNetService binPath= "%~dp0RobBobNetService.exe" start= auto
sc start RobBobNetService
echo Service installed and started
```

**uninstall.bat:**
```bat
@echo off
sc stop RobBobNetService
sc delete RobBobNetService
echo Service uninstalled
```

## Monitoring & Diagnostics

### Event Log Integration

Log important events to Windows Event Log:
- Service start/stop
- Engine errors
- Configuration errors

### Performance Counters (Optional)

- Packets processed per second
- Active connections
- Memory usage
- CPU time

## Future Enhancements

- [ ] Remote management interface
- [ ] Automatic crash recovery
- [ ] Hot config reload
- [ ] Detailed performance metrics
- [ ] Windows Event Tracing (ETW)
