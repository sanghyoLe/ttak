import { defineConfig } from '@apps-in-toss/web-framework/config';
import { TOSS_APP_NAME } from './src/app-config';

export default defineConfig({
  appName: TOSS_APP_NAME,
  brand: { primaryColor: '#E8E93F' },
  webView: { bounces: false, pullToRefreshEnabled: false },
  permissions: [],
  webBundleDir: 'dist',
});
