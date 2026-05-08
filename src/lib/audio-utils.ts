/**
 * Convert Float32Array (Web Audio) to PCM16 ArrayBuffer.
 * Used for WebSocket fallback when manual audio encoding is needed.
 */
export function floatTo16BitPCM(float32Array: Float32Array): ArrayBuffer {
  const buffer = new ArrayBuffer(float32Array.length * 2);
  const view = new DataView(buffer);
  for (let i = 0; i < float32Array.length; i++) {
    const s = Math.max(-1, Math.min(1, float32Array[i]));
    view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return buffer;
}

/**
 * Encode Float32Array audio to base64 PCM16 string.
 */
export function base64EncodeAudio(float32Array: Float32Array): string {
  const arrayBuffer = floatTo16BitPCM(float32Array);
  const bytes = new Uint8Array(arrayBuffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

/**
 * Downsample audio from source sample rate to 24kHz.
 */
export function downsampleAudio(
  float32Array: Float32Array,
  sourceSampleRate: number,
  targetSampleRate: number = 24000
): Float32Array {
  if (sourceSampleRate === targetSampleRate) return float32Array;
  const ratio = sourceSampleRate / targetSampleRate;
  const newLength = Math.round(float32Array.length / ratio);
  const result = new Float32Array(newLength);
  for (let i = 0; i < newLength; i++) {
    const srcIndex = i * ratio;
    const srcFloor = Math.floor(srcIndex);
    const srcCeil = Math.min(srcFloor + 1, float32Array.length - 1);
    const t = srcIndex - srcFloor;
    result[i] = float32Array[srcFloor] * (1 - t) + float32Array[srcCeil] * t;
  }
  return result;
}
