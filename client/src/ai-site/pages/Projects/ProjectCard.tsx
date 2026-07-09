import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { ArrowUpRight, Shield, ShieldAlert, ShieldCheck, Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@ai/lib/utils";
import type { Project, RiskLevel } from "./data";

function useShowZh() {
  const { i18n } = useTranslation();
  return i18n.language?.startsWith("zh") ?? true;
}

export function RiskBadge({ level }: { level: RiskLevel }) {
  const showZh = useShowZh();
  const config: Record<RiskLevel, { label: string; en: string; cls: string; icon: typeof Shield }> = {
    low: {
      label: "低风险",
      en: "Low Risk",
      cls: "bg-emerald-500/10 text-emerald-600 border-emerald-500/25",
      icon: ShieldCheck,
    },
    medium: {
      label: "中风险",
      en: "Medium Risk",
      cls: "bg-amber-500/10 text-amber-600 border-amber-500/25",
      icon: Shield,
    },
    high: {
      label: "高风险",
      en: "High Risk",
      cls: "bg-red-500/10 text-red-500 border-red-500/25",
      icon: ShieldAlert,
    },
  };
  const c = config[level];
  const Icon = c.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold",
        c.cls,
      )}
    >
      <Icon className="h-3 w-3" />
      {showZh ? c.label : c.en}
    </span>
  );
}

export function ProjectCard({ project }: { project: Project }) {
  const showZh = useShowZh();
  const href = project.detailPath ?? `/projects/detail/${project.slug}`;
  const initials = project.symbol.slice(0, 2).toUpperCase();

  return (
    <Link href={href}>
      <div className="group relative flex h-full cursor-pointer flex-col rounded-xl border border-border bg-card p-5 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-[0_8px_28px_-8px_hsl(var(--primary)/0.25)]">
        {/* Header: logo + name/symbol + rating */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-sm font-bold text-primary">
              {initials}
            </div>
            <div className="min-w-0">
              <h3 className="truncate text-base font-bold leading-tight text-foreground">
                {project.name}
              </h3>
              <p className="font-mono text-xs text-muted-foreground">{project.symbol}</p>
            </div>
          </div>
          <div className="flex items-center gap-0.5 text-primary">
            <Star className="h-3.5 w-3.5 fill-current" />
            <span className="font-mono text-xs font-semibold">{project.rating.toFixed(1)}</span>
          </div>
        </div>

        {/* Category + risk */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Badge
            variant="outline"
            className="border-border bg-muted/40 text-[10px] uppercase tracking-wider"
          >
            {project.category}
          </Badge>
          <RiskBadge level={project.riskLevel} />
        </div>

        {/* APY + TVL */}
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-lg border border-emerald-500/15 bg-emerald-500/[0.04] px-3 py-2">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">APY</p>
            <p className="mt-0.5 font-mono text-lg font-bold leading-tight text-emerald-600">
              {project.apy.toFixed(2)}%
            </p>
          </div>
          <div className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">TVL</p>
            <p className="mt-0.5 font-mono text-lg font-bold leading-tight text-foreground/85">
              {project.tvl}
            </p>
          </div>
        </div>

        {/* Tags */}
        {project.tags.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {project.tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="rounded-full border border-primary/15 bg-primary/[0.06] px-2 py-0.5 text-[10px] font-medium text-primary/80"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Footer CTA */}
        <div className="mt-auto flex items-center gap-1 pt-4 text-sm font-semibold text-primary">
          {showZh ? "查看分析" : "View Analysis"}
          <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
        </div>
      </div>
    </Link>
  );
}
