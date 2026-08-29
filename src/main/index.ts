import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import os from 'node:os';
import { Store } from './storage/db.js';
import { ShortcutExecutor } from './shortcuts/executor.js';
import { DashwiseClient } from './dashwise/client.js';
import { MqttAdapter } from './mqtt/client.js';
import type { AppInfo, ShortcutInput } from '../shared/types.js';

const execFileAsync = promisify(execFile);
let mainWindow: BrowserWindow | undefined;
let store: Store;
let executor: ShortcutExecutor;
let dashwise: DashwiseClient;
let mqttAdapter: MqttAdapter;

function broadcast(event: string): void { mainWindow?.webContents.send('launcher:event', event); }
function createWindow(): void {
  mainWindow = new BrowserWindow({ width: 1180, height: 780, minWidth: 960, minHeight: 650, title: 'Dashwise Desktop Launcher', frame: false, backgroundColor: '#4ab9ca', webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
  void mainWindow.loadFile(path.join(__dirname, 'index.html'));
  mainWindow.on('closed', () => { mainWindow = undefined; });
}
function registerIpc(): void {
  ipcMain.handle('state:get', () => ({ settings: store.settings(), shortcuts: store.shortcuts(), server: store.server(), mqtt: store.mqtt() }));
  ipcMain.handle('onboarding:complete', (_e, mode: 'dashwise' | 'mqtt') => { store.completeOnboarding(mode); if (mode === 'dashwise') void dashwise.connect(); if (mode === 'mqtt') mqttAdapter.connect(); });
  ipcMain.handle('shortcut:save', async (_e, input: ShortcutInput, id?: string) => { const saved = store.saveShortcut(input, id); broadcast('state-changed'); dashwise.queueSync(); void mqttAdapter.refresh().catch(() => undefined); return saved; });
  ipcMain.handle('shortcut:duplicate', async (_e, id: string) => { const saved = store.duplicateShortcut(id); broadcast('state-changed'); dashwise.queueSync(); void mqttAdapter.refresh().catch(() => undefined); return saved; });
  ipcMain.handle('shortcut:delete', async (_e, id: string) => { await mqttAdapter.removeShortcut(id); store.deleteShortcut(id); broadcast('state-changed'); dashwise.queueSync(); void mqttAdapter.refresh().catch(() => undefined); });
  ipcMain.handle('shortcut:execute', (_e, id: string) => executor.executeShortcut(id));
  ipcMain.handle('apps:list', () => listApps());
  ipcMain.handle('server:configure', async (_e, input: { serverUrl: string; authToken: string }) => { store.saveServer(input); await dashwise.connect(); });
  ipcMain.handle('server:reconnect', () => dashwise.connect());
  ipcMain.handle('server:disconnect', () => { dashwise.disconnect(); store.clearServerCredentials(); broadcast('state-changed'); });
  ipcMain.handle('server:sync', () => dashwise.sync());
  ipcMain.handle('mqtt:configure', (_e, input: { host: string; port: number; username: string; password: string; tls: boolean; clientId: string }) => { store.saveMqtt(input); mqttAdapter.connect(); });
  ipcMain.handle('mqtt:test', (_e, input: { host: string; port: number; username: string; password: string; tls: boolean; clientId: string }) => mqttAdapter.test(input));
  ipcMain.handle('mqtt:connect', () => mqttAdapter.connect());
  ipcMain.handle('mqtt:disconnect', () => mqttAdapter.disconnect());
  ipcMain.handle('settings:device-name', (_e, name: string) => { store.setDeviceName(name); broadcast('state-changed'); dashwise.queueSync(); void mqttAdapter.refresh().catch(() => undefined); });
  ipcMain.handle('window:close', () => mainWindow?.close());
  ipcMain.handle('window:minimize', () => mainWindow?.minimize());
  ipcMain.handle('window:toggle-maximize', () => mainWindow?.isMaximized() ? mainWindow.unmaximize() : mainWindow?.maximize());
}
async function listApps(): Promise<AppInfo[]> {
  if (process.platform === 'linux') { try { const { stdout } = await execFileAsync('bash', ['-lc', "find /usr/share/applications ~/.local/share/applications -maxdepth 1 -name '*.desktop' -print 2>/dev/null | head -80"]); return stdout.split('\n').filter(Boolean).map((file) => ({ name: path.basename(file, '.desktop').replace(/[-_]/g, ' '), path: file })); } catch { return []; } }
  if (process.platform === 'darwin') { try { const { stdout } = await execFileAsync('bash', ['-lc', "find /Applications ~/Applications -maxdepth 1 -name '*.app' -print 2>/dev/null | head -80"]); return stdout.split('\n').filter(Boolean).map((file) => ({ name: path.basename(file, '.app'), path: file })); } catch { return []; } }
  return [{ name: 'Calculator', path: 'calc.exe' }, { name: 'Notepad', path: 'notepad.exe' }];
}
app.whenReady().then(async () => {
  store = await Store.create(); executor = new ShortcutExecutor(store); dashwise = new DashwiseClient(store, executor, broadcast, () => mainWindow); mqttAdapter = new MqttAdapter(store, executor, broadcast, () => mainWindow); registerIpc(); createWindow();
  if (store.settings().onboardingCompleted) { if (store.settings().selectedMode === 'dashwise') void dashwise.connect(); if (store.settings().selectedMode === 'mqtt') mqttAdapter.connect(); }
  app.on('activate', () => { if (!mainWindow) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('before-quit', () => { dashwise?.disconnect(); mqttAdapter?.disconnect(); });
