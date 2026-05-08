# MeetRealTimeTranslator

Google Meet上でOpenAI Realtime API（gpt-realtime-translate）を使った**双方向リアルタイム同時通訳**Chrome Extension（Manifest V3）。

あなたが日本語で話せば相手に英語で届き、相手が英語で話せば日本語で聞こえます。

## 必要要件

- Chrome 111+
- OpenAI API Key（Realtime API利用可能なプラン）

## インストール手順

### 1. ビルド

```bash
npm install
npm run build
```

### 2. Chromeに読み込み

1. Chrome → `chrome://extensions/` を開く
2. 「デベロッパーモード」をオンにする（右上トグル）
3. 「パッケージ化されていない拡張機能を読み込む」をクリック
4. `dist/` ディレクトリを選択

## 使い方

1. **Google Meet** でミーティングに参加
2. 拡張機能アイコンをクリック → **Popup** を開く
3. **OpenAI API Key** を入力
4. 言語ペアを設定（例: You speak 日本語 / They speak English）
5. **Start Translation** をクリック
6. 接続完了後、各自の言語で話すとリアルタイムで同時通訳される

## アーキテクチャ

```
                    Direction 1 (あなた→相手):
                    マイク(日本語) → getUserMedia override
                      → OpenAI Translation → 英語音声
                      → AudioContext mix → Meetのマイクストリーム → 相手に届く

                    Direction 2 (相手→あなた):
                    タブ音声(英語) → tabCapture → Offscreen
                      → OpenAI Translation → 日本語音声
                      → ローカルスピーカーで再生
```

### コンポーネント

| コンポーネント | 役割 |
|---|---|
| **inject.js** (MAIN world) | getUserMediaオーバーライド、AudioContext音声ミックス、WebRTC接続（送信方向） |
| **content.js** (ISOLATED world) | inject↔backgroundブリッジ、字幕オーバーレイUI |
| **background.js** (Service Worker) | Ephemeral Token取得、SDP交換API呼び出し、tabCapture管理 |
| **offscreen.js** (Offscreen Document) | WebRTC接続（受信方向: タブ音声→翻訳→ローカル再生） |
| **Popup** (React) | API Key、言語ペア、音量、ステータス表示 |

### SDP交換フロー（CSP回避）

inject.js（MAIN world）はMeetのCSPによりOpenAI APIに直接fetchできないため、SDP交換をbackground経由でリレーします：

```
inject.js → postMessage → content.js → chrome.runtime.sendMessage → background.js → OpenAI API
                                                                                     ↓
inject.js ← postMessage ← content.js ← sendResponse ← background.js ← SDP answer
```

## 開発

```bash
npm run dev      # watch mode
npm run build    # production build
npm run clean    # dist削除
npx tsc --noEmit # 型チェック
```

## 技術スタック

- TypeScript (strict)
- React 18 + Vite 6
- Tailwind CSS v4
- Web Audio API (AudioContext, MediaStreamDestination, GainNode)
- chrome.tabCapture + chrome.offscreen + chrome.scripting
- OpenAI Realtime API Translation Session (WebRTC)

## トラブルシューティング

### 「Meetページをリロードしてください」と表示される
- inject.jsは`document_start`で実行されるため、拡張機能更新後はMeetページをF5リロードしてください

### 翻訳が開始されない
- API Keyが正しいか確認
- Service WorkerのDevTools（chrome://extensions/ → Service Workerリンク）で`[MRT:BG]`ログを確認
- MeetページのDevTools（F12）で`[MRT:INJECT]`、`[MRT:CONTENT]`ログを確認

### 相手に翻訳音声が届かない
- Meetでマイクが有効になっているか確認
- MeetページをリロードしてからStart Translationを押し直す

## ライセンス

MIT
