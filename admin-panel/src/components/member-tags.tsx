import { useState } from 'react';
import { Plus, Tag, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { setMemberTags } from '@/lib/adminApi';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

/** 会员标签 chips — compact display used in tree nodes / list rows / detail. */
export function MemberTagChips({
  tags,
  onTagClick,
  className,
}: {
  tags: string[] | undefined;
  onTagClick?: (tag: string) => void;
  className?: string;
}) {
  if (!tags?.length) return null;
  return (
    <span className={cn('inline-flex flex-wrap items-center gap-1', className)}>
      {tags.map((t) => (
        <Badge
          key={t}
          variant="outline"
          className={cn(
            'h-4 border-violet-500/40 bg-violet-500/10 px-1.5 text-[10px] font-normal text-violet-400',
            onTagClick && 'cursor-pointer hover:bg-violet-500/20',
          )}
          onClick={
            onTagClick
              ? (e) => {
                  e.stopPropagation();
                  onTagClick(t);
                }
              : undefined
          }
        >
          {t}
        </Badge>
      ))}
    </span>
  );
}

/**
 * "+" popover editor: add (Enter / comma / suggestion click) and remove tags,
 * then 保存 replaces the member's tag set (PUT /members/:wallet/tags).
 */
export function MemberTagsEditor({
  wallet,
  tags,
  vocabulary,
  onSaved,
}: {
  wallet: string;
  tags: string[] | undefined;
  /** Known tags across members — offered as one-click suggestions. */
  vocabulary?: string[];
  onSaved: (wallet: string, tags: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string[]>(tags ?? []);
  const [input, setInput] = useState('');
  const [saving, setSaving] = useState(false);

  function addFromInput(raw: string) {
    const parts = raw
      .split(/[,，;；]/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (!parts.length) return;
    setDraft((prev) => {
      const next = [...prev];
      for (const p of parts) if (!next.includes(p) && next.length < 12) next.push(p);
      return next;
    });
    setInput('');
  }

  /** Draft + any un-committed input text, merged synchronously for save. */
  function finalTags(): string[] {
    const parts = input
      .split(/[,，;；]/)
      .map((s) => s.trim())
      .filter(Boolean);
    const next = [...draft];
    for (const p of parts) if (!next.includes(p) && next.length < 12) next.push(p);
    return next;
  }

  async function save() {
    const tagsToSave = finalTags();
    setSaving(true);
    try {
      const r = await setMemberTags(wallet, tagsToSave);
      toast.success('标签已保存');
      onSaved(wallet, r.tags ?? tagsToSave);
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSaving(false);
    }
  }

  const suggestions = (vocabulary ?? []).filter((t) => !draft.includes(t)).slice(0, 10);

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          setDraft(tags ?? []);
          setInput('');
        }
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="编辑标签"
          onClick={(e) => e.stopPropagation()}
          className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-border/60 text-muted-foreground hover:border-violet-500/50 hover:text-violet-400"
        >
          <Plus className="h-2.5 w-2.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-72 space-y-2.5 p-3"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="flex items-center gap-1.5 text-xs font-medium">
          <Tag className="h-3.5 w-3.5 text-violet-400" /> 会员标签
          <span className="font-mono text-[10px] text-muted-foreground">
            {wallet.slice(0, 6)}…{wallet.slice(-4)}
          </span>
        </p>

        <div className="flex min-h-6 flex-wrap gap-1">
          {draft.length === 0 && (
            <span className="text-[11px] text-muted-foreground">暂无标签</span>
          )}
          {draft.map((t) => (
            <Badge
              key={t}
              variant="outline"
              className="h-5 gap-0.5 border-violet-500/40 bg-violet-500/10 pl-1.5 pr-1 text-[11px] font-normal text-violet-400"
            >
              {t}
              <button
                type="button"
                aria-label={`移除 ${t}`}
                onClick={() => setDraft((prev) => prev.filter((x) => x !== t))}
                className="rounded-full hover:text-red-400"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>

        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addFromInput(input);
            }
          }}
          placeholder="输入标签,回车添加;逗号可批量"
          className="h-8 text-xs"
        />

        {suggestions.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {suggestions.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setDraft((prev) => (prev.length < 12 ? [...prev, t] : prev))}
                className="rounded-full border border-border/60 px-1.5 py-0.5 text-[10px] text-muted-foreground hover:border-violet-500/40 hover:text-violet-400"
              >
                + {t}
              </button>
            ))}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" size="sm" className="h-7" onClick={() => setOpen(false)} disabled={saving}>
            取消
          </Button>
          <Button size="sm" className="h-7" onClick={() => void save()} disabled={saving}>
            {saving ? '保存中…' : '保存'}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
