/**
 * RobBob Bootstrapper - Minimal Launcher
 * 
 * This small app:
 * 1. Checks if RobBob is installed locally
 * 2. Downloads/updates RobBob files from server
 * 3. Runs the main RobBob application
 */

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');
const { spawn, exec } = require('child_process');

// ============================================
// CONFIGURATION - CHANGE THESE URLs
// ============================================
const CONFIG = {
  // URL to version.json on your server
  versionUrl: 'https://your-server.com/robbob/version.json',
  
  // URL to download RobBob app archive
  appDownloadUrl: 'https://your-server.com/robbob/RobBob-App.zip',
  
  // Local paths
  appFolder: 'RobBob',           // Folder name for app files
  appExecutable: 'RobBob.exe',   // Main executable name
  versionFile: 'version.txt'     // Local version file
};

let mainWindow;
let isDownloading = false;

// Get paths
function getAppDataPath() {
  return path.join(app.getPath('userData'), '..', CONFIG.appFolder);
}

function getLocalVersionPath() {
  return path.join(getAppDataPath(), CONFIG.versionFile);
}

function getAppExecutablePath() {
  return path.join(getAppDataPath(), CONFIG.appExecutable);
}

// Create window
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 450,
    height: 300,
    frame: false,
    transparent: true,
    resizable: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.loadFile('src/index.html');
  mainWindow.center();
}

// Fetch JSON from URL
function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    
    const req = protocol.get(url, {
      headers: { 'User-Agent': 'RobBob-Bootstrapper' }
    }, (res) => {
      // Handle redirects
      if (res.statusCode === 301 || res.statusCode === 302) {
        fetchJson(res.headers.location).then(resolve).catch(reject);
        return;
      }
      
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error('Invalid JSON response'));
        }
      });
    });
    
    req.on('error', reject);
    req.setTimeout(15000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
  });
}

// Download file with progress
function downloadFile(url, destPath, onProgress) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    
    // Ensure directory exists
    const dir = path.dirname(destPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    const req = protocol.get(url, {
      headers: { 'User-Agent': 'RobBob-Bootstrapper' }
    }, (res) => {
      // Handle redirects
      if (res.statusCode === 301 || res.statusCode === 302) {
        downloadFile(res.headers.location, destPath, onProgress)
          .then(resolve).catch(reject);
        return;
      }
      
      const totalSize = parseInt(res.headers['content-length'], 10);
      let downloadedSize = 0;
      
      const file = fs.createWriteStream(destPath);
      
      res.on('data', (chunk) => {
        downloadedSize += chunk.length;
        file.write(chunk);
        
        if (totalSize && onProgress) {
          const percent = Math.round((downloadedSize / totalSize) * 100);
          onProgress(percent, downloadedSize, totalSize);
        }
      });
      
      res.on('end', () => {
        file.end();
        resolve();
      });
      
      res.on('error', (err) => {
        file.destroy();
        fs.unlinkSync(destPath);
        reject(err);
      });
    });
    
    req.on('error', reject);
  });
}

// Extract ZIP archive using PowerShell
function extractZip(zipPath, destPath) {
  return new Promise((resolve, reject) => {
    // Create destination folder if it doesn't exist
    if (!fs.existsSync(destPath)) {
      fs.mkdirSync(destPath, { recursive: true });
    }
    
    const cmd = `powershell -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${destPath}' -Force"`;
    
    exec(cmd, { windowsHide: true }, (err) => {
      // Delete zip file after extraction
      try {
        fs.unlinkSync(zipPath);
      } catch (e) {}
      
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

// Get local version
function getLocalVersion() {
  try {
    const versionPath = getLocalVersionPath();
    if (fs.existsSync(versionPath)) {
      return fs.readFileSync(versionPath, 'utf-8').trim();
    }
  } catch (e) {}
  return null;
}

// Save local version
function saveLocalVersion(version) {
  try {
    const versionPath = getLocalVersionPath();
    const dir = path.dirname(versionPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(versionPath, version);
  } catch (e) {
    console.error('Failed to save version:', e);
  }
}

// Check if app is installed
function isAppInstalled() {
  return fs.existsSync(getAppExecutablePath());
}

// Run the main app
function runApp() {
  const exePath = getAppExecutablePath();
  
  if (!fs.existsSync(exePath)) {
    sendStatus('error', 'Приложение не найдено');
    return;
  }
  
  sendStatus('status', 'Запуск...');
  
  // Spawn the app and exit bootstrapper
  const child = spawn(exePath, [], {
    detached: true,
    stdio: 'ignore',
    cwd: getAppDataPath()
  });
  
  child.unref();
  
  // Close bootstrapper after short delay
  setTimeout(() => {
    app.quit();
  }, 500);
}

// Send status to renderer
function sendStatus(type, message, progress = null) {
  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.send('status', { type, message, progress });
  }
}

// Main bootstrap process
async function bootstrap() {
  try {
    sendStatus('status', 'Проверка обновлений...');
    
    // Get server version
    let serverVersion = null;
    let downloadUrl = CONFIG.appDownloadUrl;
    
    try {
      const versionInfo = await fetchJson(CONFIG.versionUrl);
      serverVersion = versionInfo.version;
      if (versionInfo.downloadUrl) {
        downloadUrl = versionInfo.downloadUrl;
      }
    } catch (e) {
      console.log('Failed to fetch version info:', e.message);
      // If we can't reach server but app is installed, just run it
      if (isAppInstalled()) {
        runApp();
        return;
      }
      sendStatus('error', 'Не удалось подключиться к серверу');
      return;
    }
    
    const localVersion = getLocalVersion();
    const needsDownload = !isAppInstalled() || (serverVersion && serverVersion !== localVersion);
    
    if (needsDownload) {
      isDownloading = true;
      
      sendStatus('status', 'Загрузка обновления...', 0);
      
      const tempZip = path.join(app.getPath('temp'), 'robbob-update.zip');
      
      // Download the app
      await downloadFile(downloadUrl, tempZip, (percent) => {
        sendStatus('status', `Загрузка: ${percent}%`, percent);
      });
      
      sendStatus('status', 'Распаковка файлов...', 100);
      
      // Extract
      await extractZip(tempZip, getAppDataPath());
      
      // Save version
      if (serverVersion) {
        saveLocalVersion(serverVersion);
      }
      
      isDownloading = false;
    }
    
    // Run the app
    runApp();
    
  } catch (err) {
    console.error('Bootstrap error:', err);
    isDownloading = false;
    sendStatus('error', `Ошибка: ${err.message}`);
  }
}

// IPC handlers
ipcMain.handle('retry', () => {
  bootstrap();
});

ipcMain.on('window-close', () => {
  app.quit();
});

// App lifecycle
app.whenReady().then(() => {
  createWindow();
  
  // Start bootstrap after window loads
  mainWindow.webContents.on('did-finish-load', () => {
    bootstrap();
  });
});

app.on('window-all-closed', () => {
  app.quit();
});
