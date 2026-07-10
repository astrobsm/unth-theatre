// ============================================================
// ORM - UNTH — Electron desktop shell
// ------------------------------------------------------------
// Loads the LIVE web app (the same PWA) inside a native desktop window, so:
//   • The existing web app / PWA is completely untouched.
//   • Every web deploy instantly updates the desktop app — no re-install.
//   • Windows, macOS and Linux are all supported from one codebase.
//
// Override the URL for local/staging with the CAP_SERVER_URL env var, e.g.
//   set CAP_SERVER_URL=http://localhost:3000 && npm start
// ============================================================
const { app, BrowserWindow, shell, Menu } = require('electron');
const path = require('path');

const SERVER_URL = process.env.CAP_SERVER_URL || 'https://unth-theatre-mai.vercel.app';
const APP_HOSTS = ['unth-theatre-mai.vercel.app', 'localhost', '127.0.0.1'];

let mainWindow = null;

// Only allow a single running instance; focus the existing window instead.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

function isAppUrl(url) {
  try {
    return APP_HOSTS.includes(new URL(url).hostname);
  } catch {
    return false;
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 380,
    minHeight: 560,
    backgroundColor: '#1e40af',
    show: false,
    autoHideMenuBar: true,
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // The web app already runs its own service worker + offline cache.
      spellcheck: true,
    },
  });

  // Show a local splash immediately, then load the live site.
  mainWindow.loadFile(path.join(__dirname, 'loading.html'));
  mainWindow.once('ready-to-show', () => mainWindow.show());

  const loadApp = () => mainWindow.loadURL(SERVER_URL);
  loadApp();

  // If the live site can't be reached (offline / server down), fall back to the
  // local splash with a retry button. The web app's own SW handles finer-grained
  // offline behaviour once it has loaded at least once.
  mainWindow.webContents.on('did-fail-load', (_e, errorCode, _desc, validatedURL) => {
    // -3 == ERR_ABORTED (normal during redirects) — ignore.
    if (errorCode === -3) return;
    if (validatedURL && validatedURL.startsWith(SERVER_URL)) {
      mainWindow.loadFile(path.join(__dirname, 'loading.html'), { hash: 'offline' });
    }
  });

  // Open external (non-app) links in the system browser, keep app links in-window.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isAppUrl(url)) return { action: 'allow' };
    shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!isAppUrl(url) && !url.startsWith('file://')) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// A minimal, familiar app menu (retry, back/forward, zoom, fullscreen, quit).
function buildMenu() {
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    {
      label: 'App',
      submenu: [
        {
          label: 'Reload',
          accelerator: 'CmdOrCtrl+R',
          click: () => mainWindow && mainWindow.loadURL(SERVER_URL),
        },
        {
          label: 'Back',
          accelerator: 'Alt+Left',
          click: () => mainWindow && mainWindow.webContents.canGoBack() && mainWindow.webContents.goBack(),
        },
        {
          label: 'Forward',
          accelerator: 'Alt+Right',
          click: () => mainWindow && mainWindow.webContents.canGoForward() && mainWindow.webContents.goForward(),
        },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(() => {
  buildMenu();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
