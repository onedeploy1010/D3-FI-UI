import { Link, useRoute } from "wouter";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft,
  ExternalLink,
  ShieldAlert,
  Star,
  TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getProjectBySlug } from "./data";
import { RiskBadge } from "./ProjectCard";

function useShowZh() {
  const { i18n } = useTranslation();
  return i18n.language?.startsWith("zh") ?? true;
}

export default function ProjectDetail() {
  const showZh = useShowZh();
  const [, params] = useRoute("/projects/detail/:slug");
  const slug = params?.slug ?? "";
  const project = slug ? getProjectBySlug(slug) : undefined;

  if (!project) {
    return (
      <div className="container mx-auto px-4 py-20 text-center">
        <ShieldAlert className="mx-auto mb-4 h-12 w-12 text-destructive" />
        <h1 className="mb-2 text-2xl font-bold text-foreground">
          {showZh ? "未找到项目" : "Project not found"}
        </h1>
        <p className="mb-6 text-muted-foreground">
          {showZh
            ? "您查找的项目不存在或已被移除。"
            : "The project you are looking for does not exist or has been removed."}
        </p>
        <Link href="/projects">
          <Button variant="outline">
            <ArrowLeft className="mr-2 h-4 w-4" /> {showZh ? "返回项目列表" : "Back to Projects"}
          </Button>
        </Link>
      </div>
    );
  }

  const description = showZh ? project.descriptionZh : project.descriptionEn;

  return (
    <div className="container mx-auto space-y-8 px-4 py-8">
      <Link
        href="/projects"
        className="inline-flex items-center text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="mr-2 h-4 w-4" /> {showZh ? "返回项目列表" : "Back to Projects"}
      </Link>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        {/* Main content */}
        <div className="space-y-8 lg:col-span-2">
          <div className="flex flex-col justify-between gap-6 border-b border-border/60 pb-6 md:flex-row md:items-start">
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-4xl font-extrabold tracking-tight text-foreground">
                  {project.name}
                </h1>
                <Badge
                  variant="secondary"
                  className="border-border bg-muted/50 px-2 py-1 font-mono text-sm"
                >
                  {project.symbol}
                </Badge>
                {project.isRecommended && (
                  <Badge className="bg-primary text-primary-foreground">
                    <Star className="mr-1 h-3 w-3 fill-current" />
                    {showZh ? "推荐" : "Recommended"}
                  </Badge>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <RiskBadge level={project.riskLevel} />
                <Badge
                  variant="outline"
                  className="bg-background/50 text-[11px] uppercase tracking-wider"
                >
                  {project.category}
                </Badge>
                {project.website && (
                  <a
                    href={project.website}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center text-sm text-primary hover:underline"
                  >
                    {showZh ? "官方网站" : "Official Website"}{" "}
                    <ExternalLink className="ml-1 h-3 w-3" />
                  </a>
                )}
              </div>
            </div>

            <div className="min-w-[200px] rounded-xl border border-border border-t-[3px] border-t-emerald-500 bg-card p-4 text-center shadow-sm md:text-right">
              <p className="mb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                {showZh ? "当前 APY" : "Current APY"}
              </p>
              <p className="font-mono text-4xl font-bold text-emerald-600">
                {project.apy.toFixed(2)}%
              </p>
            </div>
          </div>

          <div className="space-y-6">
            <h2 className="flex items-center gap-2 border-l-4 border-primary pl-4 text-xl font-semibold text-foreground">
              {showZh ? "情报报告" : "Intelligence Report"}
            </h2>
            <div className="rounded-xl border border-border/60 bg-card/40 p-6 text-base leading-relaxed text-muted-foreground">
              <p>{description}</p>
            </div>

            {project.tags.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-2">
                {project.tags.map((tag) => (
                  <Badge
                    key={tag}
                    variant="secondary"
                    className="border border-border/50 bg-accent/40 font-normal text-accent-foreground"
                  >
                    {tag}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Sidebar metrics */}
        <div className="space-y-6">
          <Card className="border-border bg-card shadow-sm">
            <CardHeader className="mb-4 border-b border-border/60 pb-4">
              <CardTitle className="text-lg font-semibold text-foreground">
                {showZh ? "核心指标" : "Key Metrics"}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-1">
                <p className="flex justify-between text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  <span>{showZh ? "总锁仓价值" : "Total Value Locked"}</span>
                </p>
                <p className="font-mono text-2xl font-bold tracking-tight text-foreground/90">
                  {project.tvl}
                </p>
              </div>
              <div className="space-y-1">
                <p className="flex justify-between text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  <span>{showZh ? "市值" : "Market Cap"}</span>
                </p>
                <p className="font-mono text-xl font-medium tracking-tight text-foreground">
                  {project.marketCap}
                </p>
              </div>
              <div className="space-y-1">
                <p className="flex justify-between text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  <span>{showZh ? "终端评分" : "Terminal Rating"}</span>
                </p>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xl text-primary">
                    {project.rating.toFixed(1)}
                  </span>
                  <span className="text-sm font-medium text-muted-foreground">/ 5.0</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="relative overflow-hidden border-primary/20 bg-gradient-to-b from-card to-primary/5 shadow-sm">
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/[0.06] to-transparent" />
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg font-semibold text-foreground">
                <TrendingUp className="h-4 w-4 text-primary" />
                {showZh ? "收益模拟器" : "Yield Simulator"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-4 text-sm text-muted-foreground">
                {showZh
                  ? `使用计算工具测算 ${project.symbol} 在不同参数下的潜在收益。`
                  : `Estimate potential ${project.symbol} returns across different parameters using our tools.`}
              </p>
              <Link href="/tools">
                <Button className="w-full">{showZh ? "启动模拟器" : "Launch Simulator"}</Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
