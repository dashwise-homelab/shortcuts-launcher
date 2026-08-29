import type { AppInfo, AppState, ExecutionResult, Shortcut, ShortcutInput } from './types.js';

export interface LauncherApi {
  getState(): Promise<AppState>;
  completeOnboarding(mode: 'dashwise' | 'mqtt'): Promise<void>;
  saveShortcut(input: ShortcutInput, id?: string): Promise<Shortcut>;
  duplicateShortcut(id: string): Promise<Shortcut>;
  deleteShortcut(id: string): Promise<void>;
  executeShortcut(id: string): Promise<ExecutionResult>;
  listApps(): Promise<AppInfo[]>;
  configureServer(input: { serverUrl: string; authToken: string }): Promise<void>;
  reconnectServer(): Promise<void>;
  disconnectServer(): Promise<void>;
  syncServer(): Promise<void>;
  configureMqtt(input: { host: string; port: number; username: string; password: string; tls: boolean; clientId: string }): Promise<void>;
  testMqtt(input: { host: string; port: number; username: string; password: string; tls: boolean; clientId: string }): Promise<{ success: boolean; error?: string }>;
  connectMqtt(): Promise<void>;
  disconnectMqtt(): Promise<void>;
  setDeviceName(name: string): Promise<void>;
  closeWindow(): Promise<void>;
  minimizeWindow(): Promise<void>;
  toggleMaximizeWindow(): Promise<void>;
}
