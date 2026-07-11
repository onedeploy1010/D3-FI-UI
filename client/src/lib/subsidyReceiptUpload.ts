import { signPartnerSubsidyReceiptUploads } from '@/lib/unionApi';

const MAX_FILES = 12;
const MAX_BYTES = 52_428_800;
const ACCEPT =
  'image/jpeg,image/png,image/webp,image/gif,image/heic,video/mp4,video/quicktime,video/webm';

export const SUBSIDY_RECEIPT_ACCEPT = ACCEPT;

export type SubsidyReceiptPreview = {
  id: string;
  file: File;
  previewUrl: string;
  isVideo: boolean;
};

export function buildSubsidyReceiptPreviews(files: File[]): SubsidyReceiptPreview[] {
  return files.map((file) => ({
    id: `${file.name}-${file.size}-${file.lastModified}`,
    file,
    previewUrl: URL.createObjectURL(file),
    isVideo: file.type.startsWith('video/'),
  }));
}

export function revokeSubsidyReceiptPreviews(previews: SubsidyReceiptPreview[]) {
  for (const p of previews) URL.revokeObjectURL(p.previewUrl);
}

export async function uploadSubsidyReceipts(wallet: string, files: File[]): Promise<string[]> {
  if (!files.length) return [];
  if (files.length > MAX_FILES) throw new Error(`最多上传 ${MAX_FILES} 个文件`);

  for (const file of files) {
    if (file.size <= 0 || file.size > MAX_BYTES) {
      throw new Error(`文件过大：${file.name}`);
    }
  }

  const { uploads } = await signPartnerSubsidyReceiptUploads(
    wallet,
    files.map((f) => ({ name: f.name, contentType: f.type || 'application/octet-stream', size: f.size })),
  );

  const paths: string[] = [];
  for (let i = 0; i < uploads.length; i++) {
    const upload = uploads[i];
    const file = files[i];
    const res = await fetch(upload.signedUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': file.type || upload.contentType || 'application/octet-stream',
        'x-upsert': 'false',
      },
      body: file,
    });
    if (!res.ok) throw new Error(`上传失败：${file.name}`);
    paths.push(upload.path);
  }
  return paths;
}
