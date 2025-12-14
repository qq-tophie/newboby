# RobBobNetEngine.dll Specification

## Overview

The Network Engine DLL is a user-mode library that implements DPI bypass techniques using WinDivert. It provides a C API for the Windows Service to control packet processing.

## Requirements

- **Language:** C/C++
- **Platform:** Windows x64
- **Dependencies:**
  - WinDivert 2.2+ (WinDivert.dll, WinDivert64.sys)
  - JSON parser (e.g., cJSON, RapidJSON)
  - PCRE2 or similar for regex support (optional)

## API Specification

### Header File: `RobBobNetEngine.h`

```c
#ifndef ROBBOBNET_ENGINE_H
#define ROBBOBNET_ENGINE_H

#include <stdint.h>
#include <stdbool.h>

#ifdef __cplusplus
extern "C" {
#endif

// Version
#define ROBBOBNET_ENGINE_VERSION "0.9.0"

// Error codes
#define ENGINE_SUCCESS           0
#define ENGINE_ERROR_INIT       -1
#define ENGINE_ERROR_CONFIG     -2
#define ENGINE_ERROR_DRIVER     -3
#define ENGINE_ERROR_MEMORY     -4
#define ENGINE_ERROR_RUNNING    -5
#define ENGINE_ERROR_NOT_RUNNING -6
#define ENGINE_ERROR_INVALID_PARAM -7

// Engine state structure
typedef struct {
    bool running;
    char mode[64];
    uint64_t packets_processed;
    uint64_t packets_modified;
    uint64_t uptime_seconds;
    int active_rules;
} EngineState;

// Statistics structure
typedef struct {
    uint64_t udp_packets;
    uint64_t tcp_packets;
    uint64_t quic_packets;
    uint64_t tls_packets;
    uint64_t fake_sent;
    uint64_t split_sent;
    uint64_t dropped;
} EngineStats;

/**
 * Initialize the engine with configuration directory
 * 
 * @param config_dir Path to configuration directory containing rules.json
 * @return ENGINE_SUCCESS on success, error code otherwise
 */
int Engine_Initialize(const char* config_dir);

/**
 * Start the engine with specified mode
 * 
 * @param mode Mode name from rules.json (e.g., "general", "ALT")
 * @return ENGINE_SUCCESS on success, error code otherwise
 */
int Engine_Start(const char* mode);

/**
 * Stop the engine and release resources
 * 
 * @return ENGINE_SUCCESS on success, error code otherwise
 */
int Engine_Stop(void);

/**
 * Reload and apply rules from configuration
 * 
 * @param rules_path Path to rules.json file
 * @return ENGINE_SUCCESS on success, error code otherwise
 */
int Engine_ApplyRules(const char* rules_path);

/**
 * Get current engine state
 * 
 * @param out_state Pointer to EngineState structure to fill
 * @return ENGINE_SUCCESS on success, error code otherwise
 */
int Engine_GetState(EngineState* out_state);

/**
 * Get engine statistics
 * 
 * @param out_stats Pointer to EngineStats structure to fill
 * @return ENGINE_SUCCESS on success, error code otherwise
 */
int Engine_GetStats(EngineStats* out_stats);

/**
 * Reset statistics counters
 * 
 * @return ENGINE_SUCCESS on success, error code otherwise
 */
int Engine_ResetStats(void);

/**
 * Get last error message
 * 
 * @return Pointer to static error message string
 */
const char* Engine_GetLastError(void);

/**
 * Cleanup and release all resources
 * Must be called before unloading DLL
 */
void Engine_Cleanup(void);

#ifdef __cplusplus
}
#endif

#endif // ROBBOBNET_ENGINE_H
```

## Implementation Requirements

### 1. Configuration Loading

The engine must:
- Parse `rules.json` using a JSON library
- Validate all required fields
- Load domain lists from files
- Resolve relative paths based on config directory
- Handle missing or malformed files gracefully

### 2. WinDivert Integration

```c
// Example filter construction from rules.json
const char* buildWinDivertFilter(const Rule* rules, int rule_count) {
    // Build filter string like:
    // "tcp.DstPort == 80 or tcp.DstPort == 443 or udp.DstPort == 443"
    // Based on all active rules
}
```

**WinDivert Handle Management:**
- One handle per rule or group of related rules
- Use `WINDIVERT_FLAG_SNIFF` for inspection
- Use `WINDIVERT_FLAG_DROP` for filtering
- Set appropriate priority levels

### 3. Packet Processing

**Worker Thread Architecture:**
```
┌─────────────────┐
│  Main Thread    │
│  (Control)      │
└────────┬────────┘
         │
    ┌────▼─────┬─────────┬─────────┐
    │ Worker 1 │ Worker 2│ Worker N│
    │ (UDP)    │ (TCP)   │ (...)   │
    └──────────┴─────────┴─────────┘
         │         │          │
         └─────────┴──────────┘
                   │
           ┌───────▼────────┐
           │   WinDivert    │
           │   Handles      │
           └────────────────┘
```

**Packet Processing Loop:**
```c
void packet_worker_thread(void* param) {
    HANDLE handle = (HANDLE)param;
    unsigned char packet[MAX_PACKET_SIZE];
    UINT packet_len;
    WINDIVERT_ADDRESS addr;
    
    while (engine_running) {
        // Receive packet
        if (!WinDivertRecv(handle, packet, sizeof(packet), 
                          &packet_len, &addr)) {
            continue;
        }
        
        // Parse packet
        PWINDIVERT_IPHDR ip_header;
        PWINDIVERT_TCPHDR tcp_header;
        PWINDIVERT_UDPHDR udp_header;
        PVOID payload;
        UINT payload_len;
        
        WinDivertHelperParsePacket(packet, packet_len, &ip_header,
                                  NULL, NULL, NULL, &tcp_header,
                                  &udp_header, &payload, &payload_len);
        
        // Apply rules
        if (should_process_packet(ip_header, tcp_header, udp_header)) {
            apply_desync_technique(packet, &packet_len, &addr);
        }
        
        // Reinject packet
        WinDivertSend(handle, packet, packet_len, NULL, &addr);
    }
}
```

### 4. DPI Desync Techniques

#### 4.1 Fake Packet Injection

```c
void send_fake_packet(HANDLE handle, const Rule* rule, 
                     const Packet* original) {
    unsigned char fake[MAX_PACKET_SIZE];
    
    // Load fake payload from file
    load_fake_payload(rule->desync.fake_payload, fake, &fake_len);
    
    // Construct fake packet with same headers
    construct_fake_packet(original, fake, fake_len);
    
    // Send multiple times if repeats specified
    for (int i = 0; i < rule->desync.repeats; i++) {
        WinDivertSend(handle, fake, fake_len, NULL, &addr);
    }
}
```

#### 4.2 TCP Split

```c
void split_tcp_packet(HANDLE handle, const Rule* rule,
                     unsigned char* packet, UINT* packet_len,
                     WINDIVERT_ADDRESS* addr) {
    // Calculate split position
    int split_pos = rule->desync.split_pos;
    
    // Create two packets
    unsigned char part1[MAX_PACKET_SIZE];
    unsigned char part2[MAX_PACKET_SIZE];
    
    split_packet(packet, *packet_len, split_pos, part1, part2);
    
    // Send first part
    WinDivertSend(handle, part1, part1_len, NULL, addr);
    
    // Optional: send fake between parts
    if (rule->desync.fake_payload) {
        send_fake_packet(handle, rule, packet);
    }
    
    // Send second part
    WinDivertSend(handle, part2, part2_len, NULL, addr);
}
```

#### 4.3 Multi-Split with Sequence Overlap

```c
void multisplit_tcp_packet(HANDLE handle, const Rule* rule,
                          unsigned char* packet, UINT* packet_len,
                          WINDIVERT_ADDRESS* addr) {
    // Split packet with overlapping sequence numbers
    // This is more complex and requires TCP sequence manipulation
    
    PWINDIVERT_TCPHDR tcp = get_tcp_header(packet);
    uint32_t original_seq = ntohl(tcp->SeqNum);
    
    // Create overlapping segments
    // Implementation based on zapret's multisplit logic
}
```

### 5. Host List Filtering

**Domain Matching:**
```c
bool should_process_packet(const Packet* packet, const Rule* rule) {
    // Extract hostname from SNI (TLS) or Host header (HTTP)
    const char* hostname = extract_hostname(packet);
    
    if (hostname == NULL) {
        return false;
    }
    
    // Check against hostlist
    if (rule->host_list && !match_hostlist(hostname, rule->host_list)) {
        return false;
    }
    
    // Check exclusions
    if (rule->host_list_exclude && 
        match_hostlist(hostname, rule->host_list_exclude)) {
        return false;
    }
    
    return true;
}
```

**Domain List Format:**
- One domain per line
- Support wildcards: `*.google.com`
- Support exact match: `www.google.com`
- Comments start with `#`

### 6. Logging

```c
typedef enum {
    LOG_ERROR,
    LOG_WARN,
    LOG_INFO,
    LOG_DEBUG
} LogLevel;

void engine_log(LogLevel level, const char* format, ...);
```

**Log File Location:** `%ProgramData%\RobBobNet\logs\engine.log`

**Log Rotation:** Implement size-based rotation (e.g., 10 MB max)

### 7. Thread Safety

- Use mutexes for shared state
- Atomic operations for statistics counters
- Proper cleanup on thread termination

### 8. Error Handling

- Validate all input parameters
- Check WinDivert function return values
- Store last error message in thread-local storage
- Never crash the service process

## Testing Requirements

### Unit Tests
- Configuration parsing
- Packet parsing
- Filter construction
- Domain matching

### Integration Tests
- WinDivert handle management
- Packet interception
- Fake packet generation
- TCP splitting

### Performance Tests
- Throughput under load
- Memory usage
- CPU usage
- Latency impact

## Build Configuration

**Compiler:** MSVC 2019+ or MinGW-w64

**Compiler Flags:**
```
/O2          # Optimize for speed
/GL          # Whole program optimization
/MT          # Static runtime
/W4          # Warning level 4
/WX          # Treat warnings as errors
```

**Linker Flags:**
```
/OPT:REF     # Eliminate unused functions
/OPT:ICF     # Identical COMDAT folding
/LTCG        # Link-time code generation
```

**Dependencies:**
- WinDivert.lib
- ws2_32.lib (Winsock)
- advapi32.lib (Windows API)

## Distribution

Package as:
```
RobBobNetEngine/
├── RobBobNetEngine.dll
├── RobBobNetEngine.h
└── README.txt
```

## Example Usage

```c
#include "RobBobNetEngine.h"

int main() {
    // Initialize
    int result = Engine_Initialize("C:\\ProgramData\\RobBobNet\\config");
    if (result != ENGINE_SUCCESS) {
        printf("Init failed: %s\n", Engine_GetLastError());
        return 1;
    }
    
    // Start with mode
    result = Engine_Start("general");
    if (result != ENGINE_SUCCESS) {
        printf("Start failed: %s\n", Engine_GetLastError());
        Engine_Cleanup();
        return 1;
    }
    
    // Run for some time
    Sleep(60000);
    
    // Get stats
    EngineStats stats;
    Engine_GetStats(&stats);
    printf("Processed: %llu packets\n", stats.udp_packets + stats.tcp_packets);
    
    // Stop
    Engine_Stop();
    Engine_Cleanup();
    
    return 0;
}
```

## Security Considerations

1. **Input Validation:** Sanitize all file paths and configuration values
2. **Buffer Overflows:** Use safe string functions (strncpy, snprintf)
3. **Integer Overflows:** Check all arithmetic operations
4. **Memory Leaks:** Proper cleanup on all code paths
5. **Privilege Escalation:** Run with minimum required privileges

## Performance Targets

- **Throughput:** Handle 1 Gbps with <5% CPU usage
- **Latency:** Add <1ms to packet processing
- **Memory:** Use <100 MB RAM under normal load
- **Startup:** Initialize in <2 seconds

## Future Enhancements

- [ ] QUIC v2 support
- [ ] HTTP/3 detection
- [ ] Dynamic rule updates without restart
- [ ] Advanced statistics and monitoring
- [ ] Custom protocol detection plugins
