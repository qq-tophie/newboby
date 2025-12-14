const { app, BrowserWindow, ipcMain, shell, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const { exec, spawn, execFile } = require('child_process');
const Store = require('electron-store');

const store = new Store();

// ============================================
// SINGLE INSTANCE LOCK - только один лаунчер
// ============================================
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  // Уже запущен другой экземпляр - выходим
  app.quit();
} else {
  // Когда пытаются запустить второй экземпляр - показываем окно первого
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

let mainWindow;
let tray = null;
let winwsProcess = null;

// Проверка прав администратора на Windows
function isAdmin() {
  if (process.platform !== 'win32') return true;

  try {
    // Попытка записи в системную папку - проверка прав
    execFile('net', ['session'], { windowsHide: true }, (err) => {});
    return true;
  } catch (e) {
    return false;
  }
}

// Перезапуск приложения с правами администратора
function restartAsAdmin() {
  if (process.platform !== 'win32') return;

  const appPath = app.getPath('exe');

  // Используем PowerShell для запуска с правами админа
  const args = process.argv.slice(1);
  const argsStr = args.map(a => `"${a}"`).join(' ');

  spawn('powershell.exe', [
    '-Command',
    `Start-Process -FilePath "${appPath}" -ArgumentList '${argsStr}' -Verb RunAs`
  ], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true
  });

  app.quit();
}

// Проверяем права администратора при запуске
if (process.platform === 'win32' && !process.argv.includes('--no-admin-check')) {
  // Проверка через создание тестового файла в системной папке
  const testPath = path.join(process.env.SystemRoot || 'C:\\Windows', 'temp', 'admin_test_' + process.pid);

  try {
    fs.writeFileSync(testPath, 'test');
    fs.unlinkSync(testPath);
    // Права есть, продолжаем
  } catch (e) {
    // Нет прав администратора - перезапускаем
    console.log('Requesting administrator privileges...');
    restartAsAdmin();
  }
}

// СРАЗУ убиваем все существующие winws.exe при старте лаунчера
if (process.platform === 'win32') {
  try {
    require('child_process').execSync('taskkill /F /IM winws.exe 2>nul', {
      windowsHide: true,
      stdio: 'ignore'
    });
    console.log('Killed existing winws.exe processes');
  } catch (e) {
    // Процесс не найден - это нормально
  }
}

// Конфигурация режимов обхода
// Каждый режим содержит аргументы для winws.exe
const BYPASS_MODES = {
  'general': {
    name: 'Обычный',
    description: 'Стандартный режим для большинства провайдеров'
  },
  'ALT': {
    name: 'ALT',
    description: 'Альтернативный режим с fake+fakedsplit'
  },
  'ALT2': {
    name: 'ALT2',
    description: 'Альтернативный режим 2'
  },
  'ALT3': {
    name: 'ALT3',
    description: 'Альтернативный режим 3'
  },
  'ALT4': {
    name: 'ALT4',
    description: 'Альтернативный режим 4'
  },
  'ALT5': {
    name: 'ALT5',
    description: 'Упрощённый режим'
  },
  'ALT6': {
    name: 'ALT6',
    description: 'Альтернативный режим 6'
  },
  'ALT7': {
    name: 'ALT7',
    description: 'Альтернативный режим 7'
  },
  'ALT8': {
    name: 'ALT8',
    description: 'Альтернативный режим 8'
  },
  'ALT9': {
    name: 'ALT9',
    description: 'Альтернативный режим 9'
  },
  'ALT10': {
    name: 'ALT10',
    description: 'Альтернативный режим 10'
  }
};

// Путь к встроенному bypass
function getBypassPath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'bypass');
  }
  return path.join(__dirname, 'resources', 'bypass');
}

function createWindow() {
  // Build window options
  const windowOptions = {
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    transparent: false,
    backgroundColor: '#0a0b0f',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  };

  // Add icon only if it exists
  const iconPath = path.join(__dirname, 'assets', 'icon.png');
  const icoPath = path.join(__dirname, 'assets', 'icon.ico');
  
  if (process.platform === 'win32' && fs.existsSync(icoPath)) {
    windowOptions.icon = icoPath;
  } else if (fs.existsSync(iconPath)) {
    windowOptions.icon = iconPath;
  }

  mainWindow = new BrowserWindow(windowOptions);

  mainWindow.loadFile('src/index.html');

  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
}

function createTray() {
  // Try to load icon, use fallback if not found
  let trayIcon;
  const iconPath = path.join(__dirname, 'assets', 'icon.png');
  const icoPath = path.join(__dirname, 'assets', 'icon.ico');
  
  try {
    if (process.platform === 'win32' && fs.existsSync(icoPath)) {
      trayIcon = nativeImage.createFromPath(icoPath);
    } else if (fs.existsSync(iconPath)) {
      trayIcon = nativeImage.createFromPath(iconPath);
    } else {
      // Create a simple fallback icon (16x16 purple square)
      trayIcon = nativeImage.createFromDataURL('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAHklEQVQ4jWNgGAWjYBSMglEwCkbBKBgFo2AUDAYAAAPgAAEeqVKiAAAAAElFTkSuQmCC');
    }
  } catch (err) {
    console.error('Error loading tray icon:', err);
    // Create a simple fallback icon
    trayIcon = nativeImage.createFromDataURL('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAHklEQVQ4jWNgGAWjYBSMglEwCkbBKBgFo2AUDAYAAAPgAAEeqVKiAAAAAElFTkSuQmCC');
  }

  try {
    tray = new Tray(trayIcon);
  } catch (err) {
    console.error('Failed to create tray:', err);
    return;
  }

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Развернуть',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      }
    },
    {
      label: 'Запустить Roblox',
      click: () => launchRoblox()
    },
    { type: 'separator' },
    {
      label: 'Сетевой режим: Вкл',
      click: () => startBypass()
    },
    {
      label: 'Сетевой режим: Выкл',
      click: () => stopBypass()
    },
    { type: 'separator' },
    {
      label: 'Закрыть',
      click: () => {
        app.isQuitting = true;
        stopBypass();
        app.quit();
      }
    }
  ]);

  tray.setToolTip('RobBob Launcher');
  tray.setContextMenu(contextMenu);

  // Single click shows context menu (default behavior)
  // Double click opens the window
  tray.on('double-click', () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });

  // On single click, also show the window on Windows
  tray.on('click', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.focus();
      } else {
        mainWindow.show();
        mainWindow.focus();
      }
    }
  });
}

function launchRoblox() {
  shell.openExternal('roblox-player:1+launchmode').catch(err => {
    console.error('Failed to launch Roblox:', err);
  });
}

// Проверка наличия файлов bypass
function checkBypassFiles() {
  const bypassPath = getBypassPath();
  const winwsPath = path.join(bypassPath, 'bin', 'winws.exe');
  try {
    return fs.existsSync(winwsPath);
  } catch (err) {
    return false;
  }
}

// Получить имя bat файла для режима
function getBatFileName(mode) {
  if (mode === 'general') {
    return 'general.bat';
  }
  return `general (${mode}).bat`;
}

// Helper function to quote paths with spaces for command line
function quotePath(p) {
  // On Windows, wrap paths containing spaces in double quotes
  if (process.platform === 'win32' && p.includes(' ')) {
    return `"${p}"`;
  }
  return p;
}

// Парсинг BAT файла для извлечения аргументов winws.exe
function parseWinwsArgsFromBat(batPath, bypassPath) {
  try {
    const content = fs.readFileSync(batPath, 'utf-8');
    const binPath = path.join(bypassPath, 'bin');
    const listsPath = path.join(bypassPath, 'lists');

    // Ищем строку с winws.exe и извлекаем аргументы
    const lines = content.split('\n');
    let argsLine = '';

    for (const line of lines) {
      if (line.includes('winws.exe')) {
        argsLine = line;
        // Собираем многострочные команды (с ^)
        let i = lines.indexOf(line);
        while (argsLine.trim().endsWith('^') && i < lines.length - 1) {
          i++;
          argsLine = argsLine.trim().slice(0, -1) + ' ' + lines[i];
        }
        break;
      }
    }

    if (!argsLine) return null;

    // Извлекаем аргументы после winws.exe
    const match = argsLine.match(/winws\.exe["']?\s+(.+)/i);
    if (!match) return null;

    let argsStr = match[1];

    // Заменяем переменные на реальные пути
    argsStr = argsStr.replace(/%BIN%/gi, binPath + '\\');
    argsStr = argsStr.replace(/%LISTS%/gi, listsPath + '\\');
    argsStr = argsStr.replace(/%GameFilter%/gi, ''); // Убираем gamefilter placeholder

    // Парсим аргументы, учитывая кавычки
    const args = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < argsStr.length; i++) {
      const char = argsStr[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if ((char === ' ' || char === '\t') && !inQuotes) {
        if (current.trim()) {
          args.push(current.trim());
        }
        current = '';
      } else if (char !== '^' && char !== '\r') {
        current += char;
      }
    }
    if (current.trim()) args.push(current.trim());

    // Фильтруем пустые аргументы
    return args.filter(a => a && a !== '--new' || a === '--new');

  } catch (err) {
    console.error('Error parsing BAT file:', err);
    return null;
  }
}

// ============================================
// ZAPRET / WINWS.EXE - НАДЕЖНАЯ РЕАЛИЗАЦИЯ
// Запуск обхода DPI блокировок
// ============================================

/**
 * Проверка всех необходимых файлов перед запуском
 */
function verifyBypassFiles(bypassPath) {
  const requiredFiles = [
    path.join(bypassPath, 'bin', 'winws.exe'),
    path.join(bypassPath, 'bin', 'WinDivert.dll'),
    path.join(bypassPath, 'bin', 'WinDivert64.sys'),
    path.join(bypassPath, 'lists', 'list-general.txt')
  ];
  
  const missing = [];
  for (const file of requiredFiles) {
    if (!fs.existsSync(file)) {
      missing.push(path.basename(file));
    }
  }
  
  if (missing.length > 0) {
    console.error('Missing bypass files:', missing);
    return { ok: false, missing };
  }
  
  return { ok: true };
}

/**
 * Получить аргументы для winws.exe
 * Используем проверенные рабочие аргументы
 */
function getWinwsArgs(bypassPath, mode) {
  const binPath = path.join(bypassPath, 'bin');
  const listsPath = path.join(bypassPath, 'lists');
  
  // Базовые аргументы которые работают для большинства провайдеров
  // Основано на zapret project (bol-van/zapret)
  const baseArgs = [
    // Фильтр для UDP (QUIC)
    '--wf-tcp=80,443',
    '--wf-udp=443,50000-65535',
    
    // Обработка QUIC трафика
    '--filter-udp=443',
    '--hostlist=' + path.join(listsPath, 'list-general.txt'),
    '--dpi-desync=fake',
    '--dpi-desync-repeats=6',
    '--dpi-desync-fake-quic=' + path.join(binPath, 'quic_initial_www_google_com.bin'),
    '--new',
    
    // UDP для игр (Roblox использует UDP 50000-65535)
    '--filter-udp=50000-65535',
    '--dpi-desync=fake',
    '--dpi-desync-repeats=6',
    '--new',
    
    // TCP трафик (HTTP/HTTPS)
    '--filter-tcp=80,443',
    '--hostlist=' + path.join(listsPath, 'list-general.txt'),
    '--dpi-desync=fake,split2',
    '--dpi-desync-split-seqovl=1',
    '--dpi-desync-split-pos=1',
    '--dpi-desync-fake-tls=' + path.join(binPath, 'tls_clienthello_www_google_com.bin')
  ];
  
  return baseArgs;
}

/**
 * Запуск winws.exe через BAT файл (самый надежный способ)
 * BAT файл сам устанавливает правильные пути и переменные
 */
function startBypassViaBat(mode, bypassPath) {
  const batFileName = getBatFileName(mode);
  const batPath = path.join(bypassPath, batFileName);
  
  if (!fs.existsSync(batPath)) {
    console.error('BAT file not found:', batPath);
    return false;
  }
  
  console.log('Starting bypass via BAT:', batPath);
  
  try {
    // На Windows запускаем BAT через PowerShell + Start-Process с полностью скрытым окном,
    // чтобы гарантированно не появлялись дополнительные окна (findstr, cmd и т.п.)
    if (process.platform === 'win32') {
      const psCommand = `Start-Process -FilePath '${batPath}' -WindowStyle Hidden`;

      const child = spawn('powershell.exe', [
        '-NoProfile',
        '-WindowStyle', 'Hidden',
        '-Command', psCommand
      ], {
        cwd: bypassPath,
        windowsHide: true,
        detached: true,
        stdio: 'ignore'
      });

      child.unref();
      return true;
    }

    // На других платформах (теоретически) используем старую схему через cmd
    const child = spawn('cmd.exe', ['/c', batPath], {
      cwd: bypassPath,
      windowsHide: true,
      detached: true,
      stdio: 'ignore',
      shell: false
    });

    child.unref();
    return true;
  } catch (err) {
    console.error('Failed to start via BAT:', err);
    return false;
  }
}

/**
 * Запуск winws.exe напрямую (fallback)
 */
function startBypassDirect(bypassPath) {
  const winwsPath = path.join(bypassPath, 'bin', 'winws.exe');
  const binPath = path.join(bypassPath, 'bin');
  const args = getWinwsArgs(bypassPath, 'general');
  
  console.log('Starting winws.exe directly...');
  console.log('Path:', winwsPath);
  console.log('Args count:', args.length);
  
  try {
    // На Windows запускаем через PowerShell + Start-Process с полностью скрытым окном,
    // чтобы гарантированно не мигало консольное окно даже при прямом запуске
    if (process.platform === 'win32') {
      const psArgs = args.join(' ');
      const psCommand = `Start-Process -FilePath '${winwsPath}' -ArgumentList '${psArgs}' -WindowStyle Hidden`;

      const child = spawn('powershell.exe', [
        '-NoProfile',
        '-WindowStyle', 'Hidden',
        '-Command', psCommand
      ], {
        cwd: binPath,
        windowsHide: true,
        detached: true,
        stdio: 'ignore'
      });

      child.unref();
      return true;
    }

    // На других платформах (теоретически) пробуем прямой spawn
    winwsProcess = spawn(winwsPath, args, {
      cwd: binPath,
      windowsHide: true,
      detached: true,
      stdio: 'ignore',
      shell: false
    });

    winwsProcess.unref();

    winwsProcess.on('error', (err) => {
      console.error('winws.exe spawn error:', err);
      winwsProcess = null;
    });

    return true;
  } catch (err) {
    console.error('Failed to spawn winws.exe:', err);
    return false;
  }
}

/**
 * Главная функция запуска bypass
 */
function startBypass(mode = null) {
  const bypassPath = getBypassPath();
  const selectedMode = mode || store.get('bypassMode', 'general');
  
  console.log('=== Starting Bypass ===');
  console.log('Bypass path:', bypassPath);
  console.log('Mode:', selectedMode);
  
  // Проверяем файлы
  const verification = verifyBypassFiles(bypassPath);
  if (!verification.ok) {
    console.error('Bypass files verification failed');
    if (mainWindow) {
      mainWindow.webContents.send('network-status', {
        running: false,
        error: 'Отсутствуют файлы: ' + verification.missing.join(', ')
      });
    }
    return;
  }
  
  // Убиваем существующие процессы
  killAllWinwsSync();
  
  // Пробуем запустить через BAT (самый надежный способ)
  let started = startBypassViaBat(selectedMode, bypassPath);
  
  // Если BAT не сработал, пробуем напрямую
  if (!started) {
    console.log('BAT method failed, trying direct spawn...');
    started = startBypassDirect(bypassPath);
  }
  
  // Проверяем результат через 3 секунды
  setTimeout(async () => {
    const isRunning = await checkBypassRunning();
    
    console.log('Bypass check result:', isRunning);
    store.set('bypassRunning', isRunning);
    
    if (mainWindow) {
      mainWindow.webContents.send('network-status', {
        running: isRunning,
        mode: selectedMode,
        error: isRunning ? null : 'Не удалось запустить обход. Проверьте права администратора.'
      });
    }
  }, 3000);
  
  // Оптимистичное обновление UI
  if (mainWindow) {
    mainWindow.webContents.send('network-status', { running: true, mode: selectedMode });
  }
}

/**
 * Синхронное завершение всех winws процессов
 */
function killAllWinwsSync() {
  try {
    require('child_process').execSync('taskkill /F /IM winws.exe 2>nul', {
      windowsHide: true,
      stdio: 'ignore'
    });
    console.log('Killed existing winws.exe processes');
  } catch (e) {
    // Процесс не найден - это нормально
  }
}

// Остановка Bypass
function stopBypass() {
  store.set('bypassRunning', false);

  // Kill the process if we have a reference
  if (winwsProcess && !winwsProcess.killed) {
    try {
      winwsProcess.kill('SIGTERM');
    } catch (err) {
      console.error('Error killing winws process:', err);
    }
  }

  // Also use taskkill as backup to ensure winws.exe is stopped
  exec('taskkill /F /IM winws.exe', { windowsHide: true }, (err) => {
    if (err) {
      // Process might not exist, which is fine
    }
  });

  winwsProcess = null;
  bypassProcess = null;

  if (mainWindow) {
    mainWindow.webContents.send('network-status', { running: false });
  }
}

// Проверка работает ли winws.exe
function checkBypassRunning() {
  return new Promise((resolve) => {
    exec('tasklist /FI "IMAGENAME eq winws.exe" /NH', { windowsHide: true }, (err, stdout) => {
      if (err) {
        resolve(false);
        return;
      }
      resolve(stdout.toLowerCase().includes('winws.exe'));
    });
  });
}

// Принудительно завершить все процессы winws.exe
function killAllWinws() {
  return new Promise((resolve) => {
    exec('taskkill /F /IM winws.exe', { windowsHide: true }, (err) => {
      // Игнорируем ошибки - процесс может не существовать
      resolve();
    });
  });
}

// Автозапуск bypass при старте приложения
async function autoStartBypass() {
  const bypassEnabled = store.get('bypassEnabled', true);
  if (bypassEnabled && checkBypassFiles()) {
    // winws.exe уже убит при старте лаунчера, просто запускаем свой
    setTimeout(() => {
      startBypass();
    }, 1000);
  }
}

// Получить список доступных режимов
function getAvailableModes() {
  const bypassPath = getBypassPath();
  const modes = [];

  try {
    const files = fs.readdirSync(bypassPath);

    // Сначала добавляем general
    if (files.includes('general.bat')) {
      modes.push({
        id: 'general',
        name: 'Обычный',
        description: 'Стандартный режим для большинства провайдеров'
      });
    }

    // Затем добавляем ALT режимы
    for (let i = 1; i <= 10; i++) {
      const altName = i === 1 ? 'ALT' : `ALT${i}`;
      const fileName = `general (${altName}).bat`;
      if (files.some(f => f === fileName)) {
        modes.push({
          id: altName,
          name: altName,
          description: BYPASS_MODES[altName]?.description || `Альтернативный режим ${i}`
        });
      }
    }

  } catch (err) {
    console.error('Error reading bypass modes:', err);
  }

  return modes;
}

// IPC обработчики
ipcMain.handle('get-settings', () => {
  return {
    theme: store.get('theme', 'dark'),
    bypassEnabled: store.get('bypassEnabled', true),
    bypassMode: store.get('bypassMode', 'general'),
    autostart: store.get('autostart', false),
    minimizeToTray: store.get('minimizeToTray', true),
    robloxProfile: store.get('robloxProfile', null)
  };
});

ipcMain.handle('set-setting', async (event, key, value) => {
  store.set(key, value);

  // Если меняется настройка bypass
  if (key === 'bypassEnabled') {
    if (value) {
      startBypass();
    } else {
      stopBypass();
    }
  }

  // Если меняется режим bypass
  if (key === 'bypassMode') {
    const isEnabled = store.get('bypassEnabled', true);
    if (isEnabled) {
      // Перезапускаем с новым режимом
      stopBypass();
      setTimeout(() => {
        startBypass(value);
      }, 1000);
    }
  }

  return true;
});

ipcMain.handle('launch-roblox', () => {
  launchRoblox();
  return true;
});

// Открыть внешнюю ссылку в браузере
ipcMain.handle('open-external', async (event, url) => {
  try {
    await shell.openExternal(url);
    return true;
  } catch (err) {
    console.error('Failed to open external URL:', err);
    return false;
  }
});

// Helper function for HTTPS requests
function httpsRequest(options, postData = null) {
  const https = require('https');
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve(data);
        }
      });
    });
    req.on('error', reject);
    if (postData) {
      req.write(postData);
    }
    req.end();
  });
}

function httpsGet(url) {
  const https = require('https');
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve(data);
        }
      });
    }).on('error', reject);
  });
}

// Получить профиль Roblox по username
ipcMain.handle('get-roblox-profile', async (event, username) => {
  try {
    // Сначала получаем userId по username
    const postData = JSON.stringify({
      usernames: [username],
      excludeBannedUsers: false
    });

    const userIdResponse = await httpsRequest({
      hostname: 'users.roblox.com',
      path: '/v1/usernames/users',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    }, postData);

    if (!userIdResponse.data || userIdResponse.data.length === 0) {
      return { success: false, error: 'Пользователь не найден' };
    }

    const userId = userIdResponse.data[0].id;
    const displayName = userIdResponse.data[0].displayName;
    const name = userIdResponse.data[0].name;

    // Получаем детальную информацию о пользователе (дата регистрации)
    const userDetails = await httpsGet(`https://users.roblox.com/v1/users/${userId}`);

    let createdDate = null;
    if (userDetails && userDetails.created) {
      createdDate = userDetails.created;
    }

    // Получаем аватар-headshot (для topbar)
    const headshotResponse = await httpsGet(
      `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userId}&size=150x150&format=Png&isCircular=false`
    );

    let headshotUrl = null;
    if (headshotResponse.data && headshotResponse.data.length > 0) {
      headshotUrl = headshotResponse.data[0].imageUrl;
    }

    // Получаем полный аватар (для модального окна)
    const fullAvatarResponse = await httpsGet(
      `https://thumbnails.roblox.com/v1/users/avatar?userIds=${userId}&size=352x352&format=Png&isCircular=false`
    );

    let fullAvatarUrl = null;
    if (fullAvatarResponse.data && fullAvatarResponse.data.length > 0) {
      fullAvatarUrl = fullAvatarResponse.data[0].imageUrl;
    }

    return {
      success: true,
      userId,
      username: name,
      displayName,
      avatarUrl: headshotUrl,
      fullAvatarUrl: fullAvatarUrl,
      created: createdDate,
      description: userDetails.description || ''
    };

  } catch (err) {
    console.error('Error fetching Roblox profile:', err);
    return { success: false, error: 'Ошибка получения профиля' };
  }
});

ipcMain.handle('start-bypass', (event, mode) => {
  startBypass(mode);
  return true;
});

ipcMain.handle('stop-bypass', () => {
  stopBypass();
  return true;
});

ipcMain.handle('get-network-status', async () => {
  const isRunning = await checkBypassRunning();
  return {
    running: isRunning,
    available: checkBypassFiles(),
    mode: store.get('bypassMode', 'general')
  };
});

ipcMain.handle('get-bypass-modes', () => {
  return getAvailableModes();
});

// ============================================
// AUTO-UPDATER / DOWNLOADER
// Загрузка компонентов с вашего сервера
// ============================================

// =============================================
// GITHUB CONFIGURATION
// =============================================
const GITHUB_OWNER = 'Flowseal';  // Change to your GitHub username
const GITHUB_REPO = 'zapret-discord-youtube';  // Repository with bypass files
const BYPASS_ASSET_NAME = 'bypass.zip';  // Asset name in release

// =============================================
// НАСТРОЙКИ СЕРВЕРА - ИЗМЕНИТЕ НА СВОИ URL
// =============================================
const UPDATE_CONFIG = {
  // URL вашего сервера с информацией о версии лаунчера
  // Должен возвращать JSON: { "version": "1.0.0", "downloadUrl": "https://...", "releaseNotes": "..." }
  versionUrl: 'https://your-server.com/api/launcher/version.json',
  
  // URL для скачивания лаунчера (можно указать здесь напрямую или в version.json)
  downloadUrl: 'https://your-server.com/files/RobBob-Setup.exe',
  
  // URL для bypass файлов
  bypassVersionUrl: 'https://your-server.com/api/bypass/version.json',
  bypassDownloadUrl: 'https://your-server.com/files/bypass.zip'
};

const CURRENT_VERSION = require('./package.json').version;

// ============================================
// SELF-UPDATE SYSTEM
// Обязательная проверка обновлений при запуске
// ============================================

let isUpdating = false;

/**
 * Check if launcher update is available from your server
 */
async function checkForLauncherUpdate() {
  try {
    const versionInfo = await fetchVersionInfo(UPDATE_CONFIG.versionUrl);
    if (!versionInfo || !versionInfo.version) {
      return { hasUpdate: false, error: 'Не удалось проверить обновления' };
    }
    
    const latestVersion = versionInfo.version.replace('v', '');
    const currentVersion = CURRENT_VERSION.replace('v', '');
    
    // Version comparison
    const needsUpdate = compareVersions(latestVersion, currentVersion) > 0;
    
    if (needsUpdate) {
      return {
        hasUpdate: true,
        mandatory: true,  // Обновление обязательно
        currentVersion: CURRENT_VERSION,
        latestVersion: versionInfo.version,
        downloadUrl: versionInfo.downloadUrl || UPDATE_CONFIG.downloadUrl,
        releaseNotes: versionInfo.releaseNotes || ''
      };
    }
    
    return { hasUpdate: false, currentVersion: CURRENT_VERSION };
  } catch (err) {
    console.error('Error checking for updates:', err);
    return { hasUpdate: false, error: err.message };
  }
}

/**
 * Compare semantic versions
 * Returns: 1 if a > b, -1 if a < b, 0 if equal
 */
function compareVersions(a, b) {
  const partsA = a.split('.').map(Number);
  const partsB = b.split('.').map(Number);
  
  for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
    const numA = partsA[i] || 0;
    const numB = partsB[i] || 0;
    if (numA > numB) return 1;
    if (numA < numB) return -1;
  }
  return 0;
}

/**
 * Fetch version info from your server
 */
function fetchVersionInfo(url) {
  const https = require('https');
  const http = require('http');
  
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    
    const req = protocol.get(url, {
      headers: {
        'User-Agent': 'RobBob-Launcher',
        'Accept': 'application/json'
      }
    }, (res) => {
      // Handle redirects
      if (res.statusCode === 302 || res.statusCode === 301) {
        fetchVersionInfo(res.headers.location).then(resolve).catch(reject);
        return;
      }
      
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve(null);
        }
      });
    });

    req.on('error', () => resolve(null));
    req.setTimeout(15000, () => {
      req.destroy();
      resolve(null);
    });
  });
}

/**
 * Download and apply launcher update
 */
async function downloadLauncherUpdate(downloadUrl) {
  if (isUpdating) return { success: false, error: 'Update already in progress' };
  isUpdating = true;
  
  try {
    const tempDir = path.join(app.getPath('temp'), 'robbob-update');
    const zipPath = path.join(tempDir, 'update.zip');
    
    // Create temp directory
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    // Send progress
    if (mainWindow) {
      mainWindow.webContents.send('update-progress', { percent: 0, status: 'Начало загрузки...' });
    }
    
    // Download update
    await downloadFile(downloadUrl, zipPath, (percent) => {
      if (mainWindow) {
        mainWindow.webContents.send('update-progress', {
          percent: Math.round(percent * 0.7),
          status: `Загрузка: ${Math.round(percent)}%`
        });
      }
    });
    
    if (mainWindow) {
      mainWindow.webContents.send('update-progress', { percent: 75, status: 'Подготовка к установке...' });
    }
    
    // Create update script that will:
    // 1. Wait for launcher to close
    // 2. Extract update
    // 3. Restart launcher
    const appPath = app.getPath('exe');
    const appDir = path.dirname(appPath);
    const updateScript = path.join(tempDir, 'update.bat');
    
    const scriptContent = `
@echo off
echo Updating RobBob Launcher...
timeout /t 2 /nobreak > nul
powershell -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${appDir}' -Force"
del "${zipPath}"
start "" "${appPath}"
del "%~f0"
`;
    
    fs.writeFileSync(updateScript, scriptContent);
    
    if (mainWindow) {
      mainWindow.webContents.send('update-progress', { percent: 90, status: 'Перезапуск...' });
    }
    
    // Run update script and quit
    spawn('cmd.exe', ['/c', updateScript], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true
    }).unref();
    
    setTimeout(() => {
      app.quit();
    }, 500);
    
    return { success: true };
    
  } catch (err) {
    console.error('Update error:', err);
    isUpdating = false;
    return { success: false, error: err.message };
  }
}

// IPC handlers for self-update
ipcMain.handle('check-launcher-update', async () => {
  return await checkForLauncherUpdate();
});

ipcMain.handle('download-launcher-update', async (event, downloadUrl) => {
  return await downloadLauncherUpdate(downloadUrl);
});

ipcMain.handle('get-launcher-version', () => {
  return CURRENT_VERSION;
});

// Проверка наличия файлов bypass
ipcMain.handle('check-bypass-files', async () => {
  const bypassPath = getBypassPath();
  const winwsPath = path.join(bypassPath, 'bin', 'winws.exe');

  const exists = fs.existsSync(winwsPath);
  const currentVersion = store.get('bypassVersion', null);

  return {
    exists,
    needsDownload: !exists,
    currentVersion
  };
});

// Скачивание файлов bypass с GitHub
ipcMain.handle('download-bypass-files', async () => {
  const https = require('https');
  const { createWriteStream, mkdirSync, existsSync } = require('fs');

  try {
    // Отправляем начальный статус
    if (mainWindow) {
      mainWindow.webContents.send('download-progress', {
        percent: 0,
        status: 'Получение информации о релизе...'
      });
    }

    // Получаем информацию о последнем релизе
    const releaseInfo = await getLatestRelease();
    if (!releaseInfo) {
      return { success: false, error: 'Не удалось получить информацию о релизе' };
    }

    // Ищем нужный asset
    const asset = releaseInfo.assets.find(a => a.name === BYPASS_ASSET_NAME);
    if (!asset) {
      return { success: false, error: 'Файл bypass.zip не найден в релизе' };
    }

    if (mainWindow) {
      mainWindow.webContents.send('download-progress', {
        percent: 5,
        status: 'Начинаем загрузку...'
      });
    }

    // Создаём папку для bypass
    const bypassPath = getBypassPath();
    if (!existsSync(bypassPath)) {
      mkdirSync(bypassPath, { recursive: true });
    }

    const zipPath = path.join(bypassPath, 'bypass.zip');

    // Скачиваем файл
    await downloadFile(asset.browser_download_url, zipPath, (percent) => {
      if (mainWindow) {
        mainWindow.webContents.send('download-progress', {
          percent: 5 + (percent * 0.7), // 5-75%
          status: 'Загрузка: ' + Math.round(percent) + '%'
        });
      }
    });

    if (mainWindow) {
      mainWindow.webContents.send('download-progress', {
        percent: 80,
        status: 'Распаковка файлов...'
      });
    }

    // Распаковываем архив
    await extractZip(zipPath, bypassPath);

    // Удаляем zip
    try {
      fs.unlinkSync(zipPath);
    } catch (e) {}

    // Сохраняем версию
    store.set('bypassVersion', releaseInfo.tag_name);

    if (mainWindow) {
      mainWindow.webContents.send('download-progress', {
        percent: 100,
        status: 'Готово!'
      });
    }

    return { success: true, version: releaseInfo.tag_name };

  } catch (err) {
    console.error('Download error:', err);
    return { success: false, error: err.message };
  }
});

// Получить информацию о последнем релизе
function getLatestRelease() {
  const https = require('https');

  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.github.com',
      path: `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`,
      method: 'GET',
      headers: {
        'User-Agent': 'RobBob-Launcher',
        'Accept': 'application/vnd.github.v3+json'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve(null);
        }
      });
    });

    req.on('error', () => resolve(null));
    req.end();
  });
}

// Скачать файл с прогрессом
function downloadFile(url, destPath, onProgress) {
  const https = require('https');
  const http = require('http');

  return new Promise((resolve, reject) => {
    const handleResponse = (res) => {
      // Если редирект - следуем за ним
      if (res.statusCode === 302 || res.statusCode === 301) {
        downloadFile(res.headers.location, destPath, onProgress)
          .then(resolve)
          .catch(reject);
        return;
      }

      const totalSize = parseInt(res.headers['content-length'], 10);
      let downloadedSize = 0;

      const file = createWriteStream(destPath);

      res.on('data', (chunk) => {
        downloadedSize += chunk.length;
        file.write(chunk);

        if (totalSize && onProgress) {
          onProgress((downloadedSize / totalSize) * 100);
        }
      });

      res.on('end', () => {
        file.end();
        resolve();
      });

      res.on('error', reject);
    };

    const protocol = url.startsWith('https') ? https : http;
    const req = protocol.get(url, {
      headers: {
        'User-Agent': 'RobBob-Launcher'
      }
    }, handleResponse);

    req.on('error', reject);
  });
}

// Распаковать ZIP архив
function extractZip(zipPath, destPath) {
  return new Promise((resolve, reject) => {
    // Используем PowerShell для распаковки на Windows
    if (process.platform === 'win32') {
      const cmd = `powershell -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${destPath}' -Force"`;

      exec(cmd, { windowsHide: true }, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    } else {
      // На других платформах используем unzip
      exec(`unzip -o "${zipPath}" -d "${destPath}"`, (err) => {
        if (err) reject(err);
        else resolve();
      });
    }
  });
}

// Управление окном
ipcMain.on('window-minimize', () => {
  mainWindow.minimize();
});

ipcMain.on('window-maximize', () => {
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow.maximize();
  }
});

ipcMain.on('window-close', () => {
  mainWindow.close();
});

// Запуск приложения
app.whenReady().then(() => {
  createWindow();
  createTray();

  mainWindow.webContents.on('did-finish-load', () => {
    autoStartBypass();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on('before-quit', () => {
  stopBypass();
});
