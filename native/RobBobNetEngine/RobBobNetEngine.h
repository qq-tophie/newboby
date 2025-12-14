#pragma once

// Minimal but structured skeleton of RobBobNetEngine DLL.
// This matches the high-level API expected by the service and launcher,
// and provides a real state/config handling core without any DPI logic yet.
//
// The goals of this skeleton are:
// - Provide a stable exported C API matching docs/ENGINE_SPEC.md
// - Implement robust state management and error reporting
// - Validate configuration directory and rules.json presence
// - Be 100% safe to run without WinDivert or kernel privileges
//
// All low-level packet processing / WinDivert integration must be
// implemented later, following docs/ENGINE_SPEC.md.

#include <stdint.h>

// Keep basic error codes and version in sync with docs/ENGINE_SPEC.md

// Engine version reported to callers
#define ROBBOBNET_ENGINE_VERSION "0.9.0"

// Error / result codes
#define ENGINE_SUCCESS                 0
#define ENGINE_ERROR_INIT             -1
#define ENGINE_ERROR_CONFIG           -2
#define ENGINE_ERROR_DRIVER           -3
#define ENGINE_ERROR_MEMORY           -4
#define ENGINE_ERROR_RUNNING          -5
#define ENGINE_ERROR_NOT_RUNNING      -6
#define ENGINE_ERROR_INVALID_PARAM    -7

#ifdef _WIN32
  #ifdef ROBBOBNET_ENGINE_EXPORTS
    #define ROBBOBNET_API __declspec(dllexport)
  #else
    #define ROBBOBNET_API __declspec(dllimport)
  #endif
#else
  #define ROBBOBNET_API
#endif

extern "C" {

typedef struct EngineState
{
    // Whether the engine main loop is running
    bool    running;

    // Currently active mode name (e.g. "general", "ALT")
    char    mode[64];

    // Basic counters (will be populated once packet processing is added)
    uint64_t packets_processed;
    uint64_t packets_modified;

    // Uptime of the current run in seconds
    uint64_t uptime_seconds;

    // Number of active rules in current configuration
    int      active_rules;
} EngineState;

typedef struct EngineStats
{
    uint64_t udp_packets;
    uint64_t tcp_packets;
    uint64_t quic_packets;
    uint64_t tls_packets;
    uint64_t fake_sent;
    uint64_t split_sent;
    uint64_t dropped;
} EngineStats;

ROBBOBNET_API int Engine_Initialize(const char* config_dir);
ROBBOBNET_API int Engine_Start(const char* mode);
ROBBOBNET_API int Engine_Stop(void);
ROBBOBNET_API int Engine_ApplyRules(const char* rules_path);
ROBBOBNET_API int Engine_GetState(EngineState* out_state);
ROBBOBNET_API int Engine_GetStats(EngineStats* out_stats);
ROBBOBNET_API int Engine_ResetStats(void);
ROBBOBNET_API const char* Engine_GetLastError(void);
ROBBOBNET_API void Engine_Cleanup(void);

}
