import { useState } from "react";

interface Props {
  apiKey: string;
  onChange: (key: string) => void;
}

export default function ApiKeyInput({ apiKey, onChange }: Props) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-text-muted uppercase tracking-wider">
        OpenAI API Key
      </label>
      <div className="flex gap-2">
        <input
          type={visible ? "text" : "password"}
          value={apiKey}
          onChange={(e) => onChange(e.target.value)}
          placeholder="sk-..."
          className="flex-1 bg-surface-elevated border border-surface-border rounded-lg px-3 py-2 text-sm text-text placeholder-text-muted/50 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
        />
        <button
          onClick={() => setVisible(!visible)}
          className="px-3 rounded-lg bg-surface-elevated border border-surface-border text-text-muted hover:text-text hover:border-primary/40 transition-colors"
          title={visible ? "Hide" : "Show"}
        >
          {visible ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
              <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
              <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
              <line x1="2" x2="22" y1="2" y2="22" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          )}
        </button>
      </div>
      {!apiKey && (
        <p className="text-xs text-danger">
          API key is required to start translation
        </p>
      )}
    </div>
  );
}
