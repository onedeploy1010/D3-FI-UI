import { useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Globe } from "lucide-react";
import { cn } from "@ai/lib/utils";

const LANGS = [
  { code: "zh-CN", label: "简体中文" },
  { code: "zh-TW", label: "繁體中文" },
  { code: "en", label: "English" },
  { code: "ja", label: "日本語" },
  { code: "ko", label: "한국어" },
  { code: "th", label: "ไทย" },
] as const;

export function LanguageSwitcher() {
  const { i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const currentCode = i18n.language.startsWith("zh-TW")
    ? "zh-TW"
    : i18n.language.startsWith("zh")
      ? "zh-CN"
      : i18n.language.split("-")[0];
  const current = LANGS.find((l) => l.code === currentCode)?.label ?? i18n.language;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className="h-8 max-w-[6rem] px-1.5 flex items-center justify-center gap-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors text-xs"
        aria-label="Switch language"
      >
        <Globe className="h-4 w-4 shrink-0" />
        <span className="truncate">{current}</span>
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-36 rounded-lg border border-border bg-card shadow-lg shadow-black/20 py-1 z-50">
          {LANGS.map(lang => (
            <button
              key={lang.code}
              onClick={() => { i18n.changeLanguage(lang.code); setOpen(false); }}
              className={cn(
                "w-full text-left px-3 py-1.5 text-sm transition-colors hover:bg-muted/50",
                currentCode === lang.code ? "text-primary font-medium" : "text-foreground"
              )}
            >
              {lang.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
