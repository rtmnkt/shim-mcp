# Claude Code Memory - ShimMCP Project

## TDD開発手順 (t-wada Method)

### 基本原則
- **Red-Green-Refactor**サイクルを厳密に守る
- 最小限のテストから始める
- 複雑な実装は一度削除し、シンプルに開始
- テストが失敗することを確認してから実装する

### 開発手順

#### 1. 準備フェーズ
```bash
# 既存の複雑な実装を削除
# テスト環境を最小限に整理
# Jest設定の修正
```

#### 2. Red-Green-Refactorサイクル

**Red (失敗するテストを書く)**
```typescript
test('should exist', () => {
  const ShimMCPServer = require('../src/core/ShimMCPServer.js').ShimMCPServer;
  expect(ShimMCPServer).toBeDefined();
});
```

**Green (最小限の実装でテストを通す)**
```typescript
export class ShimMCPServer {
  constructor() {
    // 最小限の実装から始める
  }
}
```

**Refactor (必要に応じて改善)**
- コードの重複を除去
- 可読性を向上
- 設計を改善

#### 3. 段階的機能追加

1. **存在確認** → インスタンス化 → 基本機能 → 詳細仕様
2. 各ステップで必ずRed→Green→Refactorを実践
3. テストが通ることを確認してから次の機能に進む

### 実践例

```typescript
// Step 1: Red
test('should provide uptime in status', () => {
  const status = server.getStatus();
  expect(status.uptime).toBeDefined(); // 失敗することを確認
});

// Step 2: Green  
getStatus() {
  return {
    uptime: 0  // 最小限の実装
  };
}

// Step 3: Refactor (必要に応じて)
```

### 重要なポイント

- **テストファーストを徹底**: 実装前に必ずテストを書く
- **最小限の実装**: テストを通すために必要最小限のコードのみ
- **段階的な複雑化**: 一度に多くを実装しない
- **継続的なリファクタリング**: 機能追加後に設計を改善

### テスト構造

```typescript
describe('ShimMCPServer', () => {
  test('should exist', () => {
    // 基本的な存在確認
  });
  
  test('should be instantiable', () => {
    // インスタンス化の確認
  });
  
  test('should provide status', () => {
    // 基本機能の確認
  });
  
  test('should provide uptime in status', () => {
    // 詳細仕様の確認
  });
});
```

### コマンド

```bash
# テスト実行
npm test

# ウォッチモード（推奨）
npm run test:watch

# テストUI（vitest）
npm run test:ui
```

## vibelogger統合

### 重要: Vitest必須

- **vibeloggerはESMモジュールのため、テストフレームワークにはVitest必須**
- JestはESMサポートが不完全でvibelogger使用時に問題発生
- VitestはESMネイティブサポートでvibeloggerが完全動作

### vibelogger設定済み

- 全コンポーネントでvibelogger統合完了
- 構造化ログで動作確認・デバッグが可能
- `./logs/`ディレクトリに自動出力

## 次回の開発指針

1. 新機能追加時は必ずRed→Green→Refactorサイクルを守る
2. 複雑な要求も小さなステップに分解する
3. テストが失敗することを確認してから実装に移る
4. 最小限の実装でテストを通した後、必要に応じてリファクタリング

## 学んだ教訓

- 複雑な既存実装は一度削除してTDDで再構築する方が効率的
- テストの可読性は実装の可読性と同じく重要
- 小さなステップの積み重ねが確実な実装につながる