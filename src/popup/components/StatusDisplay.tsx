import type { TranslationStatus } from "@/types";

interface Props {
  status: TranslationStatus;
  error: string | null;
}

const STATUS_CONFIG: Record<
  TranslationStatus,
  { label: string; color: string; dotColor: string }
> = {
  idle: {
    label: "Ready",
    color: "text-text-muted",
    dotColor: "bg-text-muted/40",
  },
  connecting: {
    label: "Connecting...",
    color: "text-warning",
    dotColor: "bg-warning animate-pulse",
  },
  connected: {
    label: "Connected",
    color: "text-success",
    dotColor: "bg-success",
  },
  disconnected: {
    label: "Disconnected",
    color: "text-warning",
    dotColor: "bg-warning",
  },
  error: {
    label: "Error",
    color: "text-danger",
    dotColor: "bg-danger",
  },
};

export default function StatusDisplay({ status, error }: Props) {
  const config = STATUS_CONFIG[status];

  return (
    <div className="pt-3 border-t border-surface-border space-y-1">
      <div className="flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full shrink-0 ${config.dotColor}`} />
        <span className={`text-xs font-medium ${config.color}`}>
          {config.label}
        </span>
      </div>
      {error && (
        <p className="text-[11px] text-danger/80 pl-4 break-all">{error}</p>
      )}
    </div>
  );
}
