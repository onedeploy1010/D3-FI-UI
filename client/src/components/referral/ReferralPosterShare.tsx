import { useState } from 'react';
import QRCode from 'qrcode';
import { Loader2, Share2 } from 'lucide-react';
import { toast } from 'sonner';
import { copyToClipboard } from '@/lib/copyToClipboard';
import type { AppLang } from '@/i18n/types';
import { portalT } from '@/i18n/messages';

/**
 * Referral poster share: draws a branded poster (localized copy + QR code) on a
 * canvas, copies the referral link, then hands the image to the system share
 * sheet (Web Share API). Falls back to downloading the PNG where file-sharing
 * isn't available (desktop browsers).
 */

const W = 1080;
const H = 1440;

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Word-wrap that also handles CJK (character-level fallback). */
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = /\s/.test(text.trim()) ? text.split(/\s+/) : [...text];
  const joiner = /\s/.test(text.trim()) ? ' ' : '';
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const probe = line ? line + joiner + word : word;
    if (ctx.measureText(probe).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = probe;
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, 3);
}

export async function buildReferralPoster(link: string, lang: AppLang): Promise<Blob> {
  const title = portalT(lang, 'partner.title');
  const scanHint = portalT(lang, 'share.scanHint');

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  // Background: soft brand gradient + glow blobs.
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#FFF7FA');
  bg.addColorStop(0.55, '#FCE9F1');
  bg.addColorStop(1, '#F7DCE8');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  const blob1 = ctx.createRadialGradient(W * 0.85, H * 0.12, 0, W * 0.85, H * 0.12, 460);
  blob1.addColorStop(0, 'rgba(224,86,143,0.16)');
  blob1.addColorStop(1, 'rgba(224,86,143,0)');
  ctx.fillStyle = blob1;
  ctx.fillRect(0, 0, W, H);
  const blob2 = ctx.createRadialGradient(W * 0.1, H * 0.85, 0, W * 0.1, H * 0.85, 520);
  blob2.addColorStop(0, 'rgba(138,43,87,0.12)');
  blob2.addColorStop(1, 'rgba(138,43,87,0)');
  ctx.fillStyle = blob2;
  ctx.fillRect(0, 0, W, H);

  const sans =
    '-apple-system, BlinkMacSystemFont, "PingFang SC", "Noto Sans", "Segoe UI", Roboto, sans-serif';

  // Logo puck + brand.
  ctx.fillStyle = '#8A2B57';
  ctx.beginPath();
  ctx.arc(W / 2, 190, 84, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#FFF';
  ctx.font = `bold 76px ${sans}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('D³', W / 2, 196);

  ctx.fillStyle = 'rgba(22,5,16,0.55)';
  ctx.font = `600 40px ${sans}`;
  ctx.fillText('D³ Finance', W / 2, 330);

  // Localized title.
  ctx.fillStyle = '#160510';
  ctx.font = `bold 78px ${sans}`;
  const titleLines = wrapText(ctx, title, W - 160);
  let y = 440;
  for (const l of titleLines) {
    ctx.fillText(l, W / 2, y);
    y += 92;
  }

  // Scan hint.
  ctx.fillStyle = '#8A2B57';
  ctx.font = `600 46px ${sans}`;
  const hintLines = wrapText(ctx, scanHint, W - 200);
  for (const l of hintLines) {
    ctx.fillText(l, W / 2, y + 8);
    y += 62;
  }

  // Measure the link block first, then size the QR card to whatever vertical
  // space is left — long titles/hints (ru, vi…) shrink the QR instead of
  // pushing the link off the canvas.
  const linkShort = link.replace(/^https?:\/\//, '');
  ctx.font = `500 28px ui-monospace, Menlo, monospace`;
  const linkLines = wrapText(ctx, linkShort, W - 160);
  const linkBlockH = linkLines.length * 40;

  const cardY = y + 44;
  const cardSize = Math.min(560 + 96, H - cardY - linkBlockH - 120);
  const qrSize = cardSize - 96;
  const cardX = (W - cardSize) / 2;
  ctx.save();
  ctx.shadowColor = 'rgba(138,43,87,0.28)';
  ctx.shadowBlur = 60;
  ctx.shadowOffsetY = 24;
  ctx.fillStyle = '#FFFFFF';
  roundRect(ctx, cardX, cardY, cardSize, cardSize, 48);
  ctx.fill();
  ctx.restore();

  const qrDataUrl = await QRCode.toDataURL(link, {
    width: qrSize,
    margin: 1,
    color: { dark: '#160510', light: '#FFFFFF' },
    errorCorrectionLevel: 'M',
  });
  const qrImg = new Image();
  await new Promise<void>((resolve, reject) => {
    qrImg.onload = () => resolve();
    qrImg.onerror = () => reject(new Error('qr load failed'));
    qrImg.src = qrDataUrl;
  });
  ctx.drawImage(qrImg, (W - qrSize) / 2, cardY + 48, qrSize, qrSize);

  // Link lines — centered in the space left under the QR card (the domain is
  // part of the link, so no separate footer that could collide).
  ctx.fillStyle = 'rgba(22,5,16,0.6)';
  ctx.font = `500 28px ui-monospace, Menlo, monospace`;
  let ly = cardY + cardSize + Math.max(48, (H - (cardY + cardSize) - linkBlockH) / 2);
  for (const l of linkLines) {
    ctx.fillText(l, W / 2, ly);
    ly += 40;
  }

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png');
  });
}

export function ReferralShareButton({
  link,
  lang,
  className = '',
  children,
}: {
  link: string;
  lang: AppLang;
  className?: string;
  children?: React.ReactNode;
}) {
  const [busy, setBusy] = useState(false);

  const handleShare = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await copyToClipboard(link);
      const blob = await buildReferralPoster(link, lang);
      const file = new File([blob], 'd3-referral.png', { type: 'image/png' });
      const shareData: ShareData = {
        files: [file],
        text: link,
      };
      if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share(shareData);
          toast.success(portalT(lang, 'share.linkCopied'));
          return;
        } catch (e) {
          // AbortError = user closed the sheet — nothing to do; else fall back.
          if ((e as Error).name === 'AbortError') return;
        }
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'd3-referral.png';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      toast.success(portalT(lang, 'share.saved'));
    } catch {
      // Poster failed — the link is still on the clipboard.
      toast.success(portalT(lang, 'share.linkCopied'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <button type="button" onClick={() => void handleShare()} className={className} disabled={busy}>
      {busy ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <Share2 size={15} aria-hidden />}
      {children}
    </button>
  );
}
