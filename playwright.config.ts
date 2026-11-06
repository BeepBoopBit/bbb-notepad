import { defineConfig } from '@playwright/test';
const externalURL = process.env.BBB_NOTES_TEST_URL;
export default defineConfig({
  testDir: './tests',
  use: { baseURL:externalURL || 'http://127.0.0.1:1420', headless:true },
  webServer: externalURL ? undefined : {command:'npm run dev',url:'http://127.0.0.1:1420',reuseExistingServer:!process.env.CI},
});
