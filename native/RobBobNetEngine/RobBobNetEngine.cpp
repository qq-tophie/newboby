#include "RobBobNetEngine.h"

#include <string>
#include <atomic>
#include <chrono>
#include <mutex>
#include <fstream>
#include <sstream>
#include <cstdio>

namespace
{
    std::string g_configDir;
    std::string g_mode;
    std::string g_lastError;
    std::atomic<bool> g_running{false};
    std::chrono::steady_clock::time_point g_startTime;

    // Basic counters (will be filled by real packet processing later)
    std::atomic<uint64_t> g_packetsProcessed{0};
    std::atomic<uint64_t> g_packetsModified{0};

    // Number of active rules loaded from rules.json
    std::atomic<int> g_activeRules{0};

    // Protects configDir, mode and lastError
    std::mutex g_stateMutex;

    void setError(const std::string& msg)
    {
        g_lastError = msg;
    }

    bool fileExists(const std::string& path)
    {
        std::ifstream f(path.c_str(), std::ios::binary);
        return f.good();
    }

    std::string buildRulesPath(const char* explicitPath)
    {
        if (explicitPath && explicitPath[0] != '\0')
        {
            return std::string(explicitPath);
        }

        if (g_configDir.empty())
        {
            return std::string();
        }

        std::string result = g_configDir;
        if (!result.empty())
        {
            char last = result.back();
            if (last != '/' && last != '\\')
            {
                result.push_back('/');
            }
        }
        result += "rules.json";
        return result;
    }

    // Very small, dependency-free "parser" that just counts how many
    // rule entries exist in the configuration. This is NOT a full JSON
    // parser, but it is enough to validate that the file is present and
    // non-empty and to derive an approximate rule count for diagnostics.
    bool loadConfigurationLocked(const char* explicitRulesPath)
    {
        const std::string rulesPath = buildRulesPath(explicitRulesPath);
        if (rulesPath.empty())
        {
            setError("configDir is empty");
            return false;
        }

        if (!fileExists(rulesPath))
        {
            setError("rules.json not found at: " + rulesPath);
            return false;
        }

        std::ifstream in(rulesPath.c_str(), std::ios::binary);
        if (!in)
        {
            setError("failed to open rules.json at: " + rulesPath);
            return false;
        }

        std::ostringstream buffer;
        buffer << in.rdbuf();
        const std::string contents = buffer.str();

        if (contents.empty())
        {
            setError("rules.json is empty at: " + rulesPath);
            return false;
        }

        // Heuristic: count occurrences of "\"id\"" as a proxy for
        // the number of rule objects. This is cheap and avoids pulling
        // in a full JSON library in the stub implementation.
        const std::string marker = "\"id\"";
        int ruleCount = 0;
        std::size_t pos = contents.find(marker);
        while (pos != std::string::npos)
        {
            ++ruleCount;
            pos = contents.find(marker, pos + marker.size());
        }

        if (ruleCount <= 0)
        {
            // Not fatal, but indicate suspicious configuration.
            setError("rules.json parsed but no rule ids found at: " + rulesPath);
            g_activeRules.store(0);
            return false;
        }

        g_activeRules.store(ruleCount);
        setError("");
        return true;
    }
}

extern "C" {

int Engine_Initialize(const char* config_dir)
{
    if (!config_dir || !config_dir[0])
    {
        setError("config_dir is null or empty");
        return ENGINE_ERROR_INVALID_PARAM;
    }

    std::lock_guard<std::mutex> lock(g_stateMutex);

    if (g_running.load())
    {
        setError("cannot initialize while engine is running");
        return ENGINE_ERROR_RUNNING;
    }

    g_configDir = config_dir;
    g_mode.clear();
    g_packetsProcessed.store(0);
    g_packetsModified.store(0);
    g_activeRules.store(0);

    if (!loadConfigurationLocked(nullptr))
    {
        // loadConfigurationLocked already set a descriptive error
        return ENGINE_ERROR_CONFIG;
    }

    setError("");
    return ENGINE_SUCCESS;
}

int Engine_Start(const char* mode)
{
    if (!mode || !mode[0])
    {
        setError("mode is null or empty");
        return ENGINE_ERROR_INVALID_PARAM;
    }

    std::lock_guard<std::mutex> lock(g_stateMutex);

    if (g_running.load())
    {
        setError("engine is already running");
        return ENGINE_ERROR_RUNNING;
    }

    if (g_configDir.empty())
    {
        setError("engine not initialized (configDir is empty)");
        return ENGINE_ERROR_INIT;
    }

    // Reload configuration before starting to ensure rules are available.
    if (!loadConfigurationLocked(nullptr))
    {
        return ENGINE_ERROR_CONFIG;
    }

    g_mode = mode;
    g_running.store(true);
    g_startTime = std::chrono::steady_clock::now();
    setError("");
    return ENGINE_SUCCESS;
}

int Engine_Stop(void)
{
    std::lock_guard<std::mutex> lock(g_stateMutex);
    g_running.store(false);
    setError("");
    return ENGINE_SUCCESS;
}

int Engine_ApplyRules(const char* /*rules_path*/)
{
    std::lock_guard<std::mutex> lock(g_stateMutex);

    if (g_configDir.empty())
    {
        setError("engine not initialized (configDir is empty)");
        return ENGINE_ERROR_INIT;
    }

    if (!loadConfigurationLocked(nullptr))
    {
        return ENGINE_ERROR_CONFIG;
    }

    setError("");
    return ENGINE_SUCCESS;
}

int Engine_GetState(EngineState* out_state)
{
    if (!out_state)
    {
        setError("out_state is null");
        return ENGINE_ERROR_INVALID_PARAM;
    }

    std::lock_guard<std::mutex> lock(g_stateMutex);

    out_state->running = g_running.load();
#ifdef _WIN32
    strncpy_s(out_state->mode, sizeof(out_state->mode), g_mode.c_str(), _TRUNCATE);
#else
    snprintf(out_state->mode, sizeof(out_state->mode), "%s", g_mode.c_str());
#endif
    out_state->packets_processed = g_packetsProcessed.load();
    out_state->packets_modified = g_packetsModified.load();
    out_state->active_rules     = g_activeRules.load();

    if (g_running)
    {
      auto now = std::chrono::steady_clock::now();
       out_state->uptime_seconds = std::chrono::duration_cast<std::chrono::seconds>(now - g_startTime).count();
    }
    else
    {
      out_state->uptime_seconds = 0;
    }

    setError("");
    return ENGINE_SUCCESS;
}

int Engine_GetStats(EngineStats* out_stats)
{
    if (!out_stats)
    {
        setError("out_stats is null");
        return ENGINE_ERROR_INVALID_PARAM;
    }

    // For now we only expose aggregate counters; real implementation
    // will track protocol-specific values.
    EngineStats stats{};
    stats.udp_packets   = 0;
    stats.tcp_packets   = 0;
    stats.quic_packets  = 0;
    stats.tls_packets   = 0;
    stats.fake_sent     = 0;
    stats.split_sent    = 0;
    stats.dropped       = 0;

    *out_stats = stats;
    setError("");
    return ENGINE_SUCCESS;
}

int Engine_ResetStats(void)
{
    g_packetsProcessed.store(0);
    g_packetsModified.store(0);
    setError("");
    return ENGINE_SUCCESS;
}

const char* Engine_GetLastError(void)
{
    return g_lastError.empty() ? "" : g_lastError.c_str();
}

void Engine_Cleanup(void)
{
    std::lock_guard<std::mutex> lock(g_stateMutex);
    g_running.store(false);
    g_mode.clear();
    g_configDir.clear();
    g_packetsProcessed.store(0);
    g_packetsModified.store(0);
    g_activeRules.store(0);
    setError("");
}

}
