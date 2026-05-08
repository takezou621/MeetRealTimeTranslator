import type { TranslationStatus } from "@/types";

// Popup / Content Script → Service Worker
export type ServiceWorkerMessage =
  | {
      type: "START_TRANSLATION";
      apiKey: string;
      targetLanguage: string;
      tabId: number;
    }
  | { type: "STOP_TRANSLATION" }
  | { type: "GET_STATUS" }
  | { type: "UPDATE_VOLUME"; volume: number };

// Service Worker → Offscreen Document
export type OffscreenMessage =
  | {
      type: "START_WEBRTC";
      streamId: string;
      ephemeralToken: string;
      targetLanguage: string;
    }
  | { type: "STOP_WEBRTC" }
  | { type: "UPDATE_VOLUME"; volume: number };

// Offscreen → Service Worker (forwarded)
export type OffscreenEvent =
  | {
      type: "SUBTITLE_UPDATE";
      translated: string;
      original?: string;
    }
  | {
      type: "TRANSLATION_STATUS";
      status: TranslationStatus;
      error?: string;
    };

// Service Worker → Content Script
export type ContentScriptMessage =
  | { type: "SUBTITLE_UPDATE"; translated: string; original?: string }
  | {
      type: "TRANSLATION_STATUS";
      status: TranslationStatus;
      error?: string;
    }
  | { type: "SHOW_OVERLAY" }
  | { type: "HIDE_OVERLAY" };

export type AnyMessage =
  | ServiceWorkerMessage
  | OffscreenMessage
  | OffscreenEvent
  | ContentScriptMessage;
