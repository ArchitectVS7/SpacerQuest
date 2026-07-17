// ============================================================================
//  T-1701 · Electron preload — the `window.sqNative` bridge
// ============================================================================
//
// Runs in an isolated world BEFORE the renderer's own scripts. It seeds the
// key/value store SYNCHRONOUSLY (`sendSync`) so `window.sqNative.initialData` is
// populated in time for the renderer's `store.ts` module-load `init()`, then
// exposes a tiny synchronous write/remove API the UI's storage adapter drives.
//
// A sandboxed preload (webPreferences.sandbox = true) may still `require`
// 'electron' for `contextBridge` / `ipcRenderer` — the only import here.

import { contextBridge, ipcRenderer } from 'electron';

interface BootPayload {
  data: Record<string, string>;
  fileExisted: boolean;
}

// Synchronous handshake: main returns the whole store + whether its file already
// existed. Must resolve before any renderer script reads persisted state.
const boot = ipcRenderer.sendSync('sq:load-all') as BootPayload | undefined;

contextBridge.exposeInMainWorld('sqNative', {
  initialData: boot?.data ?? {},
  fileExisted: boot?.fileExisted ?? false,
  write: (key: string, value: string): void => {
    ipcRenderer.send('sq:write', key, value);
  },
  remove: (key: string): void => {
    ipcRenderer.send('sq:remove', key);
  },
  // T-1702 · Steam bridge. Fire-and-forget forwarders only — no game logic, no engine
  // import. The renderer forwards the typed engine events it already scans plus a
  // (system, day) presence snapshot; ALL Steam logic lives in the main process. The
  // payloads are JSON-serializable (engine events survive JSON round-trip by law). On
  // the web build there is no preload, so `window.sqNative` is undefined and the
  // renderer's optional chaining no-ops — the web build is byte-for-byte unchanged.
  steam: {
    sendEvents: (events: unknown[]): void => {
      ipcRenderer.send('sq:steam-events', events);
    },
    setPresence: (systemId: number, day: number): void => {
      ipcRenderer.send('sq:steam-presence', systemId, day);
    },
  },
});
