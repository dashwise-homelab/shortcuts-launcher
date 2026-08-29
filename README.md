# Dashwise Desktop Launcher

Electron desktop launcher for local shortcuts exposed through Dashwise Server and Home Assistant MQTT Discovery.

## Run locally

```sh
npm install
npm run build
npm start
```

The first launch walks through connection setup. Local shortcut execution does not depend on either remote integration being online.

## Supported shortcuts

- Open application
- Shell command (executed only by the Electron main process)
- URL / deep link
- Ordered macro steps (`shortcut:<id>` and `delay:<milliseconds>`)

Shortcut IDs are generated once and retained in the local SQLite database. Dashwise and MQTT only select those IDs; they never send executable command definitions.

## Packaging

`npm run dist` builds the application and produces the platform package configured in `electron-builder` for the current operating system.
