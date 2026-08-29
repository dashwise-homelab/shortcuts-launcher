export type ConnectionMode = 'dashwise' | 'mqtt' | 'serverless';
export type ShortcutType = 'app' | 'shell' | 'deeplink' | 'macro';
export type RecordedKeyModifier = 'alt' | 'control' | 'meta' | 'shift';
export type ExecutionSource = 'manual' | 'mqtt' | 'dashwise';

export interface RecordedKey {
  code: string;
  key: string;
  modifiers: RecordedKeyModifier[];
  delay: number;
}

export interface Shortcut {
  id: string;
  name: string;
  icon: string;
  type: ShortcutType;
  configuration: Record<string, unknown>;
  exposeToDashwise: boolean;
  exposeToMqtt: boolean;
  created: string;
  updated: string;
}

export interface Settings {
  onboardingCompleted: boolean;
  selectedMode: ConnectionMode;
  deviceName: string;
  launcherId: string;
}

export interface ServerConnection {
  serverUrl: string;
  authToken: string;
  sessionId: string;
  shortcutsAppId: string;
  connectedAt?: string;
  lastSyncAt?: string;
  status: 'connected' | 'disconnected' | 'connecting' | 'error';
  lastError?: string;
}

export interface MqttConnection {
  host: string;
  port: number;
  username: string;
  password: string;
  tls: boolean;
  clientId: string;
  status: 'connected' | 'disconnected' | 'connecting' | 'error';
  lastError?: string;
}

export interface ExecutionResult {
  success: boolean;
  error?: string;
}

export interface HistoryEntry {
  id: string;
  shortcutId: string;
  shortcutName: string;
  shortcutIcon: string;
  shortcutType: ShortcutType;
  source: ExecutionSource;
  success: boolean;
  error?: string;
  executedAt: string;
}

export interface ShortcutInput {
  name: string;
  icon: string;
  type: ShortcutType;
  configuration: Record<string, unknown>;
  exposeToDashwise: boolean;
  exposeToMqtt: boolean;
}

export interface AppInfo {
  name: string;
  path: string;
}

export interface AppState {
  settings: Settings;
  shortcuts: Shortcut[];
  history: HistoryEntry[];
  server: Omit<ServerConnection, 'authToken'>;
  mqtt: Omit<MqttConnection, 'password'>;
}
