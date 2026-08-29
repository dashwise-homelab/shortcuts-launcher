export type ConnectionMode = 'dashwise' | 'mqtt' | 'serverless';
export type ShortcutType = 'app' | 'shell' | 'deeplink' | 'macro';

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

export interface ExecutionResult { success: boolean; error?: string; }

export interface ShortcutInput {
  name: string;
  icon: string;
  type: ShortcutType;
  configuration: Record<string, unknown>;
  exposeToDashwise: boolean;
  exposeToMqtt: boolean;
}

export interface AppInfo { name: string; path: string; }

export interface AppState {
  settings: Settings;
  shortcuts: Shortcut[];
  server: Omit<ServerConnection, 'authToken'>;
  mqtt: Omit<MqttConnection, 'password'>;
}
