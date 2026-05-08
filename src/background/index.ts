import { OPENAI_API_BASE, OFFSCREEN_DOCUMENT_PATH } from "@/lib/constants";
import type { TranslationStatus } from "@/types";

let currentStatus: TranslationStatus = "idle";
let offscreenReady = false;

function log(...args: unknown[]) { console.log("[MRT:BG]", ...args); }
function logError(...args: unknown[]) { console.error("[MRT:BG]", ...args); }

// ─── Offscreen (for incoming tab audio direction) ───────────────────

async function ensureOffscreenDocument(): Promise<void> {
  const existing = await chrome.runtime.getContexts({
    contextTypes: ["OFFSCREEN_DOCUMENT" as chrome.runtime.ContextType],
    documentUrls: [chrome.runtime.getURL(OFFSCREEN_DOCUMENT_PATH)],
  });
  if (existing.length > 0) return;

  log("Creating offscreen document...");
  await chrome.offscreen.createDocument({
    url: OFFSCREEN_DOCUMENT_PATH,
    reasons: ["AUDIO_PLAYBACK" as chrome.offscreen.Reason, "USER_MEDIA" as chrome.offscreen.Reason],
    justification: "Playing translated audio from incoming tab audio",
  });
}

async function closeOffscreenDocument(): Promise<void> {
  try {
    const existing = await chrome.runtime.getContexts({
      contextTypes: ["OFFSCREEN_DOCUMENT" as chrome.runtime.ContextType],
      documentUrls: [chrome.runtime.getURL(OFFSCREEN_DOCUMENT_PATH)],
    });
    if (existing.length > 0) { await chrome.offscreen.closeDocument(); offscreenReady = false; }
  } catch { /* ignore */ }
}

function waitForOffscreen(timeoutMs = 5000): Promise<void> {
  if (offscreenReady) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      if (offscreenReady) return resolve();
      if (Date.now() - start > timeoutMs) return reject(new Error("Offscreen not ready"));
      setTimeout(check, 100);
    };
    check();
  });
}

function sendToOffscreen(message: Record<string, unknown>): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const trySend = () => {
      attempts++;
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          if (attempts < 5) setTimeout(trySend, 500);
          else reject(new Error(chrome.runtime.lastError.message));
        } else resolve(response);
      });
    };
    trySend();
  });
}

// ─── OpenAI API ─────────────────────────────────────────────────────

async function getEphemeralToken(apiKey: string, targetLanguage: string): Promise<string> {
  log("Getting ephemeral token, lang:", targetLanguage);
  const response = await fetch(`${OPENAI_API_BASE}/client_secrets`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      session: { model: "gpt-realtime-translate", audio: { output: { language: targetLanguage } } },
    }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Token failed (${response.status}): ${text}`);
  }
  const data = await response.json();
  if (!data.value) throw new Error(`No token: ${JSON.stringify(data)}`);
  return data.value as string;
}

function getTabStreamId(tabId: number): Promise<string> {
  return new Promise((resolve, reject) => {
    chrome.tabCapture.getMediaStreamId({ targetTabId: tabId }, (streamId: string) => {
      if (chrome.runtime.lastError) { reject(new Error(chrome.runtime.lastError.message)); return; }
      resolve(streamId);
    });
  });
}

// ─── Content Script Injection ───────────────────────────────────────

async function ensureContentScript(tabId: number): Promise<void> {
  const pingOk = await new Promise<boolean>((resolve) => {
    chrome.tabs.sendMessage(tabId, { type: "PING" }, (response) => {
      if (chrome.runtime.lastError || !response) resolve(false);
      else resolve(true);
    });
  });
  if (pingOk) return;

  log("Injecting content script into tab", tabId);
  await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
  await chrome.scripting.insertCSS({ target: { tabId }, files: ["content.css"] });
  await new Promise((r) => setTimeout(r, 500));
}

// ─── Status ─────────────────────────────────────────────────────────

function broadcastStatus(status: TranslationStatus, error?: string) {
  currentStatus = status;
  log("Status:", status, error ?? "");
  chrome.tabs.query({ url: "https://meet.google.com/*" }, (tabs) => {
    for (const tab of tabs) {
      if (tab.id) chrome.tabs.sendMessage(tab.id, { type: "TRANSLATION_STATUS", status, error });
    }
  });
}

// ─── Message Router ─────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "OFFSCREEN_READY") {
    offscreenReady = true;
    log("Offscreen ready");
    sendResponse({ ok: true });
    return false;
  }

  handleMessage(message as { type: string; [key: string]: unknown })
    .then(sendResponse)
    .catch((err: Error) => {
      logError("Error:", err.message);
      sendResponse({ error: err.message });
    });
  return true;
});

async function handleMessage(message: { type: string; [key: string]: unknown }) {
  switch (message.type) {
    case "START_TRANSLATION": {
      const { apiKey, yourLanguage, partnerLanguage, tabId } = message as unknown as {
        apiKey: string; yourLanguage: string; partnerLanguage: string; tabId: number;
      };
      if (!apiKey) throw new Error("API key is not set");

      broadcastStatus("connecting");
      await ensureContentScript(tabId);

      // Get TWO ephemeral tokens — one per direction
      // Fix #8: Use individual try/catch so one failure doesn't leak the other
      let outgoingToken: string;
      let incomingToken: string;
      try {
        [outgoingToken, incomingToken] = await Promise.all([
          getEphemeralToken(apiKey, partnerLanguage),
          getEphemeralToken(apiKey, yourLanguage),
        ]);
      } catch (err) {
        broadcastStatus("error", (err as Error).message);
        throw err;
      }

      log("Both tokens obtained. Starting bidirectional translation.");

      // Fix #3: Await the content script's response to propagate errors
      const result = await new Promise<unknown>((resolve) => {
        chrome.tabs.sendMessage(tabId, {
          type: "START_BIDIRECTIONAL",
          outgoingToken,
          incomingToken,
          yourLanguage,
          partnerLanguage,
          tabId,
        }, (response) => {
          if (chrome.runtime.lastError) {
            resolve({ error: chrome.runtime.lastError.message });
          } else {
            resolve(response);
          }
        });
      });

      if (result && typeof result === "object" && "error" in (result as object)) {
        const errMsg = (result as { error: string }).error;
        broadcastStatus("error", errMsg);
        throw new Error(errMsg);
      }

      return { success: true };
    }

    case "STOP_TRANSLATION": {
      const tabs = await chrome.tabs.query({ url: "https://meet.google.com/*" });
      for (const tab of tabs) {
        if (tab.id) chrome.tabs.sendMessage(tab.id, { type: "STOP_ALL" });
      }
      try { await sendToOffscreen({ type: "STOP_WEBRTC" }); } catch { /* ignore */ }
      broadcastStatus("idle");
      setTimeout(() => closeOffscreenDocument(), 1000);
      return { success: true };
    }

    case "GET_STATUS":
      return { status: currentStatus };

    case "EXCHANGE_SDP": {
      // Relay SDP offer to OpenAI on behalf of inject.js (avoids CSP)
      const { offerSdp, ephemeralToken } = message as unknown as {
        offerSdp: string; ephemeralToken: string;
      };
      log("SDP exchange — forwarding offer to OpenAI");
      const sdpResponse = await fetch(`${OPENAI_API_BASE}/calls`, {
        method: "POST",
        headers: { Authorization: `Bearer ${ephemeralToken}`, "Content-Type": "application/sdp" },
        body: offerSdp,
      });
      if (!sdpResponse.ok) {
        const errText = await sdpResponse.text();
        logError("SDP exchange failed:", sdpResponse.status, errText);
        return { error: `SDP failed (${sdpResponse.status}): ${errText}` };
      }
      const answerSdp = await sdpResponse.text();
      log("SDP answer obtained, length:", answerSdp.length);
      return { answerSdp };
    }

    case "START_INCOMING_TAB": {
      const { incomingToken, yourLanguage, tabId } = message as unknown as {
        incomingToken: string; yourLanguage: string; tabId: number;
      };
      log("Starting incoming tab translation");
      await ensureOffscreenDocument();
      await waitForOffscreen();
      const streamId = await getTabStreamId(tabId);
      const result = await sendToOffscreen({
        type: "START_WEBRTC", streamId, ephemeralToken: incomingToken,
      });
      if (result && typeof result === "object" && "error" in (result as object)) {
        throw new Error((result as { error: string }).error);
      }
      return { success: true };
    }

    case "SUBTITLE_UPDATE":
      chrome.tabs.query({ url: "https://meet.google.com/*" }, (tabs) => {
        for (const tab of tabs) {
          if (tab.id) chrome.tabs.sendMessage(tab.id, message);
        }
      });
      return { success: true };

    case "TRANSLATION_STATUS": {
      const { status, error } = message as unknown as { status: TranslationStatus; error?: string };
      broadcastStatus(status, error);
      return { success: true };
    }

    default:
      return { error: "Unknown message type" };
  }
}

chrome.runtime.onInstalled.addListener(() => { currentStatus = "idle"; log("Installed"); });
