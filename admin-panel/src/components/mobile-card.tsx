import type { ReactNode } from "react";

/**
 * Mobile-only data row container — pairs with a `<table>` rendered on
 * desktop. Page convention:
 *
 *   <table className="hidden lg:table"> ... </table>
 *   <div className="lg:hidden space-y-3">
 *     {rows.map(r => <MobileDataCard header={...} fields={[...]} />)}
 *   </div>
 *
 * Generic on purpose: `header` and `actions` accept any ReactNode so
 * each page can drop in its own badges / icons / buttons.
 */
interface CardField {
  label: string;
  value: ReactNode;
  mono?: boolean;
}

interface MobileDataCardProps {
  header: ReactNode;
  fields: CardField[];
  actions?: ReactNode;
}

function CardFieldRow({ label, value, mono }: CardField) {
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-[11px] text-muted-foreground font-medium">{label}</span>
      <span
        className={`text-[12px] text-foreground/85 text-right max-w-[60%] truncate font-medium ${
          mono ? "font-mono text-[11px]" : ""
        }`}
      >
        {value}
      </span>
    </div>
  );
}

export function MobileDataCard({ header, fields, actions }: MobileDataCardProps) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card/40 p-4 surface-3d active:scale-[0.99] transition-transform">
      <div className="mb-2.5 pb-2.5 border-b border-border/60">{header}</div>
      <div className="divide-y divide-border/40">
        {fields.map((f, i) => (
          <CardFieldRow key={i} {...f} />
        ))}
      </div>
      {actions && <div className="mt-3 pt-2.5 border-t border-border/60">{actions}</div>}
    </div>
  );
}
