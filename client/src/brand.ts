/** D³ Finance brand tokens — from Brand Identity System v2026 */

export const brand = {
  imperial: '#5E1A3C',
  primary: '#8A2B57',
  vivid: '#B23A6E',
  accent: '#E0568F',
  ink: '#160510',
  fonts: {
    roundedCn: '"雅圆", "FZLanTingYuan", "Yuanti SC", "STYuanti", "PingFang SC", sans-serif',
    roundedEn: '"Nunito", "Varela Round", sans-serif',
    numeric: '"Cormorant Garamond", Georgia, serif',
  },
} as const;

/** Resolve public/brand assets for Vite base path (e.g. GitHub Pages /D3-FI-UI/) */
export function brandAsset(path: string) {
  const base = import.meta.env.BASE_URL ?? '/';
  const normalized = path.replace(/^\//, '');
  return `${base}${normalized}`;
}

export const brandLogo = {
  svg: brandAsset('brand/logo/D3-logo-mark.svg'),
  light: brandAsset('brand/logo/D3-logo-light.png'),
  light2x: brandAsset('brand/logo/D3-logo-light-2x.png'),
  crimson: brandAsset('brand/logo/D3-logo-crimson.png'),
  crimson2x: brandAsset('brand/logo/D3-logo-crimson-2x.png'),
  primary: brandAsset('brand/logo/D3-logo-primary.png'),
  primary2x: brandAsset('brand/logo/D3-logo-primary-2x.png'),
  mono: brandAsset('brand/logo/D3-logo-mono.png'),
  mono2x: brandAsset('brand/logo/D3-logo-mono-2x.png'),
} as const;
