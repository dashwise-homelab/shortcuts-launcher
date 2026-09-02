import { icon } from '@fortawesome/fontawesome-svg-core';
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import { faGithub } from '@fortawesome/free-brands-svg-icons';
import {
  faArrowRight,
  faBolt,
  faCircleXmark,
  faCircle,
  faClockRotateLeft,
  faCopy,
  faGlobe,
  faLayerGroup,
  faLink,
  faPlay,
  faPlus,
  faServer,
  faTerminal,
  faUpRightAndDownLeftFromCenter,
  faWifi,
  faWindowMaximize,
  faWindowMinimize,
  faXmark,
  faPen,
} from '@fortawesome/free-solid-svg-icons';
import type { LauncherApi } from '../shared/ipc.js';
import type {
  AppState,
  HistoryEntry,
  RecordedKey,
  RecordedKeyModifier,
  Shortcut,
  ShortcutInput,
  ShortcutType,
} from '../shared/types.js';
import { APP_VERSION } from '../shared/version.js';

declare global {
  interface Window {
    launcher: LauncherApi & { onStateChanged(callback: () => void): () => void };
  }
}
const root = document.querySelector('#app')!;
let state: AppState;
let page = 'shortcuts';
let pageTransition = false;
let editingId: string | undefined;
let onboardingStep = 0;
let selectedMode: 'dashwise' | 'mqtt' = 'dashwise';
let addMenuOpen = false;
let recording = false;
let recordedKeys: RecordedKey[] = [];
let lastRecordedKeyAt = 0;
const esc = (value: unknown) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[c]!,
  );
const typeName: Record<ShortcutType, string> = {
  app: 'Open application',
  shell: 'Shell command',
  deeplink: 'Deep link',
  macro: 'Key press',
};
const renderIcon = (definition: IconDefinition, className = 'ui-icon'): string =>
  icon(definition, { classes: [className] }).html.join('');
const shortcutIconDefinitions: Record<string, IconDefinition> = {
  bolt: faBolt,
  'window-maximize': faWindowMaximize,
  terminal: faTerminal,
  link: faLink,
  'layer-group': faLayerGroup,
};
const defaultShortcutIcons: Record<ShortcutType, string> = {
  app: 'app',
  shell: 'terminal',
  deeplink: 'link',
  macro: 'layer-group',
};
const appIcon = (className = 'app-icon-image'): string =>
  `<img class="${className}" src="./assets/dashwise-icon.png" alt="" aria-hidden="true">`;
const shortcutIcon = (shortcut: Shortcut): string =>
  shortcut.type === 'app'
    ? appIcon()
    : renderIcon(
        shortcutIconDefinitions[shortcut.icon] ??
          shortcutIconDefinitions[defaultShortcutIcons[shortcut.type]],
      );
const iconOptions = (selected: string, type: ShortcutType): string =>
  ['app', ...Object.keys(shortcutIconDefinitions)]
    .map(
      (iconName) =>
        `<option value="${iconName}" ${iconName === (selected === 'app' || shortcutIconDefinitions[selected] ? selected : defaultShortcutIcons[type]) ? 'selected' : ''}>${iconName === 'app' ? 'Dashwise app icon' : iconName}</option>`,
    )
    .join('');
function status(status: string, error?: string): string {
  return `<span class="status-line">${renderIcon(faCircle, `dot ${esc(status)}`)}${esc(status[0]?.toUpperCase() + status.slice(1))}${error ? ` · ${esc(error)}` : ''}</span>`;
}
function render(): void {
  if (!state.settings.onboardingCompleted) renderOnboarding();
  else renderApp();
}
function renderOnboarding(): void {
  const progress = onboardingStep === 0 ? 1 : onboardingStep === 1 ? 2 : 3;
  root.innerHTML = `
    <div class="onboarding">
      <div class="onboard">
        <div class="onboard-top">
          <div class="brand-mark">${renderIcon(faBolt)}</div>
          <div>
            <strong>Dashwise Shortcuts Launcher (Desktop)</strong>
            <small>Local shortcuts, ready anywhere</small>
          </div>
        </div>
        <div class="steps">
          <i class="step done"></i>
          <i class="step ${progress > 1 ? 'done' : 'current'}"></i>
          <i class="step ${progress > 2 ? 'done' : ''}"></i>
        </div>
        ${onboardingStep === 0 ? welcome() : onboardingStep === 1 ? chooseMode() : setupMode()}
        <div class="onboard-footer">
          ${
            onboardingStep === 0
              ? `<button class="btn primary" data-action="onboard-next">
                  Continue ${renderIcon(faArrowRight, 'button-icon')}
                </button>`
              : onboardingStep === 1
                ? `<button class="btn primary" data-action="mode-next">
                    Continue ${renderIcon(faArrowRight, 'button-icon')}
                  </button>`
                : `<button class="btn primary" data-action="finish-onboard">
                    Finish setup ${renderIcon(faArrowRight, 'button-icon')}
                  </button>`
          }
        </div>
      </div>
    </div>
  `;
}
function welcome(): string {
  return `
    <section class="welcome">
      <div class="hero">${renderIcon(faBolt, 'hero-icon')}</div>
      <h1>
        Your shortcuts,
        <br />
        on every surface.
      </h1>
      <p>
        Dashwise Shortcuts Launcher lets Dashwise, Home Assistant and local integrations trigger
        actions on this computer securely and instantly.
      </p>
    </section>
  `;
}
function chooseMode(): string {
  return `
    <section>
      <div class="eyebrow">Step 2 of 3</div>
      <h1 class="title">How will you connect?</h1>
      <p class="subtitle">You can configure integrations later from their pages.</p>
      <div class="mode-grid" style="margin-top: 27px">
        <button class="card mode-card ${selectedMode === 'dashwise' ? 'selected' : ''}" data-mode="dashwise">
          <div class="mode-icon">${renderIcon(faServer)}</div>
          <h3>Connect to Dashwise Server</h3>
          <p>
            Connect this device to an existing Dashwise instance and make its shortcuts available
            remotely.
          </p>
        </button>
        <button class="card mode-card disabled" disabled>
          <span class="badge">Coming Soon</span>
          <div class="mode-icon">${renderIcon(faGlobe)}</div>
          <h3>Serverless</h3>
          <p>Use Shortcuts Launcher without a central Dashwise server.</p>
        </button>
        <button class="card mode-card ${selectedMode === 'mqtt' ? 'selected' : ''}" data-mode="mqtt">
          <div class="mode-icon">${renderIcon(faWifi)}</div>
          <h3>MQTT only</h3>
          <p>Connect directly to an MQTT broker and expose shortcuts to Home Assistant.</p>
        </button>
      </div>
    </section>
  `;
}
function setupMode(): string {
  return selectedMode === 'dashwise'
    ? `
        <section>
          <div class="eyebrow">Step 3 of 3 · Dashwise Server</div>
          <h1 class="title">Connect your instance</h1>
          <p class="subtitle">Your authentication token stays on this computer.</p>
          <form class="form" id="onboard-form" style="margin-top: 26px">
            <div class="field">
              <label>Dashwise server URL</label>
              <input
                name="serverUrl"
                placeholder="https://dashwise.example.com"
                required
                value="${esc(state.server.serverUrl)}"
              />
            </div>
            <div class="field">
              <label>Authentication token</label>
              <input name="authToken" type="password" placeholder="Paste your token" required />
            </div>
            <div class="notice">
              The launcher will register itself as an on-demand shortcuts app and keep a persistent
              Activity connection.
            </div>
          </form>
        </section>
      `
    : `
        <section>
          <div class="eyebrow">Step 3 of 3 · MQTT only</div>
          <h1 class="title">Connect your broker</h1>
          <p class="subtitle">You can configure Home Assistant discovery in settings later.</p>
          <form class="form" id="onboard-form" style="margin-top: 26px">
            <div class="form-row">
              <div class="field">
                <label>Broker hostname</label>
                <input
                  name="host"
                  placeholder="homeassistant.local"
                  required
                  value="${esc(state.mqtt.host)}"
                />
              </div>
              <div class="field">
                <label>Port</label>
                <input name="port" type="number" value="${state.mqtt.port || 1883}" />
              </div>
            </div>
            <div class="form-row">
              <div class="field">
                <label>Username</label>
                <input name="username" value="${esc(state.mqtt.username)}" />
              </div>
              <div class="field">
                <label>Password</label>
                <input name="password" type="password" />
              </div>
            </div>
            <div class="form-row">
              <div class="field" style="grid-column: 1 / -1">
                <label>Client ID (optional)</label>
                <input name="clientId" placeholder="Auto-generated from this launcher" />
              </div>
            </div>
            <label class="check">
              <input name="tls" type="checkbox" ${state.mqtt.tls ? 'checked' : ''} />
              Use TLS encryption
            </label>
          </form>
        </section>
      `;
}
function sidebar(): string {
  return `
    <aside class="sidebar">
      <nav class="nav">
        <button class="${page === 'shortcuts' ? 'active' : ''}" data-page="shortcuts">
          ${renderIcon(faLayerGroup)}
          <span>Shortcuts</span>
        </button>
        <button class="${page === 'history' ? 'active' : ''}" data-page="history">
          ${renderIcon(faClockRotateLeft)}
          <span>History</span>
        </button>
        <button class="${page === 'mqtt' ? 'active' : ''}" data-page="mqtt">
          ${renderIcon(faWifi)}
          <span>MQTT</span>
        </button>
        <button class="${page === 'server' ? 'active' : ''}" data-page="server">
          ${renderIcon(faServer)}
          <span>Your server</span>
        </button>
      </nav>
      <div class="sidebar-footer">
        <div class="github-card">
          <div class="github">
            ${renderIcon(faGithub)}
            <span>GitHub</span>
          </div>
          <div class="repo-links">
            <a href="https://github.com/andreasmolnardev/dashwise-next" data-action="open-github">
              <span>Dashwise</span>
            </a>
            <span class="repo-divider" aria-hidden="true">|</span>
            <a href="https://github.com/dashwise-homelab/shortcuts-launcher" data-action="open-github">
              <span>Shortcuts</span>
            </a>
          </div>
        </div>
      </div>
    </aside>
  `;
}
function renderApp(): void {
  const title =
    page === 'shortcuts'
      ? 'Shortcuts'
      : page === 'history'
        ? 'History'
        : page === 'mqtt'
          ? 'MQTT'
          : 'Your server';
  root.innerHTML = `
    <div class="desktop">
      <div class="app-window">
        <header class="windowbar">
          <div class="window-brand">
            <span class="home-icon">${appIcon()}</span>
            <span>Launcher</span>
            <span class="version-badge">${esc(APP_VERSION)}</span>
          </div>
          <div class="window-title">${title}</div>
          <div class="window-controls">
            <button class="window-control close" aria-label="Close" data-action="window-close">
              ${renderIcon(faXmark)}
            </button>
            <button
              class="window-control minimize"
              aria-label="Minimize"
              data-action="window-minimize"
            >
              ${renderIcon(faWindowMinimize)}
            </button>
            <button
              class="window-control maximize"
              aria-label="Maximize"
              data-action="window-maximize"
            >
              ${renderIcon(faUpRightAndDownLeftFromCenter)}
            </button>
          </div>
        </header>
        <div class="app-body">
          ${sidebar()}
          <main class="main">
            <div class="${pageTransition ? 'page-transition' : ''}">
              ${
                page === 'shortcuts'
                  ? shortcutsPage()
                  : page === 'history'
                    ? historyPage()
                    : page === 'server'
                      ? serverPage()
                      : mqttPage()
              }
            </div>
          </main>
        </div>
      </div>
    </div>
  `;
  pageTransition = false;
}
function shortcutsPage(): string {
  return `
    ${
      state.shortcuts.length
        ? `
            <div class="shortcut-grid">
              ${state.shortcuts.map(shortcutCard).join('')}
            </div>
          `
        : `
            <div class="empty">
              <div class="empty-icon">${renderIcon(faBolt)}</div>
              <div style="color: #fff; font-weight: 700; margin-bottom: 8px">No shortcuts yet</div>
              <div style="margin-bottom: 18px">Create a local action to get started.</div>
            </div>
          `
    }
    <div class="add-area" data-slot="dropdown-menu">
      <button
        class="add-button"
        type="button"
        aria-label="Add shortcut"
        aria-controls="add-shortcut-menu"
        aria-expanded="${addMenuOpen}"
        aria-haspopup="menu"
        data-action="toggle-add"
        data-slot="dropdown-menu-trigger"
        data-state="${addMenuOpen ? 'open' : 'closed'}"
      >
        ${renderIcon(faPlus)}
      </button>
      ${
        addMenuOpen
          ? `
              <div
                class="add-menu"
                id="add-shortcut-menu"
                aria-orientation="vertical"
                data-slot="dropdown-menu-content"
                data-state="open"
                role="menu"
                tabindex="-1"
              >
                <button class="add-menu-item" data-action="new-shortcut-type" data-slot="dropdown-menu-item" data-type="app" role="menuitem" tabindex="-1" type="button">
                  ${appIcon('menu-icon')}
                  <span>Application</span>
                </button>
                <button class="add-menu-item" data-action="new-shortcut-type" data-slot="dropdown-menu-item" data-type="deeplink" role="menuitem" tabindex="-1" type="button">
                  ${renderIcon(faGlobe)}
                  <span>Website</span>
                </button>
                <button class="add-menu-item" data-action="record" data-slot="dropdown-menu-item" role="menuitem" tabindex="-1" type="button">
                  ${renderIcon(faLayerGroup)}
                  <span>Record key press</span>
                </button>
                <button class="add-menu-item" data-action="new-shortcut-type" data-slot="dropdown-menu-item" data-type="deeplink" role="menuitem" tabindex="-1" type="button">
                  ${renderIcon(faLink)}
                  <span>Deeplink</span>
                </button>
                <button class="add-menu-item" data-action="new-shortcut-type" data-slot="dropdown-menu-item" data-type="shell" role="menuitem" tabindex="-1" type="button">
                  ${renderIcon(faTerminal)}
                  <span>Shell Command</span>
                </button>
              </div>
            `
          : ''
      }
    </div>
  `;
}
function historyPage(): string {
  return state.history.length
    ? `<div class="history-list">${state.history.map(historyEntry).join('')}</div>`
    : `
        <div class="empty">
          <div class="empty-icon">${renderIcon(faClockRotateLeft)}</div>
          <div style="color: #fff; font-weight: 700; margin-bottom: 8px">No history yet</div>
          <div>Shortcut runs will appear here.</div>
        </div>
      `;
}
function historyEntry(entry: HistoryEntry): string {
  const source =
    entry.source === 'dashwise' ? 'Dashwise' : entry.source === 'mqtt' ? 'MQTT' : 'Manual';
  return `
    <article class="card history-entry">
      <div class="history-icon">${historyIcon(entry)}</div>
      <div class="history-content">
        <div class="history-name">${esc(entry.shortcutName)}</div>
        <div class="history-meta">
          <span class="history-source">${source}</span>
          <span>${esc(typeName[entry.shortcutType])}</span>
          <time datetime="${esc(entry.executedAt)}">${esc(new Date(entry.executedAt).toLocaleString())}</time>
        </div>
        ${entry.error ? `<div class="history-error">${esc(entry.error)}</div>` : ''}
      </div>
      <div class="history-result ${entry.success ? 'success' : 'failure'}">
        ${entry.success ? 'Success' : 'Failed'}
      </div>
    </article>
  `;
}
function historyIcon(entry: HistoryEntry): string {
  return entry.shortcutType === 'app'
    ? appIcon()
    : renderIcon(
        shortcutIconDefinitions[entry.shortcutIcon] ??
          shortcutIconDefinitions[defaultShortcutIcons[entry.shortcutType]],
      );
}
function shortcutCard(s: Shortcut): string {
  return `
    <article class="card shortcut-card">
      <div class="shortcut-head">
        <div class="shortcut-icon${s.type === 'app' ? ' app-shortcut-icon' : ''}">
          ${shortcutIcon(s)}
        </div>
        <div>
          <div class="shortcut-name">${esc(s.name)}</div>
          <div class="shortcut-type">${esc(typeName[s.type])}</div>
        </div>
      </div>
      <div class="shortcut-actions">
        <div class="exposure">
          ${s.exposeToDashwise ? '<span class="pill on">Dashwise</span>' : ''}
          ${s.exposeToMqtt ? '<span class="pill on">MQTT</span>' : ''}
          ${!s.exposeToDashwise && !s.exposeToMqtt ? '<span class="pill">Local only</span>' : ''}
        </div>
        <div class="actions">
          <button class="btn small" aria-label="Run" data-action="run" data-id="${esc(s.id)}">
            ${renderIcon(faPlay)}
          </button>
          <button class="btn small" aria-label="Edit" data-action="edit" data-id="${esc(s.id)}">
            ${renderIcon(faPen)}
          </button>
          <button class="btn small" aria-label="Copy" data-action="duplicate" data-id="${esc(s.id)}">
            ${renderIcon(faCopy)}
          </button>
          <button class="btn small" aria-label="Delete" data-action="delete" data-id="${esc(s.id)}">
            ${renderIcon(faCircleXmark)}
          </button>
        </div>
      </div>
    </article>
  `;
}
function serverPage(): string {
  const s = state.server;
  return `
    <div class="topline">
      <div>
        <div class="eyebrow">Integration</div>
        <h1 class="title">Dashwise Server</h1>
        <p class="subtitle">Make local shortcuts available through your Dashwise instance.</p>
      </div>
      <div class="actions">
        <button class="btn" data-action="server-reconnect">Reconnect</button>
        <button class="btn primary" data-action="server-sync">Sync now</button>
      </div>
    </div>
    <div class="integration-grid">
      <div class="card integration">
        <div class="eyebrow">Connection</div>
        <h3>${status(s.status, s.lastError)}</h3>
        <p>${esc(s.serverUrl || 'No server configured')}</p>
        <p>
          Last connected:
          ${esc(s.connectedAt ? new Date(s.connectedAt).toLocaleString() : 'Never')}
        </p>
      </div>
      <div class="card integration">
        <div class="eyebrow">On-demand app</div>
        <h3>${esc(s.shortcutsAppId || 'Not registered')}</h3>
        <p>
          Exposed shortcuts: ${state.shortcuts.filter((x) => x.exposeToDashwise).length}
          <br />
          Last sync: ${esc(s.lastSyncAt ? new Date(s.lastSyncAt).toLocaleString() : 'Never')}
        </p>
      </div>
    </div>
    <div class="card" style="margin-top: 15px">
      <div class="eyebrow">Server credentials</div>
      <form class="form" id="server-form" style="margin-top: 15px">
        <div class="field">
          <label>Dashwise server URL</label>
          <input
            name="serverUrl"
            required
            value="${esc(s.serverUrl)}"
            placeholder="https://dashwise.example.com"
          />
        </div>
        <div class="field">
          <label>Authentication token</label>
          <input
            name="authToken"
            type="password"
            required
            placeholder="Paste a new token"
          />
        </div>
        <button class="btn primary" style="width: max-content">Save and connect</button>
      </form>
    </div>
    <div class="card" style="margin-top: 15px">
      <div class="eyebrow">Device identity</div>
      <div class="form" style="margin-top: 15px">
        <div class="field">
          <label>Device / session name</label>
          <input id="device-name" value="${esc(state.settings.deviceName)}" />
        </div>
        <div class="field">
          <label>Stable session ID</label>
          <input value="${esc(s.sessionId)}" readonly />
        </div>
        <button class="btn primary" style="width: max-content" data-action="save-device">
          Save name
        </button>
      </div>
    </div>
    <div class="card" style="margin-top: 15px">
      <button class="btn danger" data-action="server-disconnect">Disconnect server</button>
      <span style="color: var(--muted); font-size: 12px; margin-left: 13px">
        Local shortcuts will remain available.
      </span>
    </div>
  `;
}
function mqttPage(): string {
  const m = state.mqtt;
  return `
    <div class="topline">
      <div>
        <div class="eyebrow">Integration</div>
        <h1 class="title">MQTT</h1>
        <p class="subtitle">
          Publish Home Assistant discovery and listen for local shortcut commands.
        </p>
      </div>
    </div>
    <div class="card broker-card">
      <h2 class="broker-heading">Broker configuration</h2>
      <form class="form" id="mqtt-form">
        <div class="form-row">
          <div class="field">
            <label>Broker hostname</label>
            <input name="host" value="${esc(m.host)}" placeholder="homeassistant.local" />
          </div>
          <div class="field">
            <label>Port</label>
            <input name="port" type="number" value="${m.port || 1883}" />
          </div>
        </div>
        <div class="form-row">
          <div class="field">
            <label>Username</label>
            <input name="username" value="${esc(m.username)}" />
          </div>
          <div class="field">
            <label>Password</label>
            <input
              name="password"
              type="password"
              placeholder="Leave blank to keep saved password"
            />
          </div>
        </div>
        <div class="form-row">
          <div class="field">
            <label>Client ID</label>
            <input name="clientId" value="${esc(m.clientId)}" placeholder="Auto-generated" />
          </div>
          <label class="check" style="align-self: end">
            <input name="tls" type="checkbox" ${m.tls ? 'checked' : ''} />
            Use TLS encryption
          </label>
        </div>
      </form>
      <div class="broker-footer">
        <div>${status(m.status, m.lastError)}</div>
        <div class="actions">
          <button class="btn" data-action="mqtt-test">Test connection</button>
          <button class="btn primary" data-action="mqtt-save">Save &amp; connect</button>
        </div>
      </div>
    </div>
    <div class="card" style="margin-top: 15px">
      <div class="eyebrow">Home Assistant discovery</div>
      <h3>${state.shortcuts.filter((x) => x.exposeToMqtt).length} entities published</h3>
      <p class="subtitle">
        Each exposed shortcut becomes a button on the Dashwise Shortcuts Launcher (Desktop) device.
      </p>
    </div>
  `;
}

function formData(form: HTMLFormElement): Record<string, string | boolean> {
  const data = new FormData(form),
    result: Record<string, string | boolean> = {};
  for (const [key, value] of data.entries()) result[key] = typeof value === 'string' ? value : true;
  for (const input of form.querySelectorAll<HTMLInputElement>('input[type=checkbox]'))
    result[input.name] = input.checked;
  return result;
}
function shortcutModal(id?: string, initialType?: ShortcutType): void {
  editingId = id;
  stopRecording();
  const old = id ? state.shortcuts.find((s) => s.id === id) : undefined;
  const chosenType = initialType ?? old?.type ?? 'app';
  const c = old?.configuration ?? {};
  recordedKeys = Array.isArray(c.keys) ? (c.keys as RecordedKey[]) : [];
  root.insertAdjacentHTML(
    'beforeend',
    `
      <div class="modal-wrap" id="shortcut-modal">
        <div class="modal">
          <div class="modal-head">
            <div>
              <div class="eyebrow">${old ? 'Edit shortcut' : 'New shortcut'}</div>
              <h2>${old ? esc(old.name) : 'Create a shortcut'}</h2>
            </div>
            <button class="close" aria-label="Close" data-action="close-modal">
              ${renderIcon(faXmark)}
            </button>
          </div>
          <form class="form" id="shortcut-form">
            <div class="form-row">
              <div class="field">
                <label>Name</label>
                <input name="name" required value="${esc(old?.name)}" placeholder="Open my workspace" />
              </div>
              <div class="field">
                <label>Font Awesome icon</label>
                <select name="icon">${iconOptions(old?.icon || '', chosenType)}</select>
              </div>
            </div>
            <div class="field">
              <label>Action type</label>
              <select name="type" id="shortcut-type">
                <option value="app" ${chosenType === 'app' ? 'selected' : ''}>Open application</option>
                <option value="shell" ${chosenType === 'shell' ? 'selected' : ''}>Shell command</option>
                <option value="deeplink" ${chosenType === 'deeplink' ? 'selected' : ''}>URL / deep link</option>
                <option value="macro" ${chosenType === 'macro' ? 'selected' : ''}>Key press</option>
              </select>
            </div>
            <div id="config-fields"></div>
            <div class="eyebrow">Expose through</div>
            <label class="check">
              <input
                name="exposeToDashwise"
                type="checkbox"
                ${old?.exposeToDashwise ? 'checked' : ''}
                ${state.server.serverUrl ? '' : 'disabled'}
              />
              Dashwise Server
              ${state.server.serverUrl ? '' : '<span style="color: var(--muted)">Configure Server first</span>'}
            </label>
            <label class="check">
              <input
                name="exposeToMqtt"
                type="checkbox"
                ${old?.exposeToMqtt ? 'checked' : ''}
                ${state.mqtt.host ? '' : 'disabled'}
              />
              Home Assistant / MQTT
              ${state.mqtt.host ? '' : '<span style="color: var(--muted)">Configure MQTT first</span>'}
            </label>
            <div class="modal-footer">
              <button type="button" class="btn" data-action="close-modal">Cancel</button>
              <button class="btn primary">${old ? 'Save changes' : 'Create shortcut'}</button>
            </div>
          </form>
        </div>
      </div>
    `,
  );
  const type = document.querySelector<HTMLSelectElement>('#shortcut-type')!;
  const update = () => {
    if (type.value !== 'macro') stopRecording();
    document.querySelector('#config-fields')!.innerHTML = configFields(
      type.value as ShortcutType,
      c,
      recordedKeys,
    );
  };
  type.addEventListener('change', update);
  update();
  void window.launcher.listApps().then((apps) => {
    const list = document.querySelector('#installed-apps');
    if (list)
      list.innerHTML = apps
        .map((app) => `<option value="${esc(app.name)}">${esc(app.path)}</option>`)
        .join('');
  });
}
function configFields(type: ShortcutType, c: Record<string, unknown>, keys: RecordedKey[]): string {
  if (type === 'app')
    return `
      <div class="field">
        <label>Application name</label>
        <input
          name="appName"
          list="installed-apps"
          value="${esc(c.appName)}"
          placeholder="Visual Studio Code"
        />
        <datalist id="installed-apps"></datalist>
      </div>
      <div class="field">
        <label>Application path or executable (optional)</label>
        <input
          name="path"
          value="${esc(c.path)}"
          placeholder="/Applications/Visual Studio Code.app"
        />
      </div>
      <p class="subtitle">
        Choose an installed app suggestion or provide an executable / launcher path for this computer.
      </p>
    `;
  if (type === 'shell')
    return `
      <div class="notice">
        Shell shortcuts execute arbitrary commands on this computer. Only create commands you trust.
      </div>
      <div class="field">
        <label>Command</label>
        <textarea name="command" required placeholder="npm run dev">${esc(c.command)}</textarea>
      </div>
      <div class="field">
        <label>Working directory (optional)</label>
        <input name="cwd" value="${esc(c.cwd)}" placeholder="/path/to/project" />
      </div>
      <div class="field">
        <label>Environment variables (JSON, optional)</label>
        <input
          name="env"
          value="${esc(c.env ? JSON.stringify(c.env) : '')}"
          placeholder='{"MODE":"dev"}'
        />
      </div>
    `;
  if (type === 'deeplink')
    return `
      <div class="field">
        <label>URL or deep link</label>
        <input
          name="url"
          required
          value="${esc(c.url)}"
          placeholder="https://example.com or obsidian://open"
        />
      </div>
    `;
  return `
    <div class="field">
      <label>Key press sequence</label>
      <div class="record-controls">
        <button type="button" class="btn ${recording ? 'recording' : ''}" data-action="record-keys">
          ${recording ? 'Stop recording' : 'Record'}
        </button>
        <span id="recording-status">
          ${recording ? 'Press keys now. Escape also stops recording.' : 'Record keys while this window is focused.'}
        </span>
      </div>
      <div class="recorded-keys-input">
        <div id="recorded-keys" class="recorded-keys">${recordedKeyLabels(keys)}</div>
        <button
          type="button"
          class="recorded-keys-clear"
          aria-label="Clear recorded key presses"
          data-action="clear-recorded-keys"
          ${keys.length ? '' : 'disabled'}
        >
          ${renderIcon(faXmark)}
        </button>
      </div>
      <p class="subtitle">
        Recorded presses replay through the operating system. macOS may ask for Accessibility permission.
      </p>
    </div>
  `;
}
function recordedKeyLabels(keys: RecordedKey[]): string {
  return keys.length
    ? keys.map((key) => `<span class="key-chip">${esc(recordedKeyLabel(key))}</span>`).join('')
    : '<span class="recorded-empty">No key presses recorded.</span>';
}
function closeShortcutModal(): void {
  stopRecording();
  const modal = document.querySelector<HTMLElement>('#shortcut-modal');
  if (!modal || modal.classList.contains('closing')) return;
  modal.classList.add('closing');
  window.setTimeout(() => modal.remove(), 180);
}
function recordedKeyLabel(key: RecordedKey): string {
  const modifiers: Record<RecordedKeyModifier, string> = {
    alt: 'Alt',
    control: 'Ctrl',
    meta: 'Cmd',
    shift: 'Shift',
  };
  return [...key.modifiers.map((modifier) => modifiers[modifier]), key.key].join('+');
}
function updateRecorderUi(): void {
  const button = document.querySelector<HTMLButtonElement>('[data-action="record-keys"]');
  const status = document.querySelector<HTMLElement>('#recording-status');
  const keys = document.querySelector<HTMLElement>('#recorded-keys');
  if (button) {
    button.textContent = recording ? 'Stop recording' : 'Record';
    button.classList.toggle('recording', recording);
  }
  if (status)
    status.textContent = recording
      ? 'Press keys now. Escape also stops recording.'
      : 'Record keys while this window is focused.';
  if (keys) keys.innerHTML = recordedKeyLabels(recordedKeys);
  const clear = document.querySelector<HTMLButtonElement>('[data-action="clear-recorded-keys"]');
  if (clear) clear.disabled = recordedKeys.length === 0;
}
function startRecording(): void {
  recordedKeys = [];
  recording = true;
  lastRecordedKeyAt = performance.now();
  updateRecorderUi();
}
function stopRecording(): void {
  recording = false;
  lastRecordedKeyAt = 0;
  updateRecorderUi();
}
function parseShortcutForm(data: Record<string, string | boolean>): ShortcutInput {
  const type = data.type as ShortcutType;
  let configuration: Record<string, unknown> = {};
  if (type === 'app') configuration = { appName: data.appName || '', path: data.path || '' };
  if (type === 'shell') {
    let env: unknown = {};
    try {
      env = data.env ? JSON.parse(String(data.env)) : {};
    } catch {
      throw new Error('Environment variables must be valid JSON');
    }
    configuration = { command: data.command || '', cwd: data.cwd || '', env };
  }
  if (type === 'deeplink') configuration = { url: data.url || '' };
  if (type === 'macro') configuration = { keys: recordedKeys };
  return {
    name: String(data.name || ''),
    icon: String(data.icon || defaultShortcutIcons[type]),
    type,
    configuration,
    exposeToDashwise: true,
    exposeToMqtt: true,
  };
}
function toast(message: string): void {
  const node = document.createElement('div');
  node.className = 'toast';
  node.textContent = message;
  document.body.append(node);
  setTimeout(() => node.remove(), 2600);
}
async function refresh(): Promise<void> {
  state = await window.launcher.getState();
  render();
}
function closeAddMenu(restoreFocus = false): void {
  addMenuOpen = false;
  document.querySelector<HTMLElement>('[data-slot="dropdown-menu-content"]')?.remove();
  const trigger = document.querySelector<HTMLElement>('[data-slot="dropdown-menu-trigger"]');
  trigger?.setAttribute('aria-expanded', 'false');
  trigger?.setAttribute('data-state', 'closed');
  if (restoreFocus) trigger?.focus();
}
function openAddMenu(focusLast = false): void {
  addMenuOpen = true;
  render();
  const items = document.querySelectorAll<HTMLButtonElement>(
    '[data-slot="dropdown-menu-content"] [role="menuitem"]',
  );
  items[focusLast ? items.length - 1 : 0]?.focus();
}
document.addEventListener('click', async (event) => {
  const target = event.target as HTMLElement;
  if (addMenuOpen && !target.closest('[data-slot="dropdown-menu"]')) closeAddMenu();
  const pageButton = target.closest<HTMLElement>('[data-page]');
  if (pageButton) {
    if (pageButton.dataset.page === page) return;
    page = pageButton.dataset.page!;
    pageTransition = true;
    render();
    return;
  }
  const modeButton = target.closest<HTMLElement>('[data-mode]');
  if (modeButton) {
    selectedMode = modeButton.dataset.mode as 'dashwise' | 'mqtt';
    render();
    return;
  }
  const action = target.closest<HTMLElement>('[data-action]');
  if (!action) return;
  const name = action.dataset.action;
  try {
    if (name === 'open-github') {
      event.preventDefault();
      await window.launcher.openExternal(action.getAttribute('href')!);
    } else if (name === 'window-close') await window.launcher.closeWindow();
    else if (name === 'window-minimize') await window.launcher.minimizeWindow();
    else if (name === 'window-maximize') await window.launcher.toggleMaximizeWindow();
    else if (name === 'onboard-next') {
      onboardingStep = 1;
      render();
    } else if (name === 'mode-next') {
      onboardingStep = 2;
      render();
    } else if (name === 'finish-onboard') {
      const form = document.querySelector<HTMLFormElement>('#onboard-form');
      const data = form ? formData(form) : {};
      if (selectedMode === 'dashwise')
        await window.launcher.configureServer({
          serverUrl: String(data.serverUrl || ''),
          authToken: String(data.authToken || ''),
        });
      else
        await window.launcher.configureMqtt({
          host: String(data.host || ''),
          port: Number(data.port) || 1883,
          username: String(data.username || ''),
          password: String(data.password || ''),
          tls: Boolean(data.tls),
          clientId: String(data.clientId || ''),
        });
      await window.launcher.completeOnboarding(selectedMode);
      await refresh();
    } else if (name === 'new-shortcut') shortcutModal();
    else if (name === 'toggle-add') {
      if (addMenuOpen) closeAddMenu(true);
      else openAddMenu();
    } else if (name === 'new-shortcut-type') {
      closeAddMenu();
      shortcutModal(undefined, action.dataset.type as ShortcutType);
    } else if (name === 'record') {
      closeAddMenu();
      shortcutModal(undefined, 'macro');
    } else if (name === 'record-keys') {
      if (recording) stopRecording();
      else startRecording();
    } else if (name === 'clear-recorded-keys') {
      recordedKeys = [];
      lastRecordedKeyAt = recording ? performance.now() : 0;
      updateRecorderUi();
    } else if (name === 'close-modal') {
      closeShortcutModal();
    } else if (name === 'run') {
      const result = await window.launcher.executeShortcut(action.dataset.id!);
      toast(result.success ? 'Shortcut executed' : result.error || 'Shortcut failed');
      await refresh();
    } else if (name === 'edit') shortcutModal(action.dataset.id);
    else if (name === 'duplicate') {
      await window.launcher.duplicateShortcut(action.dataset.id!);
      toast('Shortcut duplicated');
      await refresh();
    } else if (name === 'delete') {
      const item = state.shortcuts.find((s) => s.id === action.dataset.id);
      if (item && confirm(`Delete ${item.name}?`)) {
        await window.launcher.deleteShortcut(item.id);
        await refresh();
      }
    } else if (name === 'server-reconnect') {
      await window.launcher.reconnectServer();
      toast('Reconnecting to Dashwise…');
      await refresh();
    } else if (name === 'server-sync') {
      await window.launcher.syncServer();
      toast('Shortcuts synced');
      await refresh();
    } else if (name === 'server-disconnect') {
      await window.launcher.disconnectServer();
      await refresh();
    } else if (name === 'save-device') {
      await window.launcher.setDeviceName(
        document.querySelector<HTMLInputElement>('#device-name')!.value,
      );
      toast('Device name saved');
      await refresh();
    } else if (name === 'mqtt-test') {
      const form = document.querySelector<HTMLFormElement>('#mqtt-form')!,
        d = formData(form);
      const result = await window.launcher.testMqtt({
        host: String(d.host),
        port: Number(d.port),
        username: String(d.username),
        password: String(d.password),
        tls: Boolean(d.tls),
        clientId: String(d.clientId),
      });
      toast(result.success ? 'Connection successful' : result.error || 'Connection failed');
    } else if (name === 'mqtt-save') {
      const form = document.querySelector<HTMLFormElement>('#mqtt-form')!,
        d = formData(form);
      await window.launcher.configureMqtt({
        host: String(d.host),
        port: Number(d.port),
        username: String(d.username),
        password: String(d.password),
        tls: Boolean(d.tls),
        clientId: String(d.clientId),
      });
      toast('MQTT saved');
      await refresh();
    }
  } catch (error) {
    toast(error instanceof Error ? error.message : String(error));
  }
});
document.addEventListener('keydown', (event) => {
  const target = event.target as HTMLElement;
  const trigger = target.closest<HTMLElement>('[data-slot="dropdown-menu-trigger"]');
  if (trigger) {
    if (event.key === 'Escape' && addMenuOpen) {
      event.preventDefault();
      closeAddMenu(true);
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (addMenuOpen)
        document
          .querySelector<HTMLButtonElement>('[data-slot="dropdown-menu-content"] [role="menuitem"]')
          ?.focus();
      else openAddMenu();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (addMenuOpen) {
        const items = document.querySelectorAll<HTMLButtonElement>(
          '[data-slot="dropdown-menu-content"] [role="menuitem"]',
        );
        items[items.length - 1]?.focus();
      } else openAddMenu(true);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (addMenuOpen) closeAddMenu(true);
      else openAddMenu();
    }
    return;
  }
  const menu = target.closest<HTMLElement>('[data-slot="dropdown-menu-content"]');
  if (!menu) return;
  const items = Array.from(menu.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'));
  const current = target.closest<HTMLButtonElement>('[role="menuitem"]');
  const currentIndex = current ? items.indexOf(current) : -1;
  if (event.key === 'Escape') {
    event.preventDefault();
    closeAddMenu(true);
  } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    const direction = event.key === 'ArrowDown' ? 1 : -1;
    items[(currentIndex + direction + items.length) % items.length]?.focus();
  } else if (event.key === 'Home' || event.key === 'End') {
    event.preventDefault();
    items[event.key === 'Home' ? 0 : items.length - 1]?.focus();
  } else if (event.key === 'Tab') closeAddMenu();
});
document.addEventListener('submit', async (event) => {
  const form = event.target as HTMLFormElement;
  event.preventDefault();
  try {
    if (form.id === 'server-form') {
      const d = formData(form);
      await window.launcher.configureServer({
        serverUrl: String(d.serverUrl),
        authToken: String(d.authToken),
      });
      toast('Server connection started');
      await refresh();
      return;
    }
    if (form.id !== 'shortcut-form') return;
    stopRecording();
    const input = parseShortcutForm(formData(form));
    await window.launcher.saveShortcut(input, editingId);
    closeShortcutModal();
    toast(editingId ? 'Shortcut updated' : 'Shortcut created');
    editingId = undefined;
    await refresh();
  } catch (error) {
    toast(error instanceof Error ? error.message : String(error));
  }
});
window.launcher.onStateChanged(() => void refresh());
document.addEventListener('keydown', (event) => {
  if (!recording || !document.querySelector('#shortcut-modal')) return;
  event.preventDefault();
  event.stopPropagation();
  if (event.key === 'Escape') {
    stopRecording();
    return;
  }
  if (event.repeat || ['Alt', 'Control', 'Meta', 'Shift'].includes(event.key)) return;
  const now = performance.now();
  recordedKeys.push({
    code: event.code,
    key: event.key,
    modifiers: [
      event.altKey ? 'alt' : undefined,
      event.ctrlKey ? 'control' : undefined,
      event.metaKey ? 'meta' : undefined,
      event.shiftKey ? 'shift' : undefined,
    ].filter((modifier): modifier is RecordedKeyModifier => Boolean(modifier)),
    delay: recordedKeys.length ? Math.round(Math.max(0, now - lastRecordedKeyAt)) : 0,
  });
  lastRecordedKeyAt = now;
  updateRecorderUi();
});
void refresh();
