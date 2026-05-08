import type { ExtensionSettings } from "@/types";
import { DEFAULT_SETTINGS } from "./constants";

type StorageKey = keyof ExtensionSettings;

export async function getSettings(): Promise<ExtensionSettings> {
  const result = await chrome.storage.local.get(Object.keys(DEFAULT_SETTINGS));
  return { ...DEFAULT_SETTINGS, ...result } as ExtensionSettings;
}

export async function getSetting<K extends StorageKey>(
  key: K
): Promise<ExtensionSettings[K]> {
  const result = await chrome.storage.local.get(key);
  return result[key] ?? DEFAULT_SETTINGS[key];
}

export async function setSetting<K extends StorageKey>(
  key: K,
  value: ExtensionSettings[K]
): Promise<void> {
  await chrome.storage.local.set({ [key]: value });
}

export async function updateSettings(
  partial: Partial<ExtensionSettings>
): Promise<void> {
  await chrome.storage.local.set(partial);
}

export function onSettingsChanged(
  callback: (changes: {
    [K in StorageKey]?: chrome.storage.StorageChange;
  }) => void
): void {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local") {
      callback(changes as Parameters<typeof callback>[0]);
    }
  });
}
