/**
 * Engine Client - IPC Communication with RobBobNetService
 * 
 * This module provides a clean interface for the Electron main process
 * to communicate with the Windows Service via Named Pipe.
 */

const net = require('net');

const PIPE_NAME = '\\\\.\\pipe\\RobBobNet';
const TIMEOUT = 30000; // 30 seconds
const RETRY_DELAY = 2000; // 2 seconds
const MAX_RETRIES = 3;

class EngineClient {
  constructor() {
    this.connected = false;
    this.currentMode = null;
  }

  /**
   * Send command to service and wait for response
   * @param {Object} command - Command object to send
   * @returns {Promise<Object>} Response from service
   */
  async sendCommand(command, retries = MAX_RETRIES) {
    return new Promise((resolve, reject) => {
      const client = net.createConnection(PIPE_NAME);
      let responseData = '';
      let timeoutHandle;

      // Set timeout
      timeoutHandle = setTimeout(() => {
        client.destroy();
        reject(new Error('Command timeout'));
      }, TIMEOUT);

      // Handle connection
      client.on('connect', () => {
        const jsonCommand = JSON.stringify(command);
        client.write(jsonCommand);
      });

      // Handle data
      client.on('data', (data) => {
        responseData += data.toString();
      });

      // Handle end
      client.on('end', () => {
        clearTimeout(timeoutHandle);
        try {
          const response = JSON.parse(responseData);
          resolve(response);
        } catch (err) {
          reject(new Error('Invalid JSON response from service'));
        }
      });

      // Handle errors
      client.on('error', async (err) => {
        clearTimeout(timeoutHandle);
        
        // If connection refused and we have retries left
        if ((err.code === 'ENOENT' || err.code === 'ECONNREFUSED') && retries > 0) {
          console.log(`Connection failed, retrying in ${RETRY_DELAY}ms... (${retries} retries left)`);
          await new Promise(r => setTimeout(r, RETRY_DELAY));
          try {
            const result = await this.sendCommand(command, retries - 1);
            resolve(result);
          } catch (retryErr) {
            reject(retryErr);
          }
        } else {
          reject(new Error(`IPC Error: ${err.message}`));
        }
      });
    });
  }

  /**
   * Initialize the engine with configuration directory
   * @param {string} configDir - Path to configuration directory
   * @returns {Promise<Object>}
   */
  async initialize(configDir) {
    try {
      const response = await this.sendCommand({
        command: 'ENGINE_INIT',
        configDir: configDir
      });

      if (response.success) {
        console.log('Engine initialized successfully');
      }

      return response;
    } catch (err) {
      console.error('Failed to initialize engine:', err);
      return {
        success: false,
        error: err.message
      };
    }
  }

  /**
   * Start the engine with specified mode
   * @param {string} mode - Mode name (e.g., 'general', 'ALT')
   * @returns {Promise<Object>}
   */
  async start(mode) {
    try {
      const response = await this.sendCommand({
        command: 'ENGINE_START',
        mode: mode
      });

      if (response.success) {
        this.connected = true;
        this.currentMode = mode;
        console.log(`Engine started in mode: ${mode}`);
      }

      return response;
    } catch (err) {
      console.error('Failed to start engine:', err);
      return {
        success: false,
        error: err.message
      };
    }
  }

  /**
   * Stop the engine
   * @returns {Promise<Object>}
   */
  async stop() {
    try {
      const response = await this.sendCommand({
        command: 'ENGINE_STOP'
      });

      if (response.success) {
        this.connected = false;
        this.currentMode = null;
        console.log('Engine stopped');
      }

      return response;
    } catch (err) {
      console.error('Failed to stop engine:', err);
      return {
        success: false,
        error: err.message
      };
    }
  }

  /**
   * Get current engine state
   * @returns {Promise<Object>}
   */
  async getState() {
    try {
      const response = await this.sendCommand({
        command: 'ENGINE_GET_STATE'
      });

      if (response.success && response.state) {
        this.connected = response.state.running;
        this.currentMode = response.state.mode;
      }

      return response;
    } catch (err) {
      console.error('Failed to get engine state:', err);
      return {
        success: false,
        error: err.message,
        state: {
          running: false,
          mode: null
        }
      };
    }
  }

  /**
   * Apply new rules configuration
   * @param {string} rulesPath - Path to rules.json
   * @returns {Promise<Object>}
   */
  async applyRules(rulesPath) {
    try {
      const response = await this.sendCommand({
        command: 'ENGINE_APPLY_RULES',
        rulesPath: rulesPath
      });

      return response;
    } catch (err) {
      console.error('Failed to apply rules:', err);
      return {
        success: false,
        error: err.message
      };
    }
  }

  /**
   * Get engine statistics
   * @returns {Promise<Object>}
   */
  async getStats() {
    try {
      const response = await this.sendCommand({
        command: 'ENGINE_GET_STATS'
      });

      return response;
    } catch (err) {
      console.error('Failed to get stats:', err);
      return {
        success: false,
        error: err.message
      };
    }
  }

  /**
   * Check if service is available
   * @returns {Promise<boolean>}
   */
  async isServiceAvailable() {
    return new Promise((resolve) => {
      const client = net.createConnection(PIPE_NAME);
      
      client.on('connect', () => {
        client.destroy();
        resolve(true);
      });

      client.on('error', () => {
        resolve(false);
      });

      setTimeout(() => {
        client.destroy();
        resolve(false);
      }, 2000);
    });
  }

  /**
   * Get current connection status
   * @returns {Object}
   */
  getStatus() {
    return {
      connected: this.connected,
      mode: this.currentMode
    };
  }
}

// Export singleton instance
module.exports = new EngineClient();
