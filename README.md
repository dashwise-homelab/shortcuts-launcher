# Dashwise Shortcuts Launcher (Desktop)

Electron desktop launcher for local shortcuts exposed through Dashwise Server and Home Assistant MQTT Discovery.

## Run locally

```sh
npm install
npm run build
npm start
```

The first launch walks through connection setup. Local shortcut execution does not depend on either remote integration being online.

## Formatting

Run `npm run format` to format source, build scripts, and project configuration. Use `npm run format:check` in CI to verify formatting without changing files.

## Supported shortcuts

- Open application
- Shell command (executed only by the Electron main process)
- URL / deep link
- Recorded key press macros, including modifier combinations and press timing

Record macros from the shortcut editor while the launcher window is focused. Playback sends the
recorded keys to the active operating-system window. macOS requires Accessibility permission for
System Events; Linux requires `xdotool`.

Shortcut IDs are generated once and retained in the local SQLite database. Dashwise and MQTT only select those IDs; they never send executable command definitions.

## Packaging

`npm run dist` builds the application and produces the platform package configured in `electron-builder` for the current operating system.
