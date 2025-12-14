#pragma once

// Minimal skeleton of RobBobNetEngine DLL.
// This matches the high-level API expected by the service and launcher,
// but only provides stub implementations. Real DPI / WinDivert logic
// should be implemented later following docs/ENGINE_SPEC.md.

#include <stdint.h>

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
    bool    running;
    char    mode[64];
    uint64_t packets_processed;
    uint64_t packets_modified;
    uint64_t uptime_seconds;
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

