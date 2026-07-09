import { useState, useRef, useEffect } from 'react';
import { Globe } from 'lucide-react';
import { APP_LANGS, type AppLang } from '@/i18n/types';
import { useAppLang } from '@/i18n/LanguageContext';
import { cn } from '@/lib/utils';

export function AppLanguageSwitcher({ className }: { className?: string }) {
  const { lang, setLang } = useAppLang();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const current = APP_LANGS.find((l) => l.code === lang)?.label ?? lang;

  return (
    <div className={cn('relative', className)} ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="h-8 max-w-[7rem] px-2 rounded-md text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors touch-manipulation flex items-center gap-1 truncate"
        aria-label="Switch language"
      >
        <Globe className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">{current}</span>
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-40 rounded-xl border border-border bg-card/95 backdrop-blur-xl shadow-lg shadow-black/15 py-1 z-50">
          {APP_LANGS.map((item) => (
            <button
              key={item.code}
              type="button"
              onClick={() => {
                setLang(item.code);
                setOpen(false);
              }}
              className={cn(
                'w-full text-left px-3 py-2 text-xs transition-colors hover:bg-muted/50',
                lang === item.code ? 'text-[#E0568F] font-semibold' : 'text-foreground',
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
