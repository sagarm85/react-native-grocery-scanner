import * as fs from 'fs';
import * as path from 'path';
import { OpenAIProvider } from './src/providers/OpenAIProvider';
import { ClaudeProvider } from './src/providers/ClaudeProvider';
import { ChainedProvider } from './src/providers/ChainedProvider';
import { normalize } from './src/normalizer';
import type { ScanConfig } from './src/types';

const IMAGE_PATH    = process.argv[2];
const OPENAI_KEY    = process.env.OPENAI_API_KEY ?? '';
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY ?? '';
const REFINEMENT_THRESHOLD = 0.85;

const CONFIG: ScanConfig = {
  outputLanguage: 'both',
  confidenceThreshold: 0.0,
  categories: ['dairy', 'grains', 'spices', 'oil', 'pulses', 'snacks', 'vegetables', 'other'],
};

const MIME_MAP: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg',
  png: 'image/png',  webp: 'image/webp',
  pdf: 'application/pdf',
};

if (!IMAGE_PATH) {
  console.error('Usage: npx ts-node test-scan.ts <path-to-image>');
  process.exit(1);
}
if (!OPENAI_KEY) {
  console.error('Set OPENAI_API_KEY before running.\n  export OPENAI_API_KEY=sk-...');
  process.exit(1);
}
if (!ANTHROPIC_KEY) {
  console.error('Set ANTHROPIC_API_KEY before running.\n  export ANTHROPIC_API_KEY=sk-ant-...');
  process.exit(1);
}

function printItems(
  items: ReturnType<typeof normalize>['items'],
  flagBelow?: number,
) {
  items.forEach((item, i) => {
    const conf = (item.confidence * 100).toFixed(0);
    const flag = flagBelow !== undefined && item.confidence < flagBelow ? '  ⚠️  low' : '';
    console.log(`\n  ${i + 1}. ${item.nameDevanagari ?? '—'}  /  ${item.nameEnglish ?? '—'}`);
    console.log(`     Qty       : ${item.quantity} ${item.unit}`);
    console.log(`     Category  : ${item.category}`);
    console.log(`     Confidence: ${conf}%${flag}`);
    if (item.day) console.log(`     Day       : ${item.day}`);
  });
}

async function run() {
  const ext      = path.extname(IMAGE_PATH).slice(1).toLowerCase();
  const mimeType = MIME_MAP[ext];
  if (!mimeType) {
    console.error(`Unsupported format: .${ext} — use jpg, png, webp, or pdf.`);
    process.exit(1);
  }

  const base64 = fs.readFileSync(IMAGE_PATH).toString('base64');

  // ── Step 1: OpenAI GPT-4o only ─────────────────────────────────────
  console.log(`\nScanning: ${IMAGE_PATH}`);
  console.log('Step 1 — OpenAI GPT-4o (image scan)...\n');

  const openaiResult = await new OpenAIProvider(OPENAI_KEY).scan(base64, mimeType, CONFIG);
  const openaiList   = normalize(openaiResult, CONFIG);
  const lowCount     = openaiList.items.filter(i => i.confidence < REFINEMENT_THRESHOLD).length;

  console.log('── Raw text ──────────────────────────────────');
  console.log(openaiList.rawText || '(empty)');
  console.log(`\nScan quality : ${openaiList.scanQuality}`);
  console.log(`Items found  : ${openaiList.items.length}  (${lowCount} below ${REFINEMENT_THRESHOLD * 100}% threshold)`);
  console.log('\n── GPT-4o results ────────────────────────────');
  printItems(openaiList.items, REFINEMENT_THRESHOLD);

  if (lowCount === 0) {
    console.log('\n✓ All items above threshold — no Claude refinement needed.\n');
    console.log('──────────────────────────────────────────────\n');
    return;
  }

  // ── Step 2: Chain (OpenAI → Claude refinement) ─────────────────────
  console.log(`\n\nStep 2 — Claude refining ${lowCount} low-confidence item(s)...\n`);

  const chainResult = await new ChainedProvider({
    primary: new OpenAIProvider(OPENAI_KEY),
    refiner: new ClaudeProvider(ANTHROPIC_KEY),
    refinementThreshold: REFINEMENT_THRESHOLD,
  }).scan(base64, mimeType, CONFIG);

  const chainList = normalize(chainResult, CONFIG);

  console.log('── After Claude refinement ───────────────────');
  printItems(chainList.items);
  console.log('\n──────────────────────────────────────────────\n');
}

run().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
