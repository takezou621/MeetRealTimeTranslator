// Content script — runs in ISOLATED world on meet.google.com
// Bridges between inject.js (MAIN world) and background service worker
// Manages subtitle overlay UI

let overlayContainer: HTMLDivElement | null = null;
let subtitleText: HTMLDivElement | null = null;
let headerElement: HTMLDivElement | null = null;
let isDragging = false;
let dragOffset = { x: 0, y: 0 };

const log = (...args: unknown[]) => console.log("[MRT:CONTENT]", ...args);

// ─── Overlay ────────────────────────────────────────────────────────

function createOverlay() {
  if (document.getElementById("mrt-overlay")) return;
  overlayContainer = document.createElement("div");
  overlayContainer.id = "mrt-overlay";
  overlayContainer.className = "mrt-overlay";
  headerElement = document.createElement("div");
  headerElement.className = "mrt-overlay-header";
  headerElement.textContent = "MeetRealTimeTranslator";
  subtitleText = document.createElement("div");
  subtitleText.className = "mrt-subtitle-text mrt-empty";
  subtitleText.textContent = "翻訳を待っています...";
  overlayContainer.appendChild(headerElement);
  overlayContainer.appendChild(subtitleText);
  document.body.appendChild(overlayContainer);
  setupDragging();
}

function setupDragging() {
  if (!overlayContainer) return;
  overlayContainer.addEventListener("mousedown", (e) => {
    isDragging = true;
    const rect = overlayContainer!.getBoundingClientRect();
    dragOffset = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    overlayContainer!.style.cursor = "grabbing";
    e.preventDefault();
  });
  document.addEventListener("mousemove", (e) => {
    if (!isDragging || !overlayContainer) return;
    overlayContainer.style.left = `${e.clientX - dragOffset.x}px`;
    overlayContainer.style.top = `${e.clientY - dragOffset.y}px`;
    overlayContainer.style.right = "auto";
    overlayContainer.style.bottom = "auto";
    overlayContainer.style.transform = "none";
  });
  document.addEventListener("mouseup", () => {
    if (isDragging && overlayContainer) overlayContainer.style.cursor = "grab";
    isDragging = false;
  });
}

function updateOverlayStatus(status: string, error?: string) {
  if (!headerElement) return;
  headerElement.classList.remove("mrt-connected", "mrt-error");
  switch (status) {
    case "connected":
      headerElement.classList.add("mrt-connected");
      if (subtitleText) { subtitleText.classList.remove("mrt-empty"); subtitleText.textContent = ""; }
      break;
    case "error":
      headerElement.classList.add("mrt-error");
      if (subtitleText) { subtitleText.classList.add("mrt-empty"); subtitleText.textContent = error ?? "接続エラー"; }
      break;
    case "connecting":
      if (subtitleText) { subtitleText.classList.add("mrt-empty"); subtitleText.textContent = "接続中..."; }
      break;
    default:
      if (subtitleText) { subtitleText.classList.add("mrt-empty"); subtitleText.textContent = "翻訳を待っています..."; }
  }
}

function setSubtitle(text: string) {
  if (!subtitleText) return;
  subtitleText.classList.remove("mrt-empty");
  subtitleText.textContent = text;
  subtitleText.classList.remove("mrt-fade-in");
  void subtitleText.offsetWidth;
  subtitleText.classList.add("mrt-fade-in");
}

// ─── Communication: ISOLATED ↔ MAIN world ──────────────────────────

let injectDetected = false;
let audioGraphReady = false;

// Forward extension commands to inject.js (MAIN world)
function postToInject(data: Record<string, unknown>) {
  window.postMessage({ source: "MRT_EXTENSION", ...data }, "https://meet.google.com");
}

// Check if inject.js is running
function checkInjectAlive(): Promise<boolean> {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => resolve(false), 1000);
    const handler = (event: MessageEvent) => {
      if (event.data?.source === "MRT_INJECT" && event.data?.type === "MRT_PONG") {
        clearTimeout(timeout);
        window.removeEventListener("message", handler);
        audioGraphReady = event.data.audioGraphReady as boolean;
        resolve(true);
      }
    };
    window.addEventListener("message", handler);
    postToInject({ type: "MRT_PING" });
  });
}

// Listen for messages from inject.js (MAIN world)
window.addEventListener("message", (event) => {
  if (event.origin !== "https://meet.google.com") return;
  if (event.data?.source !== "MRT_INJECT") return;

  const data = event.data;

  switch (data.type) {
    case "MRT_AUDIO_GRAPH_READY":
      log("Audio graph ready in MAIN world");
      audioGraphReady = true;
      break;
    case "MRT_OUTGOING_STATUS":
      log("Outgoing status:", data.status);
      if (data.status === "connected") {
        updateOverlayStatus("connected");
        chrome.runtime.sendMessage({ type: "TRANSLATION_STATUS", status: "connected" });
      } else if (data.status === "error") {
        updateOverlayStatus("error", data.error as string);
        chrome.runtime.sendMessage({ type: "TRANSLATION_STATUS", status: "error", error: data.error });
      }
      break;
    case "MRT_OUTGOING_SUBTITLE":
      setSubtitle(data.text as string);
      chrome.runtime.sendMessage({ type: "SUBTITLE_UPDATE", translated: data.text });
      break;
    case "MRT_INCOMING_SUBTITLE":
      break;

    // SDP offer from inject.js — route to background for fetch (avoids CSP)
    case "MRT_SDP_OFFER":
      log("Relaying SDP offer to background");
      chrome.runtime.sendMessage({
        type: "EXCHANGE_SDP",
        offerSdp: data.offerSdp,
        ephemeralToken: data.ephemeralToken,
      }, (response) => {
        if (response?.error) {
          log("SDP exchange failed:", response.error);
          postToInject({ type: "MRT_SDP_ANSWER", error: response.error });
        } else if (response?.answerSdp) {
          log("SDP answer received, forwarding to inject.js");
          postToInject({ type: "MRT_SDP_ANSWER", answerSdp: response.answerSdp });
        }
      });
      break;
  }
});

// ─── Chrome Runtime Messages (from background) ──────────────────────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "PING") { sendResponse({ pong: true }); return false; }

  handleRuntimeMessage(message as { type: string; [key: string]: unknown })
    .then(sendResponse)
    .catch((err: Error) => sendResponse({ error: err.message }));
  return true;
});

async function handleRuntimeMessage(message: { type: string; [key: string]: unknown }) {
  switch (message.type) {
    case "START_BIDIRECTIONAL": {
      log("Received START_BIDIRECTIONAL");
      updateOverlayStatus("connecting");

      const { outgoingToken, incomingToken, yourLanguage, partnerLanguage, tabId } = message as unknown as {
        outgoingToken: string; incomingToken: string;
        yourLanguage: string; partnerLanguage: string; tabId: number;
      };

      // Check if inject.js is running in MAIN world
      const injectAlive = await checkInjectAlive();
      if (!injectAlive) {
        log("inject.js NOT detected — page needs reload");
        updateOverlayStatus("error", "Meetページをリロードしてください（F5）");
        chrome.runtime.sendMessage({
          type: "TRANSLATION_STATUS", status: "error",
          error: "Meetページをリロードしてください（F5）",
        });
        throw new Error("inject.js not detected — reload Meet page");
      }
      log("inject.js detected, audioGraphReady:", audioGraphReady);

      // Start outgoing translation via inject.js (MAIN world)
      postToInject({
        type: "MRT_START_OUTGOING",
        ephemeralToken: outgoingToken,
        targetLanguage: partnerLanguage,
      });

      // Start incoming translation via background (tab audio → offscreen)
      chrome.runtime.sendMessage({
        type: "START_INCOMING_TAB",
        incomingToken,
        yourLanguage,
        tabId,
      });

      return { success: true };
    }

    case "STOP_ALL":
      log("Received STOP_ALL");
      postToInject({ type: "MRT_STOP_OUTGOING" });
      updateOverlayStatus("idle");
      return { success: true };

    case "SUBTITLE_UPDATE":
      if (message.translated) setSubtitle(message.translated as string);
      return { success: true };

    case "TRANSLATION_STATUS":
      updateOverlayStatus(message.status as string, message.error as string | undefined);
      return { success: true };

    case "SHOW_OVERLAY":
      createOverlay();
      return { success: true };

    case "HIDE_OVERLAY":
      document.getElementById("mrt-overlay")?.remove();
      overlayContainer = null;
      subtitleText = null;
      headerElement = null;
      return { success: true };

    default:
      return { success: true };
  }
}

// ─── Auto-init ──────────────────────────────────────────────────────

if (window.location.hostname === "meet.google.com") {
  const observer = new MutationObserver(() => {
    if (document.getElementById("mrt-overlay")) return;
    if (
      document.querySelector("[data-allocation-index]") ||
      document.querySelector(".zWGUib") ||
      document.querySelector('[role="main"]')
    ) createOverlay();
  });
  observer.observe(document.body, { childList: true, subtree: true });
  setTimeout(() => {
    if (!document.getElementById("mrt-overlay")) createOverlay();
    observer.disconnect();
  }, 5000);
}

export {};
