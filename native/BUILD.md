# Building RobBobNet Native Components

This directory contains the C/C++ native components for the RobBob network engine:

- **RobBobNetEngine** - DLL that implements packet processing and DPI bypass
- **RobBobNetService** - Windows Service that hosts the engine and provides IPC

## Prerequisites

### Windows Build Tools

- **Visual Studio 2019 or later** (Community Edition is fine)
  - Install "Desktop development with C++" workload
  - Or use Build Tools for Visual Studio
- **CMake 3.15 or later**
- **Windows SDK**

### Alternative: MinGW-w64

If you prefer MinGW instead of Visual Studio:
- [MinGW-w64](https://www.mingw-w64.org/)
- CMake
- Make or Ninja

### Dependencies

- **WinDivert SDK** (required for actual packet interception)
  - Download from: https://github.com/basil00/Divert/releases
  - Extract to `native/dependencies/WinDivert/`
  - Should contain: `WinDivert.dll`, `WinDivert64.sys`, `WinDivert.h`, `WinDivert.lib`

- **JSON Library** (for parsing rules.json)
  - Recommended: [cJSON](https://github.com/DaveGamble/cJSON) or [RapidJSON](https://github.com/Tencent/rapidjson)
  - Can be added via vcpkg: `vcpkg install cjson rapidjson`

## Current Status

The current implementation provides **stub/skeleton** code that:
- ✅ Defines the complete API interface
- ✅ Compiles and builds successfully
- ✅ Can be loaded by the service
- ❌ Does NOT perform actual packet processing (WinDivert integration pending)
- ❌ Does NOT implement DPI desync techniques (pending)

This is intentional - it allows development and testing of the architecture without requiring full implementation.

## Building with Visual Studio

### Using CMake GUI

1. Open CMake GUI
2. Set source directory: `/path/to/native`
3. Set build directory: `/path/to/native/build`
4. Click "Configure" - select your Visual Studio version
5. Click "Generate"
6. Click "Open Project" to open in Visual Studio
7. Build the solution (F7)

### Using Command Line

```powershell
# From the native/ directory
mkdir build
cd build

# Generate project files
cmake .. -G "Visual Studio 17 2022" -A x64

# Build Debug
cmake --build . --config Debug

# Build Release
cmake --build . --config Release
```

## Building with MinGW

```bash
# From the native/ directory
mkdir build
cd build

# Generate Makefiles
cmake .. -G "MinGW Makefiles" -DCMAKE_BUILD_TYPE=Release

# Build
cmake --build .
```

## Build Outputs

After building, you'll find:

```
native/build/
├── RobBobNetEngine/
│   ├── Debug/
│   │   └── RobBobNetEngine.dll
│   └── Release/
│       └── RobBobNetEngine.dll
└── RobBobNetService/
    ├── Debug/
    │   └── RobBobNetService.exe
    └── Release/
        └── RobBobNetService.exe
```

## Testing the Build

### Test the Engine DLL

```cpp
// simple_test.cpp
#include "RobBobNetEngine/RobBobNetEngine.h"
#include <iostream>

int main() {
    if (Engine_Initialize("C:/ProgramData/RobBobNet/config") != 0) {
        std::cerr << "Init failed: " << Engine_GetLastError() << std::endl;
        return 1;
    }
    
    if (Engine_Start("general") != 0) {
        std::cerr << "Start failed: " << Engine_GetLastError() << std::endl;
        return 1;
    }
    
    EngineState state;
    Engine_GetState(&state);
    std::cout << "Running: " << (state.running ? "true" : "false") << std::endl;
    std::cout << "Mode: " << state.mode << std::endl;
    
    Engine_Stop();
    Engine_Cleanup();
    
    return 0;
}
```

Compile and run:
```bash
cl simple_test.cpp /I"native/RobBobNetEngine" /link "build/RobBobNetEngine/Release/RobBobNetEngine.lib"
simple_test.exe
```

### Test the Service

The service can be run as a console application for testing:

```bash
cd build/RobBobNetService/Release
./RobBobNetService.exe
```

Expected output:
```
Engine running: true, mode=general, uptime=0 s
```

## Deployment

Copy the built files to deployment locations:

```powershell
# Engine DLL
copy build\RobBobNetEngine\Release\RobBobNetEngine.dll C:\ProgramData\RobBobNet\bin\

# Service executable
copy build\RobBobNetService\Release\RobBobNetService.exe C:\ProgramData\RobBobNet\bin\

# WinDivert files (if using WinDivert)
copy dependencies\WinDivert\WinDivert.dll C:\ProgramData\RobBobNet\bin\
copy dependencies\WinDivert\WinDivert64.sys C:\ProgramData\RobBobNet\bin\
```

## Installing as Windows Service

```cmd
# Register the service
sc create RobBobNetService binPath= "C:\ProgramData\RobBobNet\bin\RobBobNetService.exe" start= auto

# Start the service
sc start RobBobNetService

# Check status
sc query RobBobNetService

# Stop the service
sc stop RobBobNetService

# Remove the service
sc delete RobBobNetService
```

## Next Steps for Full Implementation

To complete the engine implementation, you need to:

1. **Integrate WinDivert**
   - Link against WinDivert.lib
   - Implement packet capture loops
   - See `docs/ENGINE_SPEC.md` for details

2. **Implement Configuration Parser**
   - Add cJSON or RapidJSON
   - Parse `rules.json`
   - Load domain lists

3. **Implement Packet Processing**
   - TCP/UDP packet parsing
   - TLS SNI extraction
   - HTTP Host header extraction

4. **Implement DPI Desync Techniques**
   - Fake packet injection
   - TCP splitting
   - Multi-split with overlapping sequences

5. **Add Logging**
   - Write to `%ProgramData%\RobBobNet\logs\engine.log`
   - Implement log rotation

6. **Convert Service to Real Windows Service**
   - Implement ServiceMain
   - Implement ServiceCtrlHandler
   - Add IPC server (Named Pipe)
   - See `docs/SERVICE_SPEC.md` for details

## Troubleshooting

### CMake can't find Visual Studio

```bash
# List available generators
cmake --help

# Specify generator explicitly
cmake .. -G "Visual Studio 16 2019" -A x64
```

### Missing WinDivert

The current stub code doesn't require WinDivert, but the full implementation will. Download from:
https://github.com/basil00/Divert/releases

### Build Errors

Make sure you have:
- C++17 support enabled
- Proper include directories set
- Correct architecture (x64)

## References

- [ENGINE_SPEC.md](../docs/ENGINE_SPEC.md) - Complete engine specification
- [SERVICE_SPEC.md](../docs/SERVICE_SPEC.md) - Service implementation guide
- [ARCHITECTURE.md](../docs/ARCHITECTURE.md) - Overall system architecture
