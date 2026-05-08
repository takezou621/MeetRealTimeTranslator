import { useState, useEffect, useCallback } from "react";
import { getSettings, onSettingsChanged } from "@/lib/storage";
import type { ExtensionSettings, TranslationStatus } from "@/types";
import { SUPPORTED_LANGUAGES } from "@/lib/constants";
import ApiKeyInput from "./components/ApiKeyInput";
import TranslationToggle from "./components/TranslationToggle";
import VolumeControl from "./components/VolumeControl";
import StatusDisplay from "./components/StatusDisplay";

export default function App() {
  const [settings, setSettings] = useState<ExtensionSettings | null>(null);
  const [status, setStatus] = useState<TranslationStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getSettings().then(setSettings);
    onSettingsChanged(() => getSettings().then(setSettings));
  }, []);

  useEffect(() => {
    const poll = () => {
      chrome.runtime.sendMessage({ type: "GET_STATUS" }, (response) => {
        if (response?.status) { setStatus(response.status); setError(response.error ?? null); }
      });
    };
    poll();
    const interval = setInterval(poll, 2000);
    return () => clearInterval(interval);
  }, []);

  const handleToggle = useCallback(async (enabled: boolean) => {
    if (!settings) return;
    if (enabled) {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) { setError("No active tab found"); return; }
      if (!tab.url?.includes("meet.google.com")) { setError("Please open Google Meet first"); return; }

      chrome.runtime.sendMessage({
        type: "START_TRANSLATION",
        apiKey: settings.apiKey,
        yourLanguage: settings.yourLanguage,
        partnerLanguage: settings.partnerLanguage,
        tabId: tab.id,
      }, (response) => {
        if (response?.error) { setError(response.error); setStatus("error"); }
        else setError(null);
      });
    } else {
      chrome.runtime.sendMessage({ type: "STOP_TRANSLATION" }, () => {
        setStatus("idle"); setError(null);
      });
    }
  }, [settings]);

  const handleVolumeChange = useCallback((volume: number) => {
    chrome.runtime.sendMessage({ type: "UPDATE_VOLUME", volume });
  }, []);

  if (!settings) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-text-muted animate-pulse">Loading...</div>
      </div>
    );
  }

  const isActive = status === "connected" || status === "connecting";

  return (
    <div className="p-5 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3 pb-3 border-b border-surface-border">
        <div className="w-9 h-9 rounded-lg bg-primary/20 flex items-center justify-center">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary">
            <path d="m5 8 6 6" /><path d="m4 14 6-6 2-3" /><path d="M2 5h12" /><path d="M7 2h1" />
            <path d="m22 22-5-10-5 10" /><path d="M14 18h6" />
          </svg>
        </div>
        <div>
          <h1 className="text-base font-semibold text-text">MeetRealTimeTranslator</h1>
          <p className="text-xs text-text-muted">Bidirectional real-time translation</p>
        </div>
      </div>

      {/* API Key */}
      <ApiKeyInput
        apiKey={settings.apiKey}
        onChange={(key) => { chrome.storage.local.set({ apiKey: key }); setSettings({ ...settings, apiKey: key }); }}
      />

      {/* Language Pair */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-text-muted uppercase tracking-wider">Language Pair</label>
        <div className="flex items-center gap-2">
          <LanguageSelect
            label="You speak"
            value={settings.yourLanguage}
            onChange={(v) => { chrome.storage.local.set({ yourLanguage: v }); setSettings({ ...settings, yourLanguage: v }); }}
          />
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-text-muted shrink-0">
            <path d="M5 12h14" /><path d="m12 5 7 7-7 7" />
          </svg>
          <LanguageSelect
            label="They speak"
            value={settings.partnerLanguage}
            onChange={(v) => { chrome.storage.local.set({ partnerLanguage: v }); setSettings({ ...settings, partnerLanguage: v }); }}
          />
        </div>
      </div>

      {/* Toggle */}
      <TranslationToggle
        enabled={isActive}
        loading={status === "connecting"}
        disabled={!settings.apiKey}
        onToggle={handleToggle}
      />

      {/* Volume */}
      <VolumeControl
        volume={settings.outputVolume}
        onChange={(vol) => { chrome.storage.local.set({ outputVolume: vol }); setSettings({ ...settings, outputVolume: vol }); handleVolumeChange(vol); }}
      />

      {/* Status */}
      <StatusDisplay status={status} error={error} />
    </div>
  );
}

// ─── Language Select Sub-component ──────────────────────────────────

function LanguageSelect({ label, value, onChange }: {
  label: string; value: string; onChange: (code: string) => void;
}) {
  return (
    <div className="flex-1 space-y-0.5">
      <p className="text-[10px] text-text-muted/60">{label}</p>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-surface-elevated border border-surface-border rounded-lg px-2 py-1.5 text-xs text-text focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors appearance-none cursor-pointer"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
          backgroundRepeat: "no-repeat",
          backgroundPosition: "right 8px center",
        }}
      >
        {SUPPORTED_LANGUAGES.map((lang) => (
          <option key={lang.code} value={lang.code}>{lang.nativeName}</option>
        ))}
      </select>
    </div>
  );
}
