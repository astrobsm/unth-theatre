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
const { app, BrowserWindow, shell, Menu, dialog } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');

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

// ============================================================
// Auto-update (electron-updater via GitHub Releases)
// ------------------------------------------------------------
// On launch (and every 6 hours) the packaged app checks the GitHub release
// feed, silently downloads any newer version in the background, and prompts the
// user to restart once it is ready. Works for the Windows (nsis) and Linux
// (AppImage) builds. Unsigned macOS builds cannot self-update (macOS blocks
// unsigned updates) — those users re-download from the release page.
// ============================================================
let updatePromptShown = false;

function setupAutoUpdate() {
  // Never run the updater in unpackaged/dev mode — there is nothing to update.
  if (!app.isPackaged) return;
  try {
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;

    autoUpdater.on('update-downloaded', (info) => {
      if (updatePromptShown || !mainWindow) return;
      updatePromptShown = true;
      dialog
        .showMessageBox(mainWindow, {
          type: 'info',
          buttons: ['Restart now', 'Later'],
          defaultId: 0,
          cancelId: 1,
          title: 'Update ready',
          message: `A new version (${info.version}) of ORM - UNTH has been downloaded.`,
          detail: 'Restart the app now to apply the update.',
        })
        .then((res) => {
          if (res.response === 0) autoUpdater.quitAndInstall();
        })
        .catch(() => {});
    });

    autoUpdater.on('error', (err) => {
      console.error('Auto-update error:', err == null ? 'unknown' : err.message || err);
    });

    // Initial check shortly after launch, then every 6 hours while running.
    autoUpdater.checkForUpdates().catch(() => {});
    setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), 6 * 60 * 60 * 1000);
  } catch (e) {
    console.error('Auto-update setup failed:', e && e.message ? e.message : e);
  }
}

// Manual "Check for Updates…" — surfaces the result to the user.
function checkForUpdatesManually() {
  if (!app.isPackaged) {
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Updates',
      message: 'Update checks are only available in the installed app.',
    });
    return;
  }
  autoUpdater
    .checkForUpdates()
    .then((result) => {
      const info = result && result.updateInfo;
      if (info && info.version && info.version !== app.getVersion()) {
        // update-downloaded handler will prompt to restart once ready.
        dialog.showMessageBox(mainWindow, {
          type: 'info',
          title: 'Updating',
          message: `Downloading version ${info.version}…`,
          detail: 'You will be prompted to restart when it is ready.',
        });
      } else {
        dialog.showMessageBox(mainWindow, {
          type: 'info',
          title: 'Up to date',
          message: `You are on the latest version (${app.getVersion()}).`,
        });
      }
    })
    .catch(() => {
      dialog.showMessageBox(mainWindow, {
        type: 'warning',
        title: 'Update check failed',
        message: 'Could not check for updates right now. Please try again later.',
      });
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
        {
          label: 'Check for Updates…',
          click: () => checkForUpdatesManually(),
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
  setupAutoUpdate();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
