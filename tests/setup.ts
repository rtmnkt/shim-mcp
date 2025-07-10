// t-wadaさんのTDD手法に従い、最小限のテストセットアップから始める
// Vitest環境設定

import { vi } from 'vitest';

// テストのタイムアウトを設定（Vitestでは個別テストでtimeoutを指定）
vi.setConfig({ testTimeout: 10000 });