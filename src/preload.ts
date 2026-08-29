import { contextBridge, ipcRenderer } from 'electron';
import type { LauncherApi } from './shared/ipc.js';
import type { ShortcutInput } from './shared/types.js';

const api: LauncherApi & { onStateChanged(callback: () => void): () => void } = {
  getState: () => ipcRenderer.invoke('state:get'),
  completeOnboarding: (mode) => ipcRenderer.invoke('onboarding:complete', mode),
  saveShortcut: (input: ShortcutInput, id?: string) =>
    ipcRenderer.invoke('shortcut:save', input, id),
  duplicateShortcut: (id) => ipcRenderer.invoke('shortcut:duplicate', id),
  deleteShortcut: (id) => ipcRenderer.invoke('shortcut:delete', id),
  executeShortcut: (id) => ipcRenderer.invoke('shortcut:execute', id),
  listApps: () => ipcRenderer.invoke('apps:list'),
  configureServer: (input) => ipcRenderer.invoke('server:configure', input),
  reconnectServer: () => ipcRenderer.invoke('server:reconnect'),
  disconnectServer: () => ipcRenderer.invoke('server:disconnect'),
  syncServer: () => ipcRenderer.invoke('server:sync'),
  configureMqtt: (input) => ipcRenderer.invoke('mqtt:configure', input),
  testMqtt: (input) => ipcRenderer.invoke('mqtt:test', input),
  connectMqtt: () => ipcRenderer.invoke('mqtt:connect'),
  disconnectMqtt: () => ipcRenderer.invoke('mqtt:disconnect'),
  setDeviceName: (name) => ipcRenderer.invoke('settings:device-name', name),
  closeWindow: () => ipcRenderer.invoke('window:close'),
  minimizeWindow: () => ipcRenderer.invoke('window:minimize'),
  toggleMaximizeWindow: () => ipcRenderer.invoke('window:toggle-maximize'),
  openExternal: (url) => ipcRenderer.invoke('external:open', url),
  onStateChanged: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, value: string) => {
      if (value === 'state-changed' || value === 'state') callback();
    };
    ipcRenderer.on('launcher:event', listener);
    return () => ipcRenderer.removeListener('launcher:event', listener);
  },
};
contextBridge.exposeInMainWorld('launcher', api);
