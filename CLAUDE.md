# MeetRealTimeTranslator — Claude Code プロジェクト規約

## プロジェクト概要
Google Meet上でOpenAI Realtime API（gpt-realtime-translateモデル）のtranslation sessionを使って、
双方向リアルタイム同時通訳を実現するChrome Extension（Manifest V3）。

## 技術スタック
- TypeScript (strict mode)
- React 18 + Vite 6
- Tailwind CSS v4（CSS-based config、@tailwindcss/vite使用）
- Web Audio API + AudioContext（音声ミックス・ダッキング）
- chrome.tabCapture + chrome.offscreen + chrome.scripting + chrome.runtime messaging
- OpenAI Realtime API Translation Session（WebRTC）

## OpenAI Realtime API — Translation Session 仕様
- **エンドポイント**: `/v1/realtime/translations`
- **モデル**: `gpt-realtime-translate`
- **WebRTC SDP交換**: `POST /v1/realtime/translations/calls`
- **Ephemeral Token**: `POST /v1/realtime/translations/client_secrets`
- **認証**: Service WorkerでEphemeral Token取得（双方向で2つ取得）
- **音声フォーマット**: PCM16 24kHz mono（WebRTC時は自動処理）
- **翻訳は自動・連続**: `response.create` 不要
- **ソース言語**: 自動検出
- **ターゲット言語**: Ephemeral Token取得時の`audio.output.language`で指定
- **イベントプレフィックス**: `session.*`
- **主要イベント**: `session.output_transcript.delta`, `session.output_audio.delta`, `session.input_transcript.delta`

## アーキテクチャ（双方向翻訳）

```
Direction 1 (Outgoing):                           Direction 2 (Incoming):
User mic (Japanese)                               Tab audio (English)
  → getUserMedia override (inject.js MAIN)         → tabCapture (offscreen)
  → AudioContext mix                                → OpenAI Translation Session B
  → OpenAI Translation Session A                   → Japanese audio
  → English audio → Meet stream                    → Local speakers
  → Other participants hear English

SDP Exchange (CSP-safe routing):
inject.js → content.js → background.js → OpenAI API → content.js → inject.js
```

### 各コンポーネントの役割
- **inject.js (MAIN world, document_start)**: getUserMediaオーバーライド、AudioContext音声ミックス、送信方向WebRTC
- **content.js (ISOLATED world)**: inject↔backgroundブリッジ、SDPリレー、字幕オーバーレイUI
- **background.js (Service Worker)**: Ephemeral Token取得×2、SDP交換API呼び出し、tabCapture管理
- **offscreen.js (Offscreen Document)**: 受信方向WebRTC（タブ音声→翻訳→ローカル再生）
- **Popup (React)**: 言語ペア設定、API Key、音量、ステータス表示

## ファイル構成
```
src/
├── popup.html              # Popup HTML entry
├── offscreen.html          # Offscreen Document entry
├── background/index.ts     # Service Worker
├── content/index.ts        # Content Script (bridge + overlay)
├── inject/index.ts         # MAIN world script (getUserMedia override + AudioContext)
├── offscreen/index.ts      # WebRTC incoming direction
├── popup/
│   ├── main.tsx            # React entry
│   ├── App.tsx             # Main component
│   ├── styles.css          # Tailwind v4
│   └── components/         # UI components
├── lib/
│   ├── constants.ts        # 言語リスト、デフォルト値
│   ├── storage.ts          # chrome.storage helpers
│   ├── messages.ts         # Message型定義
│   └── audio-utils.ts      # PCM16変換等
└── types/index.ts          # TypeScript型定義

public/
├── manifest.json           # Manifest V3 (minimum_chrome_version: 111)
└── content.css             # 字幕オーバーレイCSS
```

## 禁止事項
- `response.create` の使用（Translation Sessionでは不要）
- inject.js (MAIN world) でのfetch呼び出し（MeetのCSPでブロックされる → background経由でSDP交換）
- WebSocket直接認証（ブラウザWebSocketはカスタムヘッダー不可）
- Tailwind v3以前の設定方式
- `chrome.tabCapture.capture()` の使用（MV3非推奨 → `getMediaStreamId()`を使用）
- content.js / inject.js でのES Module import（Content Scriptはmodule非対応 → 定数インライン化）

## 開発コマンド
- `npm run dev` — Vite開発ビルド（watch mode）
- `npm run build` — プロダクションビルド
- `npm run clean` — dist削除

## 公式参照
- Realtime API: https://developers.openai.com/api/docs/guides/realtime
- Translation Guide: https://developers.openai.com/api/docs/guides/realtime-translation
- One-way Translation Cookbook: https://developers.openai.com/cookbook/examples/voice_solutions/one_way_translation_using_realtime_api
- WebRTC Guide: https://developers.openai.com/api/docs/guides/realtime-webrtc
