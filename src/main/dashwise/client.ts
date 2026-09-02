import { WebSocket } from 'ws';
import type { BrowserWindow } from 'electron';
import type { Shortcut } from '../../shared/types.js';
import { Store } from '../storage/db.js';
import { ShortcutExecutor } from '../shortcuts/executor.js';

export class DashwiseClient {
  private socket?: WebSocket;
  private stopped = true;
  private retry = 0;
  private timer?: NodeJS.Timeout;
  private syncTimer?: NodeJS.Timeout;
  constructor(
    private readonly store: Store,
    private readonly executor: ShortcutExecutor,
    private readonly notify: (event: string) => void,
    private readonly window: () => BrowserWindow | undefined,
  ) {}
  async connect(): Promise<void> {
    this.stopped = false;
    this.store.updateServer({ status: 'connecting', lastError: undefined });
    this.notify('state');
    await this.open();
  }
  disconnect(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    if (this.syncTimer) clearTimeout(this.syncTimer);
    this.socket?.close();
    this.socket = undefined;
    this.store.updateServer({ status: 'disconnected' });
    this.notify('state');
  }
  queueSync(): void {
    if (this.syncTimer) clearTimeout(this.syncTimer);
    this.syncTimer = setTimeout(() => {
      this.syncTimer = undefined;
      const cfg = this.store.server(true);
      if (!cfg.serverUrl || !cfg.authToken) return;
      void this.sync().catch((error) => {
        this.store.updateServer({
          lastError: error instanceof Error ? error.message : String(error),
        });
        this.notify('state');
      });
    }, 350);
  }
  async sync(): Promise<void> {
    const cfg = this.store.server(true);
    if (!cfg.serverUrl || !cfg.authToken) throw new Error('Configure the Dashwise server first');
    let appId = cfg.shortcutsAppId;
    if (!appId) {
      const response = await this.request(
        '/api/v1/shortcuts/apps',
        { name: `${this.store.settings().deviceName}`, type: 'on-demand' },
        'POST',
      );
      appId = String(response.appId ?? response.id);
      if (!appId || appId === 'undefined') throw new Error('Dashwise did not return an app ID');
      this.store.updateServer({ shortcutsAppId: appId });
    }
    const exposed = this.store
      .shortcuts()
      .filter((s) => s.exposeToDashwise)
      .map((s) => ({
        sourceId: s.id,
        name: s.name,
        icon: s.icon,
        secondary: this.store.settings().deviceName,
        action: `shortcut:${cfg.sessionId}.${s.id}`,
        tags: [s.type],
      }));
    await this.request(
      `/api/v1/shortcuts/on-demand/${encodeURIComponent(appId)}`,
      { shortcuts: exposed },
      'PUT',
    );
    this.store.updateServer({ lastSyncAt: new Date().toISOString(), lastError: undefined });
    this.notify('state');
  }
  private async request(path: string, body: unknown, method: string): Promise<any> {
    const cfg = this.store.server(true);
    const response = await fetch(`${cfg.serverUrl.replace(/\/$/, '')}${path}`, {
      method,
      headers: { Authorization: `Bearer ${cfg.authToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`Dashwise request failed (${response.status})`);
    return response.json();
  }
  private async open(): Promise<void> {
    const cfg = this.store.server(true);
    if (!cfg.serverUrl || !cfg.authToken) {
      this.store.updateServer({
        status: 'error',
        lastError: 'Server URL and authentication token are required',
      });
      this.notify('state');
      return;
    }
    try {
      await this.sync();
      const url = new URL('/api/v1/activity', cfg.serverUrl);
      url.searchParams.set('token', cfg.authToken);
      url.searchParams.set('sessionId', cfg.sessionId);
      url.searchParams.set('clientType', 'launcher');
      url.searchParams.set('platform', process.platform);
      const socket = new WebSocket(url);
      this.socket = socket;
      socket.on('open', () => {
        this.retry = 0;
        this.store.updateServer({
          status: 'connected',
          connectedAt: new Date().toISOString(),
          lastError: undefined,
        });
        this.notify('state');
      });
      socket.on('message', (data) => void this.onMessage(String(data), socket));
      socket.on('close', () => {
        this.socket = undefined;
        if (!this.stopped) this.scheduleReconnect();
      });
      socket.on('error', (error) => {
        this.store.updateServer({ status: 'error', lastError: error.message });
        this.notify('state');
      });
    } catch (error) {
      this.store.updateServer({
        status: 'error',
        lastError: error instanceof Error ? error.message : String(error),
      });
      this.notify('state');
      if (!this.stopped) this.scheduleReconnect();
    }
  }
  private scheduleReconnect(): void {
    if (this.timer) return;
    this.store.updateServer({ status: 'connecting' });
    const delay = Math.min(30000, 1000 * 2 ** this.retry++);
    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.open();
    }, delay);
    this.notify('state');
  }
  private async onMessage(raw: string, socket: WebSocket): Promise<void> {
    let message: Record<string, unknown>;
    try {
      message = JSON.parse(raw);
    } catch {
      return;
    }
    if (
      message.type !== 'shortcut:execute' ||
      typeof message.requestId !== 'string' ||
      typeof message.shortcutId !== 'string'
    )
      return;
    const id = message.shortcutId;
    const shortcut = this.store.shortcut(id);
    const allowed = Boolean(shortcut?.exposeToDashwise);
    const result = allowed
      ? await this.executor.executeShortcut(id, 'dashwise')
      : { success: false, error: 'Shortcut is not available to Dashwise' };
    if (allowed) this.notify('state');
    if (socket.readyState !== WebSocket.OPEN) return;
    socket.send(
      JSON.stringify({
        type: 'shortcut:result',
        requestId: message.requestId,
        success: result.success,
        ...(result.error ? { error: result.error } : {}),
      }),
    );
  }
}
