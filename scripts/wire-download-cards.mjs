#!/usr/bin/env node
// Patch D3FinanceDocuments/index.html: set each download card's data-href to the
// matching Supabase Storage public URL, keyed by the card's dl-name text.
// Idempotent — safe to re-run. Cards with no matching file are left empty
// (genuinely missing: promo videos, posters, English whitepaper, weekly reports).
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const HTML = join(ROOT, 'D3FinanceDocuments', 'index.html');

const env = {};
for (const line of readFileSync(join(ROOT, '.env'), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const BASE = `${env.SUPABASE_URL}/storage/v1/object/public/documents/`;

// dl-name text -> storage key
const MAP = {
  '白皮书': 'd3-finance-whitepaper-cn-v1.pdf',
  '百问百答体系': 'd3-faq-handbook.pdf',
  '项目路演 Deck': 'd3-finance-pitch-deck.pptx',
  '品牌手册': 'd3-brand-manual.pdf',
  '徽记素材包': 'd3-emblem-assets.pdf',
  '品牌色板与字体规范': 'd3-brand-colors-fonts.pdf',
  '代币经济学详解': 'd3-tokenomics.pdf',
  '关键参数速查卡': 'd3-key-params.pdf',
  '排放与减半计算表': 'd3-emission-halving.pdf',
  '贿赂金融方法论': 'd3-bribe-finance-methodology.pdf',
  'Epoch 资金流转图': 'd3-epoch-fund-flow.pdf',
  '赛道研究 · 对比资料': 'd3-track-research.pdf',
  '三部曲战略与路线图': 'd3-trilogy-roadmap.pdf',
  'RWA 合作提案书': 'd3-rwa-proposal.pdf',
  '生态合作申请表': 'd3-ecosystem-application.pdf',
  '受贿者联盟章程': 'd3-union-charter.pptx',
  'D³协议市场标准化战术方案': 'd3-market-tactics.pptx',
  '扶持政策': 'd3-support-policy.pptx',
  '考察接待流程': 'd3-visit-reception.pptx',
  '为什么是贿赂金融': 'd3-why-bribe-finance.pdf',
  '读懂双代币': 'd3-dual-token.pdf',
  '六重守护详解': 'd3-six-guardians.pdf',
  'OHM 启示录': 'd3-ohm-lessons.pdf',
};

let html = readFileSync(HTML, 'utf8');
const wired = [];
const missed = [];

html = html.replace(
  /(<div class="dl-card" data-href=")[^"]*("[\s\S]*?<div class="dl-name"[^>]*>)([^<]+)(<\/div>)/g,
  (m, p1, mid, name, p4) => {
    const key = MAP[name.trim()];
    const href = key ? BASE + key : '';
    (key ? wired : missed).push(name.trim());
    return p1 + href + mid + name + p4;
  },
);

writeFileSync(HTML, html);
console.log(`Wired ${wired.length} cards -> storage:`);
wired.forEach((n) => console.log(`  ✓ ${n}`));
console.log(`\nLeft empty (no source file) ${missed.length}:`);
missed.forEach((n) => console.log(`  · ${n}`));

// Sanity: every MAP entry should have matched at least once.
const unmatched = Object.keys(MAP).filter((k) => !wired.includes(k));
if (unmatched.length) {
  console.error(`\n⚠ MAP keys that matched no card (check dl-name text): ${unmatched.join(', ')}`);
  process.exit(1);
}
