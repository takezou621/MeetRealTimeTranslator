# MeetRealTimeTranslator

[English](#english) | [日本語](#日本語)

---

<a id="english"></a>

## English

A Chrome Extension (Manifest V3) that provides **bidirectional real-time simultaneous interpretation** on Google Meet using the OpenAI Realtime API (`gpt-realtime-translate`).

Speak in Japanese and your counterpart hears English. They speak in English and you hear Japanese.

### Requirements

- Chrome 111+
- OpenAI API Key (with Realtime API access)

### Installation

```bash
npm install
npm run build
```

1. Open `chrome://extensions/` in Chrome
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select the `dist/` directory

### Usage

1. Join a meeting on **Google Meet**
2. Click the extension icon to open the **Popup**
3. Enter your **OpenAI API Key**
4. Set your language pair (e.g. You speak: 日本語 / They speak: English)
5. Click **Start Translation**
6. Speak in your language — your counterpart hears the translation in their language

### Architecture

```
Direction 1 (You → Counterpart):
Microphone → getUserMedia override (inject.js MAIN world)
  → AudioContext mix → OpenAI Translation Session A
  → Translated audio → Meet's mic stream → other participants

Direction 2 (Counterpart → You):
Tab audio → tabCapture → Offscreen Document
  → OpenAI Translation Session B → Translated audio → local speakers

SDP Exchange (CSP-safe):
inject.js → content.js → background.js → OpenAI API → content.js → inject.js
```

### Components

| Component | Role |
|---|---|
| **inject.js** (MAIN world) | getUserMedia override, AudioContext audio mixing, outgoing WebRTC |
| **content.js** (ISOLATED world) | inject↔background bridge, subtitle overlay UI |
| **background.js** (Service Worker) | Ephemeral Token, SDP exchange, tabCapture management |
| **offscreen.js** (Offscreen Document) | Incoming WebRTC (tab audio → translation → local playback) |
| **Popup** (React) | Language pair, API key, volume, status display |

### Development

```bash
npm run dev      # watch mode
npm run build    # production build
npm run clean    # remove dist/
npx tsc --noEmit # type check
```

### Tech Stack

- TypeScript (strict) / React 18 / Vite 6
- Tailwind CSS v4 / Web Audio API
- chrome.tabCapture / chrome.offscreen / chrome.scripting
- OpenAI Realtime API Translation Session (WebRTC)

### Troubleshooting

- **"Reload the Meet page" appears**: inject.js runs at `document_start`. Reload the Meet page (F5) after updating the extension.
- **Translation doesn't start**: Check the API Key. Open Service Worker DevTools (`chrome://extensions/` → "Service Worker" link) for `[MRT:BG]` logs.
- **Counterpart can't hear translation**: Ensure the mic is enabled in Meet. Reload the Meet page and retry.

### License

MIT

---

<a id="日本語"></a>

## 日本語

OpenAI Realtime API（gpt-realtime-translate）を使った**双方向リアルタイム同時通訳**Chrome Extension（Manifest V3）。

あなたが日本語で話せば相手に英語で届き、相手が英語で話せば日本語で聞こえます。

### 必要要件

- Chrome 111+
- OpenAI API Key（Realtime API利用可能なプラン）

### インストール手順

```bash
npm install
npm run build
```

1. Chrome → `chrome://extensions/` を開く
2. 「デベロッパーモード」をオンにする（右上トグル）
3. 「パッケージ化されていない拡張機能を読み込む」をクリック
4. `dist/` ディレクトリを選択

### 使い方

1. **Google Meet** でミーティングに参加
2. 拡張機能アイコンをクリック → **Popup** を開く
3. **OpenAI API Key** を入力
4. 言語ペアを設定（例: You speak 日本語 / They speak English）
5. **Start Translation** をクリック
6. 接続完了後、各自の言語で話すとリアルタイムで同時通訳されます

### アーキテクチャ

```
方向1（あなた→相手）:
マイク → getUserMedia オーバーライド（inject.js MAIN world）
  → AudioContext 音声ミックス → OpenAI Translation Session A
  → 翻訳音声 → Meetのマイクストリーム → 相手に届く

方向2（相手→あなた）:
タブ音声 → tabCapture → Offscreen Document
  → OpenAI Translation Session B → 翻訳音声 → ローカルスピーカーで再生

SDP交換（CSP回避ルーティング）:
inject.js → content.js → background.js → OpenAI API → content.js → inject.js
```

### コンポーネント

| コンポーネント | 役割 |
|---|---|
| **inject.js** (MAIN world) | getUserMediaオーバーライド、AudioContext音声ミックス、送信方向WebRTC |
| **content.js** (ISOLATED world) | inject↔backgroundブリッジ、字幕オーバーレイUI |
| **background.js** (Service Worker) | Ephemeral Token取得×2、SDP交換API呼び出し、tabCapture管理 |
| **offscreen.js** (Offscreen Document) | 受信方向WebRTC（タブ音声→翻訳→ローカル再生） |
| **Popup** (React) | 言語ペア設定、API Key、音量、ステータス表示 |

### 開発

```bash
npm run dev      # watch mode
npm run build    # プロダクションビルド
npm run clean    # dist削除
npx tsc --noEmit # 型チェック
```

### 技術スタック

- TypeScript (strict) / React 18 / Vite 6
- Tailwind CSS v4 / Web Audio API
- chrome.tabCapture / chrome.offscreen / chrome.scripting
- OpenAI Realtime API Translation Session (WebRTC)

### トラブルシューティング

- **「Meetページをリロードしてください」と表示される**: inject.jsは`document_start`で実行されるため、拡張機能更新後はMeetページをF5リロードしてください
- **翻訳が開始されない**: API Keyが正しいか確認。Service WorkerのDevTools（chrome://extensions/ → Service Workerリンク）で`[MRT:BG]`ログを確認
- **相手に翻訳音声が届かない**: Meetでマイクが有効になっているか確認。MeetページをリロードしてからStart Translationを押し直す

### ライセンス

MIT
