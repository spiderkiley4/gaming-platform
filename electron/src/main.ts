import { app, BrowserWindow, dialog } from 'electron';
import * as path from 'path';
import { autoUpdater } from 'electron-updater';

const isDev = process.env.NODE_ENV === 'development';

console.log('Electron main process started!');

// Configure auto-updater
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;

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

    // In development, load from React dev server
    if (isDev) {
        mainWindow.loadURL('http://localhost:5173');
        // Open DevTools in development
        mainWindow.webContents.openDevTools();
    } else {
        // In production, load from the frontend build
        mainWindow.loadFile(path.join(__dirname, 'frontend', 'index.html'));
    }

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