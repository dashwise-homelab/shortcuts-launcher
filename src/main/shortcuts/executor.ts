import { shell } from 'electron';
import { spawn } from 'node:child_process';
import path from 'node:path';
import type { ExecutionResult, Shortcut } from '../../shared/types.js';
import { Store } from '../storage/db.js';

const asString = (v: unknown) => typeof v === 'string' ? v : '';
const runProcess = (command: string, args: string[], options: { cwd?: string; env?: NodeJS.ProcessEnv; shell?: boolean } = {}): Promise<ExecutionResult> => new Promise((resolve) => {
  if (!command.trim()) return resolve({ success: false, error: 'No command configured' });
  const child = spawn(command, args, { cwd: options.cwd || undefined, env: { ...process.env, ...(options.env || {}) }, shell: options.shell ?? false, detached: !options.shell, stdio: 'ignore' });
  child.once('error', (error) => resolve({ success: false, error: error.message }));
  child.once('close', (code) => resolve(code === 0 || code === null ? { success: true } : { success: false, error: `Process exited with code ${code}` }));
  if (!options.shell) child.unref();
});

export class ShortcutExecutor {
  constructor(private readonly store: Store) {}
  async executeShortcut(id: string, stack = new Set<string>()): Promise<ExecutionResult> {
    const shortcut = this.store.shortcut(id);
    if (!shortcut) return { success: false, error: 'Shortcut not found' };
    if (stack.has(id)) return { success: false, error: 'Macro contains a circular shortcut reference' };
    stack.add(id);
    try { return await this.execute(shortcut, stack); } catch (error) { return { success: false, error: error instanceof Error ? error.message : String(error) }; } finally { stack.delete(id); }
  }
  private async execute(shortcut: Shortcut, stack: Set<string>): Promise<ExecutionResult> {
    const c = shortcut.configuration;
    if (shortcut.type === 'app') {
      const appName = asString(c.appName), target = asString(c.path) || appName;
      if (process.platform === 'darwin' && appName) return runProcess('open', ['-a', appName]);
      if (process.platform === 'linux' && target.endsWith('.desktop')) return runProcess('gtk-launch', [path.basename(target, '.desktop')]);
      return runProcess(target, [], { shell: process.platform === 'win32' });
    }
    if (shortcut.type === 'shell') return runProcess(asString(c.command), [], { cwd: asString(c.cwd) || undefined, env: (c.env && typeof c.env === 'object' ? c.env as NodeJS.ProcessEnv : undefined), shell: true });
    if (shortcut.type === 'deeplink') { const url = asString(c.url); if (!/^[a-z][a-z0-9+.-]*:/i.test(url)) return { success: false, error: 'Enter a valid URL or deep link' }; await shell.openExternal(url); return { success: true }; }
    const steps = Array.isArray(c.steps) ? c.steps as Array<Record<string, unknown>> : [];
    for (const step of steps) {
      if (step.kind === 'delay') { await new Promise((r) => setTimeout(r, Math.max(0, Number(step.ms) || 0))); continue; }
      const result = await this.executeShortcut(asString(step.shortcutId), stack);
      if (!result.success && !step.continueOnError) return result;
    }
    return { success: true };
  }
}
