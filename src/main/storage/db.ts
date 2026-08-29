import { app, safeStorage } from 'electron';
import initSqlJs, { type Database as SqlDatabase, type SqlJsStatic } from 'sql.js';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import os from 'node:os';
import type { ConnectionMode, MqttConnection, ServerConnection, Settings, Shortcut, ShortcutInput } from '../../shared/types.js';

type Row = Record<string, unknown>;

export class Store {
  private db!: SqlDatabase;
  private constructor(private readonly dbPath: string) {}
  static async create(): Promise<Store> {
    const store = new Store(path.join(app.getPath('userData'), 'launcher.sqlite'));
    const SQL: SqlJsStatic = await initSqlJs({ locateFile: (file) => path.join(path.dirname(require.resolve('sql.js')), file) });
    store.db = existsSync(store.dbPath) ? new SQL.Database(new Uint8Array(readFileSync(store.dbPath))) : new SQL.Database();
    store.initialize();
    return store;
  }
  private initialize(): void {
    this.db.run(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS server_connection (id INTEGER PRIMARY KEY CHECK (id = 1), serverUrl TEXT NOT NULL DEFAULT '', authToken TEXT NOT NULL DEFAULT '', sessionId TEXT NOT NULL, shortcutsAppId TEXT NOT NULL DEFAULT '', connectedAt TEXT, lastSyncAt TEXT, status TEXT NOT NULL DEFAULT 'disconnected', lastError TEXT); CREATE TABLE IF NOT EXISTS mqtt_connection (id INTEGER PRIMARY KEY CHECK (id = 1), host TEXT NOT NULL DEFAULT '', port INTEGER NOT NULL DEFAULT 1883, username TEXT NOT NULL DEFAULT '', password TEXT NOT NULL DEFAULT '', tls INTEGER NOT NULL DEFAULT 0, clientId TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'disconnected', lastError TEXT); CREATE TABLE IF NOT EXISTS shortcuts (id TEXT PRIMARY KEY, name TEXT NOT NULL, icon TEXT NOT NULL, type TEXT NOT NULL, configuration TEXT NOT NULL, exposeToDashwise INTEGER NOT NULL DEFAULT 0, exposeToMqtt INTEGER NOT NULL DEFAULT 0, created TEXT NOT NULL, updated TEXT NOT NULL); CREATE TABLE IF NOT EXISTS macros (id TEXT PRIMARY KEY, name TEXT NOT NULL); CREATE TABLE IF NOT EXISTS macroSteps (macroId TEXT NOT NULL, stepOrder INTEGER NOT NULL, configuration TEXT NOT NULL, PRIMARY KEY (macroId, stepOrder));`);
    if (!this.one('SELECT sessionId FROM server_connection WHERE id=1')) this.run('INSERT INTO server_connection (id, sessionId) VALUES (1, ?)', [randomUUID()]);
    if (!this.one('SELECT id FROM mqtt_connection WHERE id=1')) this.run('INSERT INTO mqtt_connection (id) VALUES (1)');
    if (!this.getSetting('launcherId')) this.setSetting('launcherId', randomUUID());
    if (!this.getSetting('deviceName')) this.setSetting('deviceName', `${os.hostname()} Shortcuts`);
    if (!this.getSetting('selectedMode')) this.setSetting('selectedMode', 'dashwise');
    if (!this.getSetting('onboardingCompleted')) this.setSetting('onboardingCompleted', 'false');
    this.persist();
  }
  private persist(): void { writeFileSync(this.dbPath, Buffer.from(this.db.export())); }
  private run(sql: string, params: any[] = []): void { const statement = this.db.prepare(sql); statement.bind(params); statement.step(); statement.free(); this.persist(); }
  private one(sql: string, params: any[] = []): Row | undefined { const statement = this.db.prepare(sql); statement.bind(params); const found = statement.step(); const row = found ? statement.getAsObject() as Row : undefined; statement.free(); return row; }
  private all(sql: string, params: any[] = []): Row[] { const statement = this.db.prepare(sql); statement.bind(params); const rows: Row[] = []; while (statement.step()) rows.push(statement.getAsObject() as Row); statement.free(); return rows; }
  private getSetting(key: string): string | undefined { return this.one('SELECT value FROM settings WHERE key = ?', [key])?.value as string | undefined; }
  private setSetting(key: string, value: string): void { this.run('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', [key, value]); }
  private protect(value: string): string { return value && safeStorage.isEncryptionAvailable() ? `enc:${safeStorage.encryptString(value).toString('base64')}` : value; }
  private reveal(value: string): string { return value?.startsWith('enc:') && safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(Buffer.from(value.slice(4), 'base64')) : value; }
  settings(): Settings { return { onboardingCompleted: this.getSetting('onboardingCompleted') === 'true', selectedMode: this.getSetting('selectedMode') as ConnectionMode, deviceName: this.getSetting('deviceName')!, launcherId: this.getSetting('launcherId')! }; }
  completeOnboarding(mode: ConnectionMode): void { this.setSetting('selectedMode', mode); this.setSetting('onboardingCompleted', 'true'); }
  setDeviceName(name: string): void { this.setSetting('deviceName', name.trim() || os.hostname()); }
  server(includeSecret = false): ServerConnection { const r = this.one('SELECT * FROM server_connection WHERE id=1')!; return { serverUrl: r.serverUrl as string, authToken: includeSecret ? this.reveal(r.authToken as string) : '', sessionId: r.sessionId as string, shortcutsAppId: r.shortcutsAppId as string, connectedAt: r.connectedAt as string | undefined, lastSyncAt: r.lastSyncAt as string | undefined, status: r.status as ServerConnection['status'], lastError: r.lastError as string | undefined }; }
  saveServer(input: { serverUrl: string; authToken: string }): void { this.run('UPDATE server_connection SET serverUrl=?, authToken=?, status="disconnected", lastError=NULL WHERE id=1', [input.serverUrl.replace(/\/$/, ''), this.protect(input.authToken)]); }
  clearServerCredentials(): void { this.run('UPDATE server_connection SET serverUrl="", authToken="", status="disconnected", lastError=NULL WHERE id=1'); }
  updateServer(fields: Partial<ServerConnection>): void { const allowed = ['shortcutsAppId', 'connectedAt', 'lastSyncAt', 'status', 'lastError']; for (const key of allowed) if (key in fields) this.run(`UPDATE server_connection SET ${key}=? WHERE id=1`, [fields[key as keyof ServerConnection] ?? null]); }
  mqtt(includeSecret = false): MqttConnection { const r = this.one('SELECT * FROM mqtt_connection WHERE id=1')!; return { host: r.host as string, port: r.port as number, username: r.username as string, password: includeSecret ? this.reveal(r.password as string) : '', tls: Boolean(r.tls), clientId: r.clientId as string, status: r.status as MqttConnection['status'], lastError: r.lastError as string | undefined }; }
  saveMqtt(input: Omit<MqttConnection, 'status' | 'lastError'>): void { const password = input.password || this.mqtt(true).password; const clientId = input.clientId || this.settings().launcherId; this.run('UPDATE mqtt_connection SET host=?, port=?, username=?, password=?, tls=?, clientId=?, status="disconnected", lastError=NULL WHERE id=1', [input.host, input.port, input.username, this.protect(password), input.tls ? 1 : 0, clientId]); }
  updateMqtt(fields: Partial<MqttConnection>): void { const allowed = ['status', 'lastError']; for (const key of allowed) if (key in fields) this.run(`UPDATE mqtt_connection SET ${key}=? WHERE id=1`, [fields[key as keyof MqttConnection] ?? null]); }
  private fromRow(r: Row): Shortcut { return { id: r.id as string, name: r.name as string, icon: r.icon as string, type: r.type as Shortcut['type'], configuration: JSON.parse(r.configuration as string), exposeToDashwise: Boolean(r.exposeToDashwise), exposeToMqtt: Boolean(r.exposeToMqtt), created: r.created as string, updated: r.updated as string }; }
  shortcuts(): Shortcut[] { return this.all('SELECT * FROM shortcuts ORDER BY created ASC').map((r) => this.fromRow(r)); }
  shortcut(id: string): Shortcut | undefined { const r = this.one('SELECT * FROM shortcuts WHERE id=?', [id]); return r ? this.fromRow(r) : undefined; }
  saveShortcut(input: ShortcutInput, id: string = randomUUID()): Shortcut { const now = new Date().toISOString(); const old = this.shortcut(id); this.run(`INSERT INTO shortcuts (id,name,icon,type,configuration,exposeToDashwise,exposeToMqtt,created,updated) VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,icon=excluded.icon,type=excluded.type,configuration=excluded.configuration,exposeToDashwise=excluded.exposeToDashwise,exposeToMqtt=excluded.exposeToMqtt,updated=excluded.updated`, [id, input.name.trim(), input.icon || '⚡', input.type, JSON.stringify(input.configuration), input.exposeToDashwise ? 1 : 0, input.exposeToMqtt ? 1 : 0, old?.created ?? now, now]); if (input.type === 'macro') this.run('INSERT INTO macros (id,name) VALUES (?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name', [id, input.name]); return this.shortcut(id)!; }
  duplicateShortcut(id: string): Shortcut { const old = this.shortcut(id); if (!old) throw new Error('Shortcut not found'); return this.saveShortcut({ ...old, name: `${old.name} copy` }); }
  deleteShortcut(id: string): void { this.run('DELETE FROM shortcuts WHERE id=?', [id]); this.run('DELETE FROM macros WHERE id=?', [id]); this.run('DELETE FROM macroSteps WHERE macroId=?', [id]); }
}
