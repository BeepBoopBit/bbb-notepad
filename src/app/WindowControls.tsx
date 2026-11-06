import { useEffect, useState } from 'react';
import { desktop } from '../platform/environment';

type Props = { onError: (message: string) => void };
export function WindowControls({ onError }: Props) {
  const [maximized, setMaximized] = useState(false);
  useEffect(() => {
    if (!desktop) return;
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void import('@tauri-apps/api/window').then(async ({ getCurrentWindow }) => {
      const appWindow = getCurrentWindow();
      const refresh = async () => {
        const value = await appWindow.isMaximized();
        if (!disposed) setMaximized(value);
      };
      const stop = await appWindow.onResized(() => { void refresh().catch(() => {}); });
      if (disposed) stop(); else unlisten = stop;
      await refresh();
    }).catch(error => { if (!disposed) onError(`Could not read window state: ${String(error)}`); });
    return () => { disposed = true; unlisten?.(); };
  }, [onError]);

  async function action(kind: 'minimize' | 'maximize' | 'close') {
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      const appWindow = getCurrentWindow();
      if (kind === 'minimize') await appWindow.minimize();
      if (kind === 'maximize') { await appWindow.toggleMaximize(); setMaximized(await appWindow.isMaximized()); }
      // Request closure so the app's existing save-before-close handler runs.
      if (kind === 'close') await appWindow.close();
    } catch (error) { onError(`Could not ${kind} the window: ${String(error)}`); }
  }
  if (!desktop) return null;
  return <div className="window-controls" aria-label="Window controls">
    <button aria-label="Minimize window" title="Minimize" onClick={() => void action('minimize')}><svg viewBox="0 0 12 12"><path d="M1 6h10" /></svg></button>
    <button aria-label={maximized ? 'Restore window' : 'Maximize window'} title={maximized ? 'Restore' : 'Maximize'} onClick={() => void action('maximize')}><svg viewBox="0 0 12 12">{maximized ? <path d="M3.5 3.5v-2h7v7h-2m-7-5h7v7h-7z"/> : <rect x="1.5" y="1.5" width="9" height="9"/>}</svg></button>
    <button className="window-close" aria-label="Close window" title="Close window" onClick={() => void action('close')}><svg viewBox="0 0 12 12"><path d="m1.5 1.5 9 9m0-9-9 9"/></svg></button>
  </div>;
}
