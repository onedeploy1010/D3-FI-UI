import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence } from "framer-motion";
import { Search, SlidersHorizontal } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PROJECTS } from "./data";
import { ProjectCard } from "./ProjectCard";

function useShowZh() {
  const { i18n } = useTranslation();
  return i18n.language?.startsWith("zh") ?? true;
}

const CATEGORIES = ["all", "Vault", "DEX", "Lending", "Yield", "Derivatives", "Staking"];

const CATEGORY_LABELS_ZH: Record<string, string> = {
  all: "全部",
  Vault: "金库",
  DEX: "去中心化交易所",
  Lending: "借贷",
  Yield: "收益",
  Derivatives: "衍生品",
  Staking: "质押",
};

export default function Projects() {
  const showZh = useShowZh();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [sortBy, setSortBy] = useState<"trending" | "rating" | "apy">("trending");

  const categoryLabel = (c: string) => {
    if (c === "all") return showZh ? "全部 · ALL" : "All";
    return showZh ? `${c} · ${CATEGORY_LABELS_ZH[c] ?? c}` : c;
  };

  const filteredProjects = useMemo(() => {
    const q = search.toLowerCase();
    const list = PROJECTS.filter((p) => {
      const matchCat = category === "all" || p.category === category;
      const matchSearch =
        p.name.toLowerCase().includes(q) ||
        p.symbol.toLowerCase().includes(q) ||
        p.tags.some((t) => t.toLowerCase().includes(q));
      return matchCat && matchSearch;
    });
    const sorted = [...list];
    if (sortBy === "rating") sorted.sort((a, b) => b.rating - a.rating);
    else if (sortBy === "apy") sorted.sort((a, b) => b.apy - a.apy);
    return sorted;
  }, [search, category, sortBy]);

  return (
    <div className="container mx-auto space-y-8 px-4 py-8">
      {/* ── Header ── */}
      <div className="flex flex-col items-start justify-between gap-4 border-b border-border/60 pb-6 md:flex-row md:items-end">
        <div className="space-y-1">
          <span className="text-[11px] font-semibold uppercase tracking-widest text-primary/70">
            Project Intelligence
          </span>
          <h1 className="text-2xl font-bold leading-tight tracking-tight text-foreground sm:text-3xl gradient-text-gold">
            {showZh ? "热门项目分析" : "Hot Project Analysis"}
          </h1>
          <p className="pt-1 text-sm text-muted-foreground">
            {showZh
              ? "深度解读 DeFi 蓝筹与新兴收益协议，助你做出明智决策"
              : "In-depth research on DeFi blue-chips and emerging yield protocols"}
          </p>
        </div>
        <div className="flex w-full flex-col items-center gap-3 sm:flex-row md:w-auto">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder={showZh ? "搜索项目、代币..." : "Search projects, symbols..."}
              className="w-full pl-9 shadow-sm"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
            <SelectTrigger className="w-full shadow-sm sm:w-[170px]">
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
                <SelectValue />
              </div>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="trending">{showZh ? "热度" : "Trending"}</SelectItem>
              <SelectItem value="rating">{showZh ? "评分" : "Rating"}</SelectItem>
              <SelectItem value="apy">{showZh ? "收益率" : "APY"}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>


      {/* ── Category filter ── */}
      <div className="mt-8">
        {/* Mobile */}
        <div className="sm:hidden">
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="w-full shadow-sm">
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
                <SelectValue />
              </div>
            </SelectTrigger>
            <SelectContent>
              {CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {categoryLabel(c)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Desktop */}
        <div className="hidden overflow-x-auto border-b border-border/60 pb-2 sm:flex">
          <div className="flex min-w-max space-x-6">
            {CATEGORIES.map((c) => {
              const isActive = category === c;
              return (
                <button
                  key={c}
                  onClick={() => setCategory(c)}
                  className={`relative whitespace-nowrap pb-3 text-sm font-medium transition-colors ${
                    isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {categoryLabel(c)}
                  {isActive && (
                    <motion.div
                      layoutId="activeProjectCategory"
                      className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary"
                      initial={false}
                      transition={{ type: "spring", stiffness: 300, damping: 30 }}
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Project grid ── */}
      <motion.div
        layout
        className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
      >
        <AnimatePresence>
          {filteredProjects.length > 0 ? (
            filteredProjects.map((project) => (
              <motion.div
                key={project.id}
                layout
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.2 }}
              >
                <ProjectCard project={project} />
              </motion.div>
            ))
          ) : (
            <div className="col-span-full rounded-xl border border-dashed border-border bg-card/40 py-20 text-center">
              <Search className="mx-auto mb-4 h-10 w-10 text-muted-foreground opacity-20" />
              <h3 className="text-lg font-medium text-foreground">
                {showZh ? "未找到项目" : "No projects found"}
              </h3>
              <p className="mt-1 text-muted-foreground">
                {showZh ? "尝试调整筛选条件或搜索关键词。" : "Try adjusting your filters or search query."}
              </p>
            </div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
