import { BrowserWindow } from 'electron';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { ExecutionResult, RecordedKey, RecordedKeyModifier } from '../../shared/types.js';

const execFileAsync = promisify(execFile);
const modifierNames: Record<RecordedKeyModifier, string> = {
  alt: 'option',
  control: 'control',
  meta: 'command',
  shift: 'shift',
};

const macKeyCodes: Record<string, number> = {
  KeyA: 0,
  KeyS: 1,
  KeyD: 2,
  KeyF: 3,
  KeyH: 4,
  KeyG: 5,
  KeyZ: 6,
  KeyX: 7,
  KeyC: 8,
  KeyV: 9,
  KeyB: 11,
  KeyQ: 12,
  KeyW: 13,
  KeyE: 14,
  KeyR: 15,
  KeyY: 16,
  KeyT: 17,
  Digit1: 18,
  Digit2: 19,
  Digit4: 21,
  Digit3: 20,
  Digit5: 23,
  Digit6: 22,
  Equal: 24,
  Digit9: 25,
  Digit7: 26,
  Minus: 27,
  Digit8: 28,
  Digit0: 29,
  BracketRight: 30,
  KeyO: 31,
  KeyU: 32,
  BracketLeft: 33,
  KeyI: 34,
  KeyP: 35,
  Enter: 36,
  KeyL: 37,
  KeyJ: 38,
  Quote: 39,
  KeyK: 40,
  Semicolon: 41,
  Backslash: 42,
  Comma: 43,
  Slash: 44,
  KeyN: 45,
  KeyM: 46,
  Period: 47,
  Tab: 48,
  Space: 49,
  Backquote: 50,
  Backspace: 51,
  Escape: 53,
  ArrowLeft: 123,
  ArrowRight: 124,
  ArrowDown: 125,
  ArrowUp: 126,
  F1: 122,
  F2: 120,
  F3: 99,
  F4: 118,
  F5: 96,
  F6: 97,
  F7: 98,
  F8: 100,
  F9: 101,
  F10: 109,
  F11: 103,
  F12: 111,
  Delete: 117,
};

const linuxKeyNames: Record<string, string> = {
  Enter: 'Return',
  Backspace: 'BackSpace',
  Escape: 'Escape',
  Tab: 'Tab',
  Space: 'space',
  Delete: 'Delete',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  PageUp: 'Page_Up',
  PageDown: 'Page_Down',
  Home: 'Home',
  End: 'End',
  Insert: 'Insert',
  Minus: 'minus',
  Equal: 'equal',
  BracketLeft: 'bracketleft',
  BracketRight: 'bracketright',
  Backslash: 'backslash',
  Semicolon: 'semicolon',
  Quote: 'apostrophe',
  Comma: 'comma',
  Period: 'period',
  Slash: 'slash',
  Backquote: 'grave',
};

const delaySeconds = (ms: number) => (Math.max(0, Math.min(ms, 10000)) / 1000).toFixed(3);
const sleep = (ms: number) => `sleep ${delaySeconds(ms)}`;
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const appleScriptString = (value: string) =>
  `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
const usingClause = (modifiers: RecordedKeyModifier[]): string => {
  const names = modifiers.map((modifier) => `${modifierNames[modifier]} down`);
  return names.length ? ` using {${names.join(', ')}}` : '';
};

function macScript(keys: RecordedKey[]): string | undefined {
  const lines = ['tell application "System Events"'];
  for (const key of keys) {
    const code = macKeyCodes[key.code];
    if (code === undefined && key.key.length !== 1) return undefined;
    lines.push(`delay ${delaySeconds(key.delay)}`);
    lines.push(
      code === undefined
        ? `keystroke ${appleScriptString(key.key)}${usingClause(key.modifiers)}`
        : `key code ${code}${usingClause(key.modifiers)}`,
    );
  }
  lines.push('end tell');
  return lines.join('\n');
}

function linuxKey(key: RecordedKey): string | undefined {
  const value =
    linuxKeyNames[key.code] ??
    (key.code.startsWith('Key') ? key.code.slice(3).toLowerCase() : undefined);
  if (!value && key.code.startsWith('Digit')) return key.code.slice(5);
  if (!value && /^F\d+$/.test(key.code)) return key.code;
  return value;
}

function linuxScript(keys: RecordedKey[]): string | undefined {
  const lines: string[] = [];
  for (const key of keys) {
    const name = linuxKey(key);
    if (!name) return undefined;
    const modifiers = key.modifiers.map(
      (modifier) => ({ alt: 'alt', control: 'ctrl', meta: 'super', shift: 'shift' })[modifier],
    );
    lines.push(sleep(key.delay));
    lines.push(`xdotool key --clearmodifiers ${[...modifiers, name].join('+')}`);
  }
  return lines.join('\n');
}

const windowsSpecialKeys: Record<string, string> = {
  Enter: '{ENTER}',
  Backspace: '{BACKSPACE}',
  Escape: '{ESC}',
  Tab: '{TAB}',
  Space: ' ',
  Delete: '{DELETE}',
  ArrowLeft: '{LEFT}',
  ArrowRight: '{RIGHT}',
  ArrowUp: '{UP}',
  ArrowDown: '{DOWN}',
  Home: '{HOME}',
  End: '{END}',
  PageUp: '{PGUP}',
  PageDown: '{PGDN}',
  Insert: '{INSERT}',
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  Semicolon: ';',
  Quote: "'",
  Comma: ',',
  Period: '.',
  Slash: '/',
  Backquote: '`',
};

function windowsKey(key: RecordedKey): string | undefined {
  if (key.modifiers.includes('meta')) return undefined;
  const value =
    windowsSpecialKeys[key.code] ??
    (key.code.startsWith('Key') ? key.code.slice(3).toLowerCase() : undefined);
  const base =
    value ??
    (key.code.startsWith('Digit')
      ? key.code.slice(5)
      : /^F\d+$/.test(key.code)
        ? `{${key.code}}`
        : undefined);
  if (!base) return undefined;
  const escaped = base.length === 1 && '^%+~(){}'.includes(base) ? `{${base}}` : base;
  return `${key.modifiers.includes('control') ? '^' : ''}${key.modifiers.includes('alt') ? '%' : ''}${key.modifiers.includes('shift') ? '+' : ''}${escaped}`;
}

function windowsScript(keys: RecordedKey[]): string | undefined {
  const lines = ['Add-Type -AssemblyName System.Windows.Forms'];
  for (const key of keys) {
    const value = windowsKey(key);
    if (!value) return undefined;
    lines.push(`Start-Sleep -Milliseconds ${Math.max(0, Math.min(key.delay, 10000))}`);
    lines.push(`[System.Windows.Forms.SendKeys]::SendWait('${value.replace(/'/g, "''")}')`);
  }
  return lines.join('; ');
}

export async function playKeySequence(keys: RecordedKey[]): Promise<ExecutionResult> {
  if (!keys.length) return { success: false, error: 'No key presses recorded' };
  const script =
    process.platform === 'darwin'
      ? macScript(keys)
      : process.platform === 'linux'
        ? linuxScript(keys)
        : process.platform === 'win32'
          ? windowsScript(keys)
          : undefined;
  if (!script)
    return { success: false, error: `Recorded key is not supported on ${process.platform}` };
  const focusedWindow = BrowserWindow.getFocusedWindow();
  try {
    if (focusedWindow?.isVisible()) {
      focusedWindow.hide();
      await wait(100);
    }
    if (process.platform === 'darwin') await execFileAsync('osascript', ['-e', script]);
    else if (process.platform === 'linux') await execFileAsync('sh', ['-c', script]);
    else
      await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script]);
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    if (focusedWindow?.isDestroyed() === false) {
      focusedWindow.show();
      focusedWindow.focus();
    }
  }
}
