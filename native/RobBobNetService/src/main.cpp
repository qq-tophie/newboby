// Minimal skeleton for RobBobNetService.
// This is implemented as a simple console application that:
// - Initializes RobBobNetEngine
// - Starts the engine in a default mode
// - Prints basic state to stdout
//
// In production this should be converted into a real Windows Service
// following the design in docs/SERVICE_SPEC.md.

#include "../../RobBobNetEngine/RobBobNetEngine.h"

#include <cstdio>

int main()
{
    const char* configDir = "C:/ProgramData/RobBobNet/config";

    if (Engine_Initialize(configDir) != 0)
    {
        std::printf("Engine_Initialize failed: %s\n", Engine_GetLastError());
        return 1;
    }

    if (Engine_Start("general") != 0)
    {
        std::printf("Engine_Start failed: %s\n", Engine_GetLastError());
        return 1;
    }

    EngineState state{};
    if (Engine_GetState(&state) == 0)
    {
        std::printf("Engine running: %s, mode=%s, uptime=%llu s\n",
                    state.running ? "true" : "false",
                    state.mode,
                    static_cast<unsigned long long>(state.uptime_seconds));
    }

    Engine_Stop();
    Engine_Cleanup();

    return 0;
}

