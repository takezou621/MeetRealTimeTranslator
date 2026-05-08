interface Props {
  enabled: boolean;
  loading: boolean;
  disabled: boolean;
  onToggle: (enabled: boolean) => void;
}

export default function TranslationToggle({
  enabled,
  loading,
  disabled,
  onToggle,
}: Props) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-text-muted uppercase tracking-wider">
        Translation
      </label>
      <button
        onClick={() => onToggle(!enabled)}
        disabled={disabled || loading}
        className={`
          w-full py-3 rounded-lg text-sm font-medium transition-all duration-200
          ${
            enabled
              ? "bg-danger/20 text-danger border border-danger/40 hover:bg-danger/30"
              : loading
                ? "bg-warning/20 text-warning border border-warning/40 cursor-wait"
                : disabled
                  ? "bg-surface-elevated text-text-muted/40 border border-surface-border cursor-not-allowed"
                  : "bg-primary/20 text-primary border border-primary/40 hover:bg-primary/30"
          }
        `}
      >
        {loading ? (
          <span className="flex items-center justify-center gap-2">
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
                fill="none"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
            Connecting...
          </span>
        ) : enabled ? (
          "Stop Translation"
        ) : disabled ? (
          "Set API Key to Start"
        ) : (
          "Start Translation"
        )}
      </button>
    </div>
  );
}
