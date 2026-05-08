import { SUPPORTED_LANGUAGES } from "@/lib/constants";

interface Props {
  value: string;
  onChange: (lang: string) => void;
}

export default function LanguageSelector({ value, onChange }: Props) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-text-muted uppercase tracking-wider">
        Target Language
      </label>
      <div className="space-y-1">
        <p className="text-[10px] text-text-muted/60">
          Source: Auto-detect
        </p>
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full bg-surface-elevated border border-surface-border rounded-lg px-3 py-2 text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors appearance-none cursor-pointer"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
            backgroundRepeat: "no-repeat",
            backgroundPosition: "right 12px center",
          }}
        >
          {SUPPORTED_LANGUAGES.map((lang) => (
            <option key={lang.code} value={lang.code}>
              {lang.nativeName} ({lang.name})
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
