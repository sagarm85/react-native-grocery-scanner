import * as fs from 'fs';
import * as path from 'path';
import { GroqProvider } from './src/providers/GroqProvider';
import { normalize } from './src/normalizer';

const IMAGE_PATH = process.argv[2];
const API_KEY    = process.env.GROQ_API_KEY ?? '';

const CONFIG = {
  outputLanguage: 'both' as const,
  confidenceThreshold: 0.0,
  categories: ['dairy', 'grains', 'spices', 'oil', 'pulses', 'snacks', 'vegetables', 'other'],
};

if (!IMAGE_PATH) {
  console.error('Usage: npx ts-node test-scan.ts <path-to-image.jpg>');
  process.exit(1);
}
if (!API_KEY) {
  console.error('Error: Set ANTHROPIC_API_KEY before running.\n  export ANTHROPIC_API_KEY=sk-ant-...');
  process.exit(1);
}

async function run() {
  const ext      = path.extname(IMAGE_PATH).slice(1).toLowerCase();
  const mimeMap: Record<string, string> = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg',
    png: 'image/png',  webp: 'image/webp',
    pdf: 'application/pdf',
  };
  const mimeType = mimeMap[ext];
  if (!mimeType) {
    console.error(`Unsupported format: .${ext}  →  Use jpg, png, webp, or pdf.`);
    process.exit(1);
  }

  console.log(`\nScanning: ${IMAGE_PATH}`);
  console.log('Calling Groq Vision API (Llama 3.2)...\n');

  const base64   = fs.readFileSync(IMAGE_PATH).toString('base64');
  const provider = new GroqProvider(API_KEY);
  const result   = await provider.scan(base64, mimeType, CONFIG);
  const list     = normalize(result, CONFIG);

  console.log('── Raw text detected ─────────────────────────');
  console.log(list.rawText || '(empty)');
  console.log(`\nScan quality : ${list.scanQuality}`);
  console.log(`Items found  : ${list.items.length}\n`);
  console.log('── Normalized items ──────────────────────────');

  list.items.forEach((item, i) => {
    const conf = (item.confidence * 100).toFixed(0);
    const warn = item.confidence < 0.8 ? '  ⚠️  low confidence' : '';
    console.log(`\n  ${i + 1}. ${item.nameDevanagari}  /  ${item.nameEnglish}`);
    console.log(`     Qty      : ${item.quantity} ${item.unit}`);
    console.log(`     Category : ${item.category}`);
    console.log(`     Confidence: ${conf}%${warn}`);
  });

  console.log('\n──────────────────────────────────────────────\n');
}

run().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
