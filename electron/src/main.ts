import { app, BrowserWindow, dialog, Notification, ipcMain } from 'electron';
import * as path from 'path';
import { autoUpdater } from 'electron-updater';
import log from 'electron-log';
import * as fs from 'fs';
const { exec } = require('child_process');
import type { ExecException } from 'child_process';

const isDev = process.env.NODE_ENV === 'development';
const isPackagedApp = app.isPackaged;
const appVersion = app.getVersion();
const API_URL = isDev ? 'https://localhost:3001' : 'https://jemcord.mooo.com';

console.log('Electron main process started!');

app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
    if (url === 'https://jemcord.mooo.com' || url === 'https://localhost:3001') {
      // Verification logic.
      event.preventDefault()
      callback(true)
    } else {
      callback(false)
    }
  })

// Configure auto-updater
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;
autoUpdater.logger = log;
log.transports.file.level = 'debug';

// Handle platform-specific integration
if (process.platform === 'win32') {
    app.setAppUserModelId(app.getName());
    app.setAsDefaultProtocolClient(app.getName());
} else if (process.platform === 'linux') {
    const appRoot = path.join(__dirname, '..');
    // Use AppImage path if available, else fallback to electron binary
    const appPath = process.env.APPIMAGE || app.getPath('exe');
    const userHome = app.getPath('home');
    const desktopDir = path.join(userHome, '.local', 'share', 'applications');
    const iconDestDir = path.join(userHome, '.local', 'share', 'icons');
    const iconDest = path.join(iconDestDir, 'jemcord.png');
    const desktopFilePath = path.join(desktopDir, 'jemcord.desktop');

    const iconSrcCandidates = [
    path.join(appRoot, 'assets', 'jemcord.png'),                // dev/build
    path.join(appRoot, 'dist', 'frontend', 'jemcord.png'),      // some builds
    path.join(appRoot, 'jemcord.png'),                          // AppImage root
];

const iconSrc = iconSrcCandidates.find(fs.existsSync);

if (!iconSrc) {
    console.error('Could not find jemcord.png icon in any known location.');
} else {
    try {
        fs.mkdirSync(iconDestDir, { recursive: true });
        if (!fs.existsSync(iconDest)) {
            fs.copyFileSync(iconSrc, iconDest);
        }
    } catch (err) {
        console.error('Failed to copy icon:', err);
    }
}

    // Only create desktop entry if it doesn't exist or needs update
    const desktopEntry = `[Desktop Entry]
Name=Jemcord
Exec="${appPath}" %U
Terminal=false
Type=Application
Icon=${iconDest}
StartupWMClass=jemcord-electron
Comment=Gaming Platform
Categories=Game;Network;Chat;
MimeType=x-scheme-handler/jemcord;
X-GNOME-UsesNotifications=true`;

    try {
        fs.mkdirSync(desktopDir, { recursive: true });
        // Write or overwrite the desktop entry
        fs.writeFileSync(desktopFilePath, desktopEntry);
        fs.chmodSync(desktopFilePath, 0o755);

        // Update desktop database
        const { spawn } = require('child_process');
        spawn('update-desktop-database', [desktopDir]);
    } catch (error) {
        console.error('Error creating desktop file:', error);
    }
}

// Set update server URL if needed
if (isPackagedApp) {
    autoUpdater.setFeedURL({
        provider: 'github',
        owner: 'spiderkiley4',
        repo: 'gaming-platform',
        private: false,
        releaseType: 'release'
    });
}

function getRunningGames() {
    return new Promise<string[]>((resolve) => {
        if (process.platform === 'win32') {
            exec('tasklist', (error: ExecException | null, stdout: string) => {
                if (error) {
                    console.error('Error getting process list:', error);
                    resolve([]);
                    return;
                }

                const gameProcesses = [
                    { name: 'League of Legends', process: 'League of Legends.exe' },
                    { name: 'Counter-Strike 2', process: 'cs2.exe' },
                    { name: 'Minecraft', process: 'javaw.exe' },
                    { name: 'Fortnite', process: 'FortniteClient-Win64-Shipping.exe' },
                    { name: 'Valorant', process: 'VALORANT.exe' },
                    { name: 'Steam', process: 'steam.exe' }
                ];

                const runningGames = gameProcesses
                    .filter(game => stdout.includes(game.process))
                    .map(game => game.name);

                resolve(runningGames);
            });
        } else if (process.platform === 'linux') {
            exec('ps aux', (error: ExecException | null, stdout: string) => {
                if (error) {
                    console.error('Error getting process list:', error);
                    resolve([]);
                    return;
                }

                const gameProcesses = [
                    { name: 'Counter-Strike 2', process: 'cs2_linux64' },
                    { name: 'Steam', process: 'steam' },
                    { name: 'Minecraft', process: 'java' }
                ];

                const runningGames = gameProcesses
                    .filter(game => stdout.includes(game.process))
                    .map(game => game.name);

                resolve(runningGames);
            });
        } else {
            resolve([]);
        }
    });
}

function createWindow() {
    // Resolve icon path for dev vs packaged
    const appRoot = path.join(__dirname, '..');
    const iconCandidates = [
        path.join(appRoot, 'assets', 'jemcord.png'),          // packaged assets
        path.join(appRoot, 'frontend', 'jemcord.png'),        // copied frontend asset (rare)
        path.join(__dirname, '../assets/jemcord.png'),        // relative dev fallback
        path.join(__dirname, '../jemcord.png')                // fallback if copied beside dist
    ];
    const iconPath = iconCandidates.find(fs.existsSync);
    const mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        icon: iconPath,
        autoHideMenuBar: true,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    let isWindowFocused = true;
    let isMinimized = false;

    // Track window focus state
    mainWindow.on('focus', () => {
        isWindowFocused = true;
        mainWindow.webContents.send('window-state-change', { isWindowFocused, isMinimized });
    });

    mainWindow.on('blur', () => {
        isWindowFocused = false;
        mainWindow.webContents.send('window-state-change', { isWindowFocused, isMinimized });
    });

    // Track minimized state
    mainWindow.on('minimize', () => {
        isMinimized = true;
        mainWindow.webContents.send('window-state-change', { isWindowFocused, isMinimized });
    });

    mainWindow.on('restore', () => {
        isMinimized = false;
        mainWindow.webContents.send('window-state-change', { isWindowFocused, isMinimized });
    });

    // Handle new messages from renderer when window is not focused
    mainWindow.webContents.ipc.on('new-message', (event, { title, body, channel }) => {
        if (!isWindowFocused || isMinimized) {
            // Create native notification
            const notification = new Notification({
                title,
                body,
                silent: false,
                icon: iconPath
            });

            notification.on('click', () => {
                if (mainWindow.isMinimized()) {
                    mainWindow.restore();
                }
                mainWindow.focus();
                // Tell renderer to switch to the relevant channel
                mainWindow.webContents.send('switch-channel', channel);
            });

            notification.show();
        }
    });

    // Add IPC handler for game detection
    ipcMain.handle('get-running-games', async () => {
        return await getRunningGames();
    });

    // In development, load from React dev server
    if (isDev) {
        mainWindow.loadURL('http://localhost:5173');
        // Open DevTools in development
        mainWindow.webContents.openDevTools();
    } else {
        // In production, load from the frontend build
        mainWindow.loadFile(path.join(__dirname, 'frontend', 'index.html'));
    }

    // Expose version to renderer process
    mainWindow.webContents.on('did-finish-load', () => {
        mainWindow.webContents.executeJavaScript(`window.appVersion = '${appVersion}';`);
    });

    return mainWindow;
}

// Auto-updater events
autoUpdater.on('checking-for-update', () => {
    console.log('Checking for updates...');
});

autoUpdater.on('update-available', (info) => {
    dialog.showMessageBox({
        type: 'info',
        title: 'Update Available',
        message: `Version ${info.version} is available. Would you like to download it now?`,
        buttons: ['Yes', 'No']
    }).then((buttonIndex) => {
        if (buttonIndex.response === 0) {
            autoUpdater.downloadUpdate();
        }
    });
});

autoUpdater.on('update-downloaded', (info) => {
    dialog.showMessageBox({
        type: 'info',
        title: 'Update Ready',
        message: `Version ${info.version} has been downloaded. The application will restart to install the update.`,
        buttons: ['Restart Now', 'Later']
    }).then((buttonIndex) => {
        if (buttonIndex.response === 0) {
            autoUpdater.quitAndInstall();
        }
    });
});

autoUpdater.on('error', (err) => {
    dialog.showMessageBox({
        type: 'error',
        title: 'Update Error',
        message: `Error in auto-updater: ${err.message}`
    });
});

app.whenReady().then(() => {
    const mainWindow = createWindow();

    if (isDev) {
        // Install React DevTools in development
        try {
            const { default: installExtension, REACT_DEVELOPER_TOOLS } = require('electron-devtools-installer');
            installExtension(REACT_DEVELOPER_TOOLS)
                .then((name: string) => console.log(`Added Extension: ${name}`))
                .catch((err: Error) => console.log('An error occurred: ', err));
        } catch (e) {
            console.error('Error installing devtools:', e);
        }
    } else if (isPackagedApp) {
        // Check for updates when the app starts (only when packaged)
        autoUpdater.checkForUpdates();
    }

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});