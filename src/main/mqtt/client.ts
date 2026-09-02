import mqtt, { type MqttClient } from 'mqtt';
import type { BrowserWindow } from 'electron';
import { Store } from '../storage/db.js';
import { ShortcutExecutor } from '../shortcuts/executor.js';
import { APP_VERSION } from '../../shared/version.js';

export class MqttAdapter {
  private client?: MqttClient;
  private knownShortcutIds = new Set<string>();
  constructor(
    private readonly store: Store,
    private readonly executor: ShortcutExecutor,
    private readonly notify: (event: string) => void,
    private readonly window: () => BrowserWindow | undefined,
  ) {}
  async test(input: {
    host: string;
    port: number;
    username: string;
    password: string;
    tls: boolean;
    clientId: string;
  }): Promise<{ success: boolean; error?: string }> {
    return new Promise((resolve) => {
      const probe = mqtt.connect(this.url(input), this.options(input));
      const timeout = setTimeout(() => {
        probe.end(true);
        resolve({ success: false, error: 'Connection timed out' });
      }, 5000);
      probe.once('connect', () => {
        clearTimeout(timeout);
        probe.end(true);
        resolve({ success: true });
      });
      probe.once('error', (error) => {
        clearTimeout(timeout);
        probe.end(true);
        resolve({ success: false, error: error.message });
      });
    });
  }
  connect(): void {
    this.disconnect();
    const cfg = this.store.mqtt(true);
    if (!cfg.host) {
      this.store.updateMqtt({ status: 'error', lastError: 'Configure an MQTT broker first' });
      this.notify('state');
      return;
    }
    this.store.updateMqtt({ status: 'connecting', lastError: undefined });
    this.client = mqtt.connect(this.url(cfg), this.options(cfg));
    this.client.on('connect', () => {
      this.store.updateMqtt({ status: 'connected', lastError: undefined });
      void this.publishAll();
      this.notify('state');
    });
    this.client.on('reconnect', () => {
      this.store.updateMqtt({ status: 'connecting' });
      this.notify('state');
    });
    this.client.on('error', (error) => {
      this.store.updateMqtt({ status: 'error', lastError: error.message });
      this.notify('state');
    });
    this.client.on('message', (topic) => {
      const match = topic.match(/^dashwise-launcher\/[^/]+\/shortcut\/([^/]+)\/set$/);
      if (!match) return;
      const shortcut = this.store.shortcut(match[1]);
      if (shortcut?.exposeToMqtt)
        void this.executor.executeShortcut(shortcut.id, 'mqtt').then(
          () => this.notify('state'),
          () => this.notify('state'),
        );
    });
  }
  disconnect(): void {
    this.client?.end(true);
    this.client = undefined;
    this.store.updateMqtt({ status: 'disconnected' });
    this.notify('state');
  }
  async publishAll(): Promise<void> {
    if (!this.client?.connected) return;
    const shortcuts = this.store.shortcuts();
    const currentIds = new Set(shortcuts.map((shortcut) => shortcut.id));
    for (const id of this.knownShortcutIds) if (!currentIds.has(id)) await this.removeDiscovery(id);
    for (const shortcut of shortcuts) {
      if (shortcut.exposeToMqtt) {
        await this.publishDiscovery(shortcut);
        this.knownShortcutIds.add(shortcut.id);
      } else if (this.knownShortcutIds.has(shortcut.id)) {
        await this.removeDiscovery(shortcut.id);
        this.knownShortcutIds.delete(shortcut.id);
      }
    }
  }
  async refresh(): Promise<void> {
    if (this.client?.connected) await this.publishAll();
  }
  async removeShortcut(id: string): Promise<void> {
    if (!this.client?.connected) return;
    await this.removeDiscovery(id);
    this.knownShortcutIds.delete(id);
  }
  private base(): string {
    return `dashwise-launcher/${this.store.settings().launcherId}`;
  }
  private topic(id: string): string {
    return `${this.base()}/shortcut/${id}/set`;
  }
  private discovery(id: string): string {
    return `homeassistant/button/${this.store.settings().launcherId}/${id}/config`;
  }
  private publish(topic: string, payload: string, retain = true): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.client) return resolve();
      this.client.publish(topic, payload, { retain }, (error) =>
        error ? reject(error) : resolve(),
      );
    });
  }
  private async publishDiscovery(shortcut: { id: string; name: string }): Promise<void> {
    await this.publish(
      this.discovery(shortcut.id),
      JSON.stringify({
        unique_id: `dashwise_launcher_${shortcut.id}`,
        name: shortcut.name,
        command_topic: this.topic(shortcut.id),
        payload_press: 'PRESS',
        origin: { name: 'Dashwise Shortcuts Launcher (Desktop)', sw: APP_VERSION },
        device: {
          identifiers: [this.store.settings().launcherId],
          name: 'Dashwise Shortcuts Launcher (Desktop)',
          manufacturer: 'Dashwise',
          model: 'Shortcuts Launcher',
        },
      }),
    );
    await new Promise<void>((resolve, reject) =>
      this.client?.subscribe(this.topic(shortcut.id), (error) =>
        error ? reject(error) : resolve(),
      ),
    );
  }
  private async removeDiscovery(id: string): Promise<void> {
    if (!this.client?.connected) return;
    await this.publish(this.discovery(id), '');
    await new Promise<void>((resolve) => this.client?.unsubscribe(this.topic(id), () => resolve()));
  }
  private url(cfg: { host: string; port: number; tls: boolean }): string {
    const scheme = cfg.tls ? 'mqtts:' : 'mqtt:';
    const parsed = new URL(cfg.host.includes('://') ? cfg.host : `${scheme}//${cfg.host}`);
    parsed.protocol = scheme;
    if (cfg.port) parsed.port = String(cfg.port);
    return parsed.toString().replace(/\/$/, '');
  }
  private options(cfg: {
    username: string;
    password: string;
    clientId: string;
    tls: boolean;
  }): mqtt.IClientOptions {
    return {
      username: cfg.username || undefined,
      password: cfg.password || undefined,
      clientId: cfg.clientId || this.store.settings().launcherId,
      rejectUnauthorized: cfg.tls,
    };
  }
}
