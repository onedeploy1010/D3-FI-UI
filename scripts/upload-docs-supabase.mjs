#!/usr/bin/env node
// Upload all D3FinanceDocuments PDFs / PPTX / DOCX to a public Supabase Storage
// bucket under clean ASCII keys, and emit a manifest (basename -> public URL).
// Idempotent (upsert). Supabase object keys must be ASCII, hence the slug map.
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname, basename } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const DOCS_DIR = join(ROOT, 'D3FinanceDocuments');
const BUCKET = 'documents';

// Chinese basename -> ASCII storage key (Supabase rejects non-ASCII keys).
const SLUG = {
  'D3 Brand.pdf': 'd3-brand-en.pdf',
  'D3_Epoch资金流转图.pdf': 'd3-epoch-fund-flow.pdf',
  'D3_FAQ新人手册.pdf': 'd3-faq-handbook.pdf',
  'D3_Finance_DE.pptx': 'd3-finance-deck-de.pptx',
  'D3_Finance_EN.pptx': 'd3-finance-deck-en.pptx',
  'D3_Finance_ES.pptx': 'd3-finance-deck-es.pptx',
  'D3_Finance_FR.pptx': 'd3-finance-deck-fr.pptx',
  'D3_Finance_Whitepaper_v1.0_CN.docx': 'd3-whitepaper-cn.docx',
  'D3_Finance市场演讲稿.pptx': 'd3-finance-pitch-deck.pptx',
  'D3_OHM启示录.pdf': 'd3-ohm-lessons.pdf',
  'D3_RWA合作提案书.pdf': 'd3-rwa-proposal.pdf',
  'D3_三部曲战略与路线图.pdf': 'd3-trilogy-roadmap.pdf',
  'D3_为什么是贿赂金融.pdf': 'd3-why-bribe-finance.pdf',
  'D3_代币经济学详解.pdf': 'd3-tokenomics.pdf',
  'D3_六重守护详解.pdf': 'd3-six-guardians.pdf',
  'D3_关键参数速查卡.pdf': 'd3-key-params.pdf',
  'D3_受贿者联盟章程.pptx': 'd3-union-charter.pptx',
  'D3_受贿者联盟系统_产品使用手册.pdf': 'd3-union-product-manual.pdf',
  'D3_品牌手册.pdf': 'd3-brand-manual.pdf',
  'D3_品牌色板与字体规范.pdf': 'd3-brand-colors-fonts.pdf',
  'D3_市场标准化战术方案.pptx': 'd3-market-tactics.pptx',
  'D3_徽记素材包.pdf': 'd3-emblem-assets.pdf',
  'D3_扶持政策.pptx': 'd3-support-policy.pptx',
  'D3_排放与减半计算表.pdf': 'd3-emission-halving.pdf',
  'D3_生态合作申请表.pdf': 'd3-ecosystem-application.pdf',
  'D3_考察接待流程.pptx': 'd3-visit-reception.pptx',
  'D3_读懂双代币.pdf': 'd3-dual-token.pdf',
  'D3_贿赂金融方法论.pdf': 'd3-bribe-finance-methodology.pdf',
  'D3_赛道研究对比资料.pdf': 'd3-track-research.pdf',
  'd3-finance-whitepaper-cn-v1.pdf': 'd3-finance-whitepaper-cn-v1.pdf',
};

// Load .env
const env = {};
for (const line of readFileSync(join(ROOT, '.env'), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const SUPABASE_URL = env.SUPABASE_URL;
const KEY = env.SUPABASE_SECRET_KEY;
if (!SUPABASE_URL || !KEY) throw new Error('Missing SUPABASE_URL / SUPABASE_SECRET_KEY in .env');
const H = { Authorization: `Bearer ${KEY}`, apikey: KEY };

const MIME = {
  '.pdf': 'application/pdf',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (MIME[extname(name).toLowerCase()]) out.push(p);
  }
  return out;
}

// Prefer the downloads/ copy when a basename appears more than once.
const byBase = new Map();
for (const p of walk(DOCS_DIR)) {
  const b = basename(p);
  const prev = byBase.get(b);
  if (!prev || (p.includes('/downloads/') && !prev.includes('/downloads/'))) byBase.set(b, p);
}

async function ensureBucket() {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/bucket`, {
    method: 'POST', headers: { ...H, 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: BUCKET, name: BUCKET, public: true }),
  });
  if (res.ok) return console.log(`Created public bucket "${BUCKET}"`);
  const txt = await res.text();
  if (res.status === 409 || /already exists/i.test(txt)) return console.log(`Bucket "${BUCKET}" exists`);
  throw new Error(`Bucket create failed ${res.status}: ${txt}`);
}

async function del(key) {
  await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${encodeURIComponent(key)}`, { method: 'DELETE', headers: H });
}

async function upload(path, key) {
  const url = `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${key}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { ...H, 'Content-Type': MIME[extname(path).toLowerCase()], 'x-upsert': 'true' },
    body: readFileSync(path),
  });
  if (!res.ok) throw new Error(`Upload ${key} failed ${res.status}: ${await res.text()}`);
  return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${key}`;
}

await ensureBucket();
await del('D3 Brand.pdf'); // stray key from an earlier run

const manifest = {};
for (const [base, path] of [...byBase].sort()) {
  const key = SLUG[base];
  if (!key) throw new Error(`No slug mapping for "${base}" — add it to SLUG`);
  manifest[base] = await upload(path, key);
  console.log(`✓ ${base} -> ${key}`);
}
writeFileSync(join(ROOT, 'scripts', 'docs-manifest.json'), JSON.stringify(manifest, null, 2));
console.log(`\nUploaded ${Object.keys(manifest).length} docs. Manifest -> scripts/docs-manifest.json`);
