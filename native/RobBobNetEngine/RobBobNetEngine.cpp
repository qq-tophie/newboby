#include "RobBobNetEngine.h"

#include <string>
#include <atomic>
#include <chrono>

namespace
{
    std::string g_configDir;
    std::string g_mode;
    std::string g_lastError;
    std::atomic<bool> g_running{false};
    std::chrono::steady_clock::time_point g_startTime;
}

extern "C" {

int Engine_Initialize(const char* config_dir)
{
    if (!config_dir)
    {
        g_lastError = "config_dir is null";
        return -1;
    }

    g_configDir = config_dir;
    g_lastError.clear();
    return 0;
}

int Engine_Start(const char* mode)
{
    if (!mode)
    {
        g_lastError = "mode is null";
        return -1;
    }

    g_mode = mode;
    g_running = true;
    g_startTime = std::chrono::steady_clock::now();
    g_lastError.clear();
    return 0;
}

int Engine_Stop(void)
{
    g_running = false;
    return 0;
}

int Engine_ApplyRules(const char* /*rules_path*/)
{
    // Stub: in real implementation this would re-parse rules.json.
    g_lastError.clear();
    return 0;
}

int Engine_GetState(EngineState* out_state)
{
    if (!out_state)
    {
        g_lastError = "out_state is null";
        return -1;
    }

    out_state->running = g_running.load();
#ifdef _WIN32
    strncpy_s(out_state->mode, sizeof(out_state->mode), g_mode.c_str(), _TRUNCATE);
#else
    snprintf(out_state->mode, sizeof(out_state->mode), "%s", g_mode.c_str());
#endif
    out_state->packets_processed = 0;
    out_state->packets_modified = 0;
    out_state->active_rules = 0;

    if (g_running)
    {
      auto now = std::chrono::steady_clock::now();
      out_state->uptime_seconds = std::chrono::duration_cast<std::chrono::seconds>(now - g_startTime).count();
    }
    else
    {
      out_state->uptime_seconds = 0;
    }

    g_lastError.clear();
    return 0;
}

int Engine_GetStats(EngineStats* out_stats)
{
    if (!out_stats)
    {
        g_lastError = "out_stats is null";
        return -1;
    }

    // Stub: fill with zeros; real implementation will track counters.
    *out_stats = EngineStats{};
    g_lastError.clear();
    return 0;
}

int Engine_ResetStats(void)
{
    // Stub: nothing to reset yet.
    g_lastError.clear();
    return 0;
}

const char* Engine_GetLastError(void)
{
    return g_lastError.empty() ? "" : g_lastError.c_str();
}

void Engine_Cleanup(void)
{
    g_running = false;
}

}

