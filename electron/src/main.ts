import { app, BrowserWindow, dialog, Notification } from 'electron';
import * as path from 'path';
import { autoUpdater } from 'electron-updater';
import log from 'electron-log';
import * as fs from 'fs';

const isDev = process.env.NODE_ENV === 'development';
const appVersion = app.getVersion();

console.log('Electron main process started!');

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
    // Ensure desktop file is updated after auto-update
    autoUpdater.on('update-downloaded', (info) => {
        try {
            const appPath = app.getPath('exe');
            const desktopEntry = `[Desktop Entry]
Name=${app.getName()}
Exec="${appPath}" %U
Terminal=false
Type=Application
Icon=${path.join(path.dirname(appPath), 'resources', 'assets', 'jemcord.png')}
StartupWMClass=${app.getName()}
Comment=Gaming Platform
Categories=Game;`;

            // Write to user's local applications directory
            const userDesktopFilePath = path.join(app.getPath('home'), '.local', 'share', 'applications', `${app.getName()}.desktop`);
            fs.mkdirSync(path.dirname(userDesktopFilePath), { recursive: true });
            fs.writeFileSync(userDesktopFilePath, desktopEntry);
            // Make it executable
            fs.chmodSync(userDesktopFilePath, '755');
        } catch (error) {
            console.error('Error updating desktop file:', error);
        }
    });
}

// Set update server URL if needed
if (!isDev) {
    autoUpdater.setFeedURL({
        provider: 'github',
        owner: 'spiderkiley4',
        repo: 'gaming-platform',
        private: false,
        releaseType: 'release'
    });
}

function createWindow() {
    const mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        icon: path.join(__dirname, '../assets/jemcord.png'),
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
                icon: path.join(__dirname, '../assets/jemcord.png')
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
    } else {
        // Check for updates when the app starts
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