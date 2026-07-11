import type { ReactNode } from "react";

/**
 * Standard wrapper for every admin page — keeps the title row, breadcrumb
 * spacing, and inner padding consistent. Pages just compose `<PageShell
 * title="..."><table /></PageShell>`.
 */
interface Props {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}

export function PageShell({ title, subtitle, actions, children }: Props) {
  return (
    <div className="px-4 lg:px-8 py-4 lg:py-6 space-y-4 lg:space-y-6">
      <header className="relative flex items-start justify-between gap-3 flex-wrap pb-3 border-b border-border/40">
        {/* Top accent line — subtle amber pulse so the chrome looks
           intentional instead of empty. */}
        <div className="pointer-events-none absolute inset-x-0 -top-px h-px bg-gradient-to-r from-transparent via-amber-400/40 to-transparent" />
        <div className="min-w-0 flex-1">
          <h1
            className="text-xl lg:text-3xl font-black tracking-tight truncate"
            style={{
              background: "linear-gradient(135deg, #fef3c7 0%, #fde68a 30%, #fbbf24 70%, #d97706 100%)",
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              WebkitTextFillColor: "transparent",
              filter: "drop-shadow(0 1px 0 rgba(0,0,0,0.45))",
            }}
          >
            {title}
          </h1>
          {subtitle && (
            <p className="text-[11px] lg:text-xs text-muted-foreground mt-1 leading-relaxed">{subtitle}</p>
          )}
        </div>
        {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
      </header>
      <section>{children}</section>
    </div>
  );
}

/** Empty placeholder card used by M1 stubs; pages replace this with their
 *  actual table / cards in M2/M3. */
export function StubBody({ note }: { note: string }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card/40 px-6 py-12 text-center">
      <p className="text-sm text-muted-foreground">{note}</p>
      <p className="text-[11px] text-muted-foreground/60 mt-2">
        M2 / M3 will wire this page to Supabase and Postgres functions.
      </p>
    </div>
  );
}
