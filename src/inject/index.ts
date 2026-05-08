// inject.js — Runs in MAIN world at document_start (before Meet loads)
// NO IMPORTS — must be fully self-contained
// NO FETCH CALLS — SDP exchange is routed through content script → background
//   to avoid Meet's Content Security Policy restrictions

const OPENAI_API_BASE = "https://api.openai.com/v1/realtime/translations";

// ─── State ──────────────────────────────────────────────────────────

let origGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
let audioCtx: AudioContext | null = null;
let micDestination: MediaStreamAudioDestinationNode | null = null;
let micGainNode: GainNode | null = null;
let ttsGainNode: GainNode | null = null;
let controlStream: MediaStream | null = null;
let realMicStream: MediaStream | null = null;

// Outgoing WebRTC (mic → OpenAI → translated audio → Meet stream)
let outPeerConnection: RTCPeerConnection | null = null;
let outDataChannel: RTCDataChannel | null = null;
let outCurrentSubtitle = "";
let outSubtitleTimer: ReturnType<typeof setTimeout> | null = null;

let audioGraphReady = false;
let isActive = false;

const log = (...args: unknown[]) => console.log("[MRT:INJECT]", ...args);
const logError = (...args: unknown[]) => console.error("[MRT:INJECT]", ...args);

// ─── getUserMedia Override ──────────────────────────────────────────

navigator.mediaDevices.getUserMedia = async function (
  constraints: MediaStreamConstraints
): Promise<MediaStream> {
  if (constraints?.audio) {
    log("getUserMedia intercepted — audio requested");
    realMicStream = await origGetUserMedia(constraints);
    log("Real mic stream obtained, tracks:", realMicStream.getAudioTracks().length);

    // Create AudioContext NOW — getUserMedia is called from a user gesture
    setupAudioGraph();

    // Create control stream with AudioContext output + original video
    controlStream = new MediaStream();
    if (micDestination) {
      for (const t of micDestination.stream.getAudioTracks()) controlStream.addTrack(t);
    }
    for (const t of realMicStream.getVideoTracks()) controlStream.addTrack(t);

    log("Control stream ready — Meet gets our mixed audio");
    return controlStream;
  }
  return origGetUserMedia(constraints);
};

// ─── Audio Graph Setup ──────────────────────────────────────────────

function setupAudioGraph() {
  if (audioGraphReady || !realMicStream) return;
  audioGraphReady = true;

  try {
    audioCtx = new AudioContext({ sampleRate: 48000 });
    micDestination = audioCtx.createMediaStreamDestination();

    const micSource = audioCtx.createMediaStreamSource(realMicStream);
    micGainNode = audioCtx.createGain();
    micGainNode.gain.value = 1.0;
    micSource.connect(micGainNode);
    micGainNode.connect(micDestination);

    ttsGainNode = audioCtx.createGain();
    ttsGainNode.gain.value = 0.0;
    ttsGainNode.connect(micDestination);

    if (audioCtx.state === "suspended") {
      audioCtx.resume();
    }

    log("Audio graph ready — audioGraphReady:", audioGraphReady);
    postToExtension({ type: "MRT_AUDIO_GRAPH_READY" });
  } catch (err) {
    logError("Audio graph setup failed:", (err as Error).message);
    audioGraphReady = false;
  }
}

// ─── Outgoing WebRTC (Mic → Translation → Meet) ────────────────────

async function startOutgoingTranslation(ephemeralToken: string, targetLanguage: string) {
  try {
    if (!realMicStream) throw new Error("No mic stream — getUserMedia was not intercepted");
    if (!audioGraphReady) throw new Error("Audio graph not ready");
    if (audioCtx && audioCtx.state === "suspended") await audioCtx.resume();

    log("Starting outgoing WebRTC, target:", targetLanguage);

    outPeerConnection = new RTCPeerConnection();

    const audioTrack = realMicStream.getAudioTracks()[0];
    if (!audioTrack) throw new Error("No audio track in mic stream");
    outPeerConnection.addTrack(audioTrack, realMicStream);
    log("Added mic track:", audioTrack.label);

    // Receive translated audio → route through AudioContext to Meet
    outPeerConnection.ontrack = (event) => {
      log("Translated audio received from OpenAI");
      if (!audioCtx || !ttsGainNode) return;
      audioCtx.createMediaStreamSource(event.streams[0]).connect(ttsGainNode);
      if (micGainNode) micGainNode.gain.value = 0.2;
      if (ttsGainNode) ttsGainNode.gain.value = 1.0;
    };

    outPeerConnection.onconnectionstatechange = () => {
      log("PC state:", outPeerConnection?.connectionState);
      if (outPeerConnection?.connectionState === "failed") {
        postToExtension({ type: "MRT_OUTGOING_STATUS", status: "error", error: "Connection failed" });
      }
    };

    // Data channel for transcript events
    outDataChannel = outPeerConnection.createDataChannel("oai-events");
    outDataChannel.onopen = () => {
      log("Data channel OPEN — translation active");
      postToExtension({ type: "MRT_OUTGOING_STATUS", status: "connected" });
    };
    outDataChannel.onclose = () => {
      log("Data channel closed");
      if (micGainNode) micGainNode.gain.value = 1.0;
      if (ttsGainNode) ttsGainNode.gain.value = 0.0;
      postToExtension({ type: "MRT_OUTGOING_STATUS", status: "disconnected" });
    };
    outDataChannel.onerror = (e) => logError("DC error:", e);
    outDataChannel.onmessage = (ev: MessageEvent) => {
      try { handleOutgoingEvent(JSON.parse(ev.data)); } catch { /* ignore */ }
    };

    // Create SDP offer — send to content script for routing through background
    const offer = await outPeerConnection.createOffer();
    await outPeerConnection.setLocalDescription(offer);
    log("SDP offer created — sending via content script to background");

    postToExtension({
      type: "MRT_SDP_OFFER",
      offerSdp: offer.sdp,
      ephemeralToken,
    });
    // Answer will arrive via MRT_SDP_ANSWER message
  } catch (err) {
    const msg = (err as Error).message;
    logError("Outgoing setup error:", msg);
    postToExtension({ type: "MRT_OUTGOING_STATUS", status: "error", error: msg });
  }
}

// Called when background returns the SDP answer
async function handleSdpAnswer(answerSdp: string) {
  try {
    if (!outPeerConnection) throw new Error("No PeerConnection");
    await outPeerConnection.setRemoteDescription({ type: "answer", sdp: answerSdp });
    log("SDP answer set — WebRTC connected, speak to test");
    isActive = true;
  } catch (err) {
    logError("SDP answer error:", (err as Error).message);
    postToExtension({ type: "MRT_OUTGOING_STATUS", status: "error", error: (err as Error).message });
  }
}

function handleOutgoingEvent(data: { type: string; [key: string]: unknown }) {
  switch (data.type) {
    case "session.output_transcript.delta": {
      outCurrentSubtitle += data.delta as string;
      log("Translated:", outCurrentSubtitle);
      postToExtension({ type: "MRT_OUTGOING_SUBTITLE", text: outCurrentSubtitle });
      if (outSubtitleTimer) clearTimeout(outSubtitleTimer);
      outSubtitleTimer = setTimeout(() => { outCurrentSubtitle = ""; }, 3000);
      break;
    }
    case "session.input_transcript.delta":
      log("Original:", data.delta);
      break;
    case "session.created":
      log("Session created:", data.session);
      break;
    default:
      log("Event:", data.type);
  }
}

function stopOutgoingTranslation() {
  if (outSubtitleTimer) { clearTimeout(outSubtitleTimer); outSubtitleTimer = null; }
  if (outDataChannel) { outDataChannel.close(); outDataChannel = null; }
  if (outPeerConnection) { outPeerConnection.close(); outPeerConnection = null; }
  if (micGainNode) micGainNode.gain.value = 1.0;
  if (ttsGainNode) ttsGainNode.gain.value = 0.0;
  outCurrentSubtitle = "";
  isActive = false;
  log("Outgoing stopped");
}

// ─── Communication with Content Script (ISOLATED world) ─────────────

function postToExtension(data: Record<string, unknown>) {
  window.postMessage({ source: "MRT_INJECT", ...data }, "https://meet.google.com");
}

window.addEventListener("message", (event) => {
  if (event.origin !== "https://meet.google.com") return;
  if (event.data?.source !== "MRT_EXTENSION") return;

  const data = event.data;
  switch (data.type) {
    case "MRT_START_OUTGOING":
      log("Received START_OUTGOING");
      startOutgoingTranslation(data.ephemeralToken as string, data.targetLanguage as string);
      break;
    case "MRT_STOP_OUTGOING":
      stopOutgoingTranslation();
      break;
    case "MRT_SDP_ANSWER":
      log("Received SDP answer from background");
      handleSdpAnswer(data.answerSdp as string);
      break;
    case "MRT_SETUP_AUDIO_GRAPH":
      setupAudioGraph();
      break;
    case "MRT_PING":
      postToExtension({ type: "MRT_PONG", audioGraphReady });
      break;
  }
});

log("Inject script loaded — getUserMedia overridden");

export {};
