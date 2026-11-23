import { createRoot } from 'react-dom/client';
import { getCurrentWindow } from '@tauri-apps/api/window';
import App from './app/App';
import { desktop } from './platform/environment';

const sticky = desktop && getCurrentWindow().label === 'sticky';
createRoot(document.getElementById('root')!).render(<App sticky={sticky} />);
