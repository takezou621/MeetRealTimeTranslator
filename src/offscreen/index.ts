import { OPENAI_API_BASE } from "@/lib/constants";

let peerConnection: RTCPeerConnection | null = null;
let audioStream: MediaStream | null = null;
let outputAudio: HTMLAudioElement | null = null;
let dataChannel: RTCDataChannel | null = null;

let currentSubtitle = "";
let subtitleTimer: ReturnType<typeof setTimeout> | null = null;

function log(...args: unknown[]) {
  console.log("[MRT:OFF]", ...args);
}

function logError(...args: unknown[]) {
  console.error("[MRT:OFF]", ...args);
}

// ─── Message Handler ────────────────────────────────────────────────

chrome.runtime.onMessage.addListener(
  (
    message: { type: string; [key: string]: unknown },
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response?: unknown) => void
  ) => {
    switch (message.type) {
      case "START_WEBRTC":
        log("Received START_WEBRTC");
        startWebRTC(
          message.streamId as string,
          message.ephemeralToken as string,
        )
          .then(() => sendResponse({ success: true }))
          .catch((err: Error) => {
            logError("WebRTC failed:", err.message);
            sendResponse({ error: err.message });
          });
        return true;

      case "STOP_WEBRTC":
        log("Received STOP_WEBRTC");
        stopWebRTC();
        sendResponse({ success: true });
        return false;

      case "UPDATE_VOLUME":
        if (outputAudio) outputAudio.volume = message.volume as number;
        sendResponse({ success: true });
        return false;

      default:
        return false;
    }
  }
);

// ─── WebRTC Connection (incoming: tab audio → translation → local speakers) ──

async function startWebRTC(
  streamId: string,
  ephemeralToken: string,
): Promise<void> {
  try {
    log("Capturing tab audio with streamId:", streamId.slice(0, 8) + "...");
    audioStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: {
          chromeMediaSource: "tab",
          chromeMediaSourceId: streamId,
        },
      } as MediaStreamConstraints["audio"],
    });
    log("Tab audio stream obtained, tracks:", audioStream.getAudioTracks().length);

    peerConnection = new RTCPeerConnection();
    const audioTrack = audioStream.getAudioTracks()[0];
    if (!audioTrack) throw new Error("No audio track found in tab stream");
    peerConnection.addTrack(audioTrack, audioStream);
    log("Audio track added:", audioTrack.label);

    outputAudio = new Audio();
    outputAudio.autoplay = true;
    outputAudio.volume = 0.75;

    peerConnection.ontrack = (event) => {
      log("Remote track received (translated audio)");
      if (outputAudio && event.streams[0]) {
        outputAudio.srcObject = event.streams[0];
      }
    };

    peerConnection.oniceconnectionstatechange = () => {
      log("ICE state:", peerConnection?.iceConnectionState);
    };

    peerConnection.onconnectionstatechange = () => {
      log("Connection state:", peerConnection?.connectionState);
      if (peerConnection?.connectionState === "failed") {
        chrome.runtime.sendMessage({
          type: "TRANSLATION_STATUS",
          status: "error",
          error: "WebRTC connection failed",
        });
      }
    };

    dataChannel = peerConnection.createDataChannel("oai-events");

    dataChannel.onopen = () => {
      log("Data channel opened — translation ready");
      chrome.runtime.sendMessage({ type: "TRANSLATION_STATUS", status: "connected" });
    };

    dataChannel.onclose = () => {
      log("Data channel closed");
      chrome.runtime.sendMessage({ type: "TRANSLATION_STATUS", status: "disconnected" });
    };

    dataChannel.onerror = (event) => logError("Data channel error:", event);

    dataChannel.onmessage = (event: MessageEvent) => {
      try { handleServerEvent(JSON.parse(event.data)); } catch { /* ignore */ }
    };

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    log("SDP offer created, sending to OpenAI...");

    const sdpResponse = await fetch(`${OPENAI_API_BASE}/calls`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ephemeralToken}`,
        "Content-Type": "application/sdp",
      },
      body: offer.sdp,
    });

    if (!sdpResponse.ok) {
      const errorText = await sdpResponse.text();
      throw new Error(`SDP exchange failed (${sdpResponse.status}): ${errorText}`);
    }

    const answerSdp = await sdpResponse.text();
    await peerConnection.setRemoteDescription({ type: "answer", sdp: answerSdp });
    log("WebRTC setup complete — waiting for data channel to open");
  } catch (err) {
    logError("WebRTC setup error:", (err as Error).message);
    chrome.runtime.sendMessage({
      type: "TRANSLATION_STATUS",
      status: "error",
      error: (err as Error).message,
    });
    stopWebRTC();
  }
}

// ─── Server Event Handler ───────────────────────────────────────────

function handleServerEvent(data: { type: string; [key: string]: unknown }) {
  switch (data.type) {
    case "session.output_transcript.delta": {
      const delta = data.delta as string;
      currentSubtitle += delta;
      log("Subtitle delta:", delta);
      chrome.runtime.sendMessage({
        type: "SUBTITLE_UPDATE",
        translated: currentSubtitle,
      });
      if (subtitleTimer) clearTimeout(subtitleTimer);
      subtitleTimer = setTimeout(() => { currentSubtitle = ""; }, 3000);
      break;
    }
    case "session.input_transcript.delta":
      log("Input transcript:", data.delta);
      break;
    case "session.created":
      log("Session created:", data.session);
      break;
    case "session.updated":
      log("Session updated:", data.session);
      break;
    default:
      log("Event:", data.type, data);
  }
}

// ─── Cleanup ────────────────────────────────────────────────────────

function stopWebRTC() {
  if (subtitleTimer) { clearTimeout(subtitleTimer); subtitleTimer = null; }
  if (dataChannel) { dataChannel.close(); dataChannel = null; }
  if (peerConnection) { peerConnection.close(); peerConnection = null; }
  if (audioStream) { audioStream.getTracks().forEach((t) => t.stop()); audioStream = null; }
  if (outputAudio) { outputAudio.pause(); outputAudio.srcObject = null; outputAudio = null; }
  currentSubtitle = "";
  log("WebRTC stopped, resources cleaned up");
}

log("Offscreen document loaded, signaling ready...");
chrome.runtime.sendMessage({ type: "OFFSCREEN_READY" });
