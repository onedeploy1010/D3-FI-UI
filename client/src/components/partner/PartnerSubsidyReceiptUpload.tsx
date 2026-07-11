import { useRef, useState } from 'react';
import { ImagePlus, Loader2, Trash2, Video } from 'lucide-react';
import {
  buildSubsidyReceiptPreviews,
  revokeSubsidyReceiptPreviews,
  SUBSIDY_RECEIPT_ACCEPT,
  type SubsidyReceiptPreview,
} from '@/lib/subsidyReceiptUpload';
import { partnerModalSurfaces } from '@/components/partner/partnerStyles';
import type { AppLang } from '@/i18n/types';
import { usePartnerTranslation } from '@/i18n/usePartnerTranslation';

export function PartnerSubsidyReceiptUpload({
  lang,
  isDark,
  files,
  onChange,
  uploading,
}: {
  lang: AppLang;
  isDark: boolean;
  files: SubsidyReceiptPreview[];
  onChange: (next: SubsidyReceiptPreview[]) => void;
  uploading?: boolean;
}) {
  const p = usePartnerTranslation(lang);
  const ui = partnerModalSurfaces(isDark);
  const inputRef = useRef<HTMLInputElement>(null);

  const addFiles = (list: FileList | null) => {
    if (!list?.length) return;
    const merged = [...files];
    for (const file of Array.from(list)) {
      if (merged.length >= 12) break;
      const id = `${file.name}-${file.size}-${file.lastModified}`;
      if (merged.some((f) => f.id === id)) continue;
      merged.push({
        id,
        file,
        previewUrl: URL.createObjectURL(file),
        isVideo: file.type.startsWith('video/'),
      });
    }
    onChange(merged);
  };

  const removeFile = (id: string) => {
    const target = files.find((f) => f.id === id);
    if (target) URL.revokeObjectURL(target.previewUrl);
    onChange(files.filter((f) => f.id !== id));
  };

  return (
    <div>
      <div className={`text-xs font-semibold mb-2 ${ui.labelMuted}`}>{p('subsidy.receipts')}</div>
      <div className={`rounded-2xl p-3 ${ui.panel}`}>
        <input
          ref={inputRef}
          type="file"
          accept={SUBSIDY_RECEIPT_ACCEPT}
          multiple
          className="hidden"
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = '';
          }}
        />
        <button
          type="button"
          disabled={uploading || files.length >= 12}
          onClick={() => inputRef.current?.click()}
          className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-dashed text-xs font-semibold transition ${
            isDark
              ? 'border-white/20 text-white/70 hover:bg-white/[0.04]'
              : 'border-[#8A2B57]/25 text-[#8A2B57] hover:bg-[#E0568F]/5'
          }`}
        >
          {uploading ? <Loader2 size={14} className="animate-spin" /> : <ImagePlus size={14} />}
          {p('subsidy.uploadReceipts')}
        </button>
        <p className={`text-[10px] mt-2 leading-relaxed ${ui.labelMuted}`}>{p('subsidy.receiptsHint')}</p>
        {files.length > 0 && (
          <div className="grid grid-cols-3 gap-2 mt-3">
            {files.map((item) => (
              <div key={item.id} className="relative aspect-square rounded-xl overflow-hidden bg-black/10">
                {item.isVideo ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-[10px] font-semibold">
                    <Video size={18} className={isDark ? 'text-white/70' : 'text-[#8A2B57]'} />
                    <span className={`px-1 text-center line-clamp-2 ${ui.labelMuted}`}>{item.file.name}</span>
                  </div>
                ) : (
                  <img src={item.previewUrl} alt="" className="w-full h-full object-cover" />
                )}
                <button
                  type="button"
                  className="absolute top-1 right-1 p-1 rounded-md bg-black/55 text-white"
                  onClick={() => removeFile(item.id)}
                  aria-label="Remove"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function clearSubsidyReceiptPreviews(previews: SubsidyReceiptPreview[]) {
  revokeSubsidyReceiptPreviews(previews);
}

export { buildSubsidyReceiptPreviews };
