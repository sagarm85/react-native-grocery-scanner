# ChainedProvider Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `ChainedProvider` — runs Groq (primary) for image OCR, then passes low-confidence items to Claude for text-based correction, returning one merged `GroceryList`.

**Architecture:** New `RefinementProvider` interface in `types.ts`; `ClaudeProvider` implements it via a new `refine()` text-only method; `ChainedProvider` orchestrates primary scan → selective refinement → positional merge. `GroceryScanner` and all existing providers are unchanged.

**Tech Stack:** TypeScript, `@anthropic-ai/sdk`, Jest + ts-jest, ts-node (for local test script)

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `src/types.ts` | Modify | Add `RefinementProvider` interface |
| `src/prompt.ts` | Modify | Add `buildRefinementPrompt()` |
| `src/providers/ClaudeProvider.ts` | Modify | Implement `RefinementProvider` via `refine()` |
| `src/providers/ChainedProvider.ts` | Create | `ChainedProvider` + `ChainedProviderConfig` |
| `src/index.ts` | Modify | Export `ChainedProvider`, `ChainedProviderConfig`, `RefinementProvider` |
| `src/__tests__/prompt.test.ts` | Modify | Add tests for `buildRefinementPrompt` |
| `src/__tests__/providers/ClaudeProvider.test.ts` | Modify | Add tests for `refine()` |
| `src/__tests__/ChainedProvider.test.ts` | Create | Full tests for `ChainedProvider` |
| `test-scan.ts` | Modify | Update local test script to use `ChainedProvider` |

---

## Task 1: Add `RefinementProvider` interface to `src/types.ts`

**Files:**
- Modify: `src/types.ts`

- [ ] **Step 1: Add `RefinementProvider` to `src/types.ts`**

Append after the `GroceryProvider` interface (after line 50):

```ts
export interface RefinementProvider {
  refine(rawText: string, items: RawItem[], config: ScanConfig): Promise<RawItem[]>;
}
```

The full `src/types.ts` should now end with:

```ts
export interface ScannerConfig extends ScanConfig {
  provider: 'claude' | GroceryProvider;
  apiKey?: string;
}

export interface RefinementProvider {
  refine(rawText: string, items: RawItem[], config: ScanConfig): Promise<RawItem[]>;
}
```

- [ ] **Step 2: Verify typecheck passes**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/types.ts
git commit -m "feat: add RefinementProvider interface"
```

---

## Task 2: Add `buildRefinementPrompt` to `src/prompt.ts`

**Files:**
- Modify: `src/prompt.ts`
- Modify: `src/__tests__/prompt.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `src/__tests__/prompt.test.ts`:

```ts
import { buildPrompt, buildRefinementPrompt } from '../prompt';
import type { RawItem, ScanConfig } from '../types';
```

Replace the existing import line `import { buildPrompt } from '../prompt';` and add `RawItem` to the type import. Then append a new describe block at the bottom of the file:

```ts
describe('buildRefinementPrompt', () => {
  const rawText = 'चावल 2 kg, दाल 1 kg, ??? 500g';
  const items: RawItem[] = [
    { nameDevanagari: '???', nameEnglish: 'Unknown', quantity: 500, unit: 'g', category: 'other', confidence: 0.3 },
  ];

  it('includes rawText verbatim', () => {
    const prompt = buildRefinementPrompt(rawText, items, config);
    expect(prompt).toContain(rawText);
  });

  it('includes the items as JSON', () => {
    const prompt = buildRefinementPrompt(rawText, items, config);
    expect(prompt).toContain('"confidence"');
    expect(prompt).toContain('0.3');
  });

  it('includes all configured categories', () => {
    const prompt = buildRefinementPrompt(rawText, items, config);
    expect(prompt).toContain('dairy');
    expect(prompt).toContain('grains');
  });

  it('instructs Claude to return a JSON array of the same length', () => {
    const prompt = buildRefinementPrompt(rawText, items, config);
    expect(prompt).toContain('JSON array');
    expect(prompt).toContain('same length');
  });

  it('returns a non-empty string over 100 characters', () => {
    const prompt = buildRefinementPrompt(rawText, items, config);
    expect(typeof prompt).toBe('string');
    expect(prompt.length).toBeGreaterThan(100);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx jest src/__tests__/prompt.test.ts --no-coverage
```

Expected: FAIL — `buildRefinementPrompt is not a function`

- [ ] **Step 3: Implement `buildRefinementPrompt` in `src/prompt.ts`**

Add `RawItem` to the import at the top of `src/prompt.ts`:

```ts
import type { RawItem, ScanConfig } from './types';
```

Then append the function after `buildPrompt`:

```ts
export function buildRefinementPrompt(rawText: string, items: RawItem[], config: ScanConfig): string {
  return `You are correcting specific items from a handwritten Devanagari grocery list.

The full text extracted from the image is:
"${rawText}"

The following items were read with low confidence and need correction.
Using the raw text above as context, correct each item.

Items to correct:
${JSON.stringify(items, null, 2)}

Return ONLY a JSON array of the same length as the input, in the same order.
Each element must follow this exact schema:
{
  "nameDevanagari": "string (correct standard Hindi name in Devanagari script)",
  "nameEnglish": "string (English name in Latin script)",
  "quantity": number,
  "unit": "string (one of: kg, g, litre, ml, packet, piece, dozen, bunch, box, bottle, can, other)",
  "category": "string (one of: ${config.categories.join(', ')})",
  "confidence": number (0.0 to 1.0),
  "day": "string (optional — only if item appeared under a day-of-week heading)"
}

Rules:
- nameDevanagari must be correct standard Hindi — never copy phonetic transliterations from the image
- nameEnglish must always be in Latin script
- confidence should reflect your certainty in the correction
- Return ONLY the JSON array with no other text`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx jest src/__tests__/prompt.test.ts --no-coverage
```

Expected: PASS — 10 tests (5 existing + 5 new)

- [ ] **Step 5: Commit**

```bash
git add src/prompt.ts src/__tests__/prompt.test.ts
git commit -m "feat: add buildRefinementPrompt"
```

---

## Task 3: Add `refine()` to `ClaudeProvider`

**Files:**
- Modify: `src/providers/ClaudeProvider.ts`
- Modify: `src/__tests__/providers/ClaudeProvider.test.ts`

- [ ] **Step 1: Write the failing tests**

Append a new `describe` block at the bottom of `src/__tests__/providers/ClaudeProvider.test.ts`:

```ts
describe('ClaudeProvider.refine()', () => {
  const lowConfItems: RawItem[] = [
    { nameDevanagari: '???', nameEnglish: 'Unknown', quantity: 500, unit: 'g', category: 'other', confidence: 0.3 },
  ];
  const refinedItems: RawItem[] = [
    { nameDevanagari: 'नमक', nameEnglish: 'Salt', quantity: 500, unit: 'g', category: 'other', confidence: 0.95 },
  ];

  it('sends a text-only message (no image content block)', async () => {
    const { mockCreate } = setupMock(JSON.stringify(refinedItems));
    await new ClaudeProvider('sk-ant-test').refine('raw text', lowConfItems, config);
    const msg = mockCreate.mock.calls[0][0].messages[0];
    expect(typeof msg.content).toBe('string');
  });

  it('returns corrected RawItem[]', async () => {
    setupMock(JSON.stringify(refinedItems));
    const result = await new ClaudeProvider('sk-ant-test').refine('raw text', lowConfItems, config);
    expect(result).toHaveLength(1);
    expect(result[0].nameEnglish).toBe('Salt');
    expect(result[0].confidence).toBe(0.95);
  });

  it('parses JSON wrapped in markdown code fences', async () => {
    setupMock('```json\n' + JSON.stringify(refinedItems) + '\n```');
    const result = await new ClaudeProvider('sk-ant-test').refine('raw text', lowConfItems, config);
    expect(result).toHaveLength(1);
  });

  it('throws PROVIDER_ERROR when API call fails', async () => {
    expect.assertions(2);
    const mockCreate = jest.fn().mockRejectedValue(new Error('Network error'));
    MockedAnthropic.mockImplementation(
      () => ({ messages: { create: mockCreate } }) as unknown as Anthropic,
    );
    try {
      await new ClaudeProvider('sk-ant-test').refine('raw text', lowConfItems, config);
    } catch (e) {
      expect(e).toBeInstanceOf(ScanError);
      expect((e as ScanError).code).toBe('PROVIDER_ERROR');
    }
  });

  it('throws PROVIDER_ERROR when Claude returns invalid JSON', async () => {
    expect.assertions(2);
    setupMock('Here are the corrections...');
    try {
      await new ClaudeProvider('sk-ant-test').refine('raw text', lowConfItems, config);
    } catch (e) {
      expect(e).toBeInstanceOf(ScanError);
      expect((e as ScanError).code).toBe('PROVIDER_ERROR');
    }
  });
});
```

Also add `RawItem` to the type import at the top of the test file:

```ts
import type { RawItem, ScanConfig } from '../../types';
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx jest src/__tests__/providers/ClaudeProvider.test.ts --no-coverage
```

Expected: FAIL — `refine is not a function`

- [ ] **Step 3: Implement `refine()` in `src/providers/ClaudeProvider.ts`**

Update the imports at the top of `src/providers/ClaudeProvider.ts`:

```ts
import Anthropic from '@anthropic-ai/sdk';
import { ScanError } from '../ScanError';
import { buildPrompt, buildRefinementPrompt } from '../prompt';
import type { GroceryProvider, ProviderResult, RawItem, RefinementProvider, ScanConfig } from '../types';
```

Change the class declaration to implement both interfaces:

```ts
export class ClaudeProvider implements GroceryProvider, RefinementProvider {
```

Add `refine()` as a new public method (after `scan()`, before the private helpers):

```ts
async refine(rawText: string, items: RawItem[], config: ScanConfig): Promise<RawItem[]> {
  const prompt = buildRefinementPrompt(rawText, items, config);
  let responseText: string;
  try {
    const response = await this.client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    });
    responseText = response.content.find((c) => c.type === 'text')?.text ?? '';
  } catch (e) {
    throw new ScanError('PROVIDER_ERROR', `Claude API error: ${(e as Error).message}`);
  }
  const clean = responseText.replace(/^```(?:json)?\n?([\s\S]*?)\n?```$/m, '$1').trim();
  try {
    return JSON.parse(clean) as RawItem[];
  } catch {
    throw new ScanError('PROVIDER_ERROR', 'Claude returned invalid JSON for refinement');
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx jest src/__tests__/providers/ClaudeProvider.test.ts --no-coverage
```

Expected: PASS — 11 tests (6 existing + 5 new)

- [ ] **Step 5: Commit**

```bash
git add src/providers/ClaudeProvider.ts src/__tests__/providers/ClaudeProvider.test.ts
git commit -m "feat: implement RefinementProvider on ClaudeProvider"
```

---

## Task 4: Create `ChainedProvider`

**Files:**
- Create: `src/providers/ChainedProvider.ts`
- Create: `src/__tests__/ChainedProvider.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/__tests__/ChainedProvider.test.ts`:

```ts
import { ChainedProvider } from '../providers/ChainedProvider';
import { ScanError } from '../ScanError';
import type { GroceryProvider, ProviderResult, RawItem, RefinementProvider, ScanConfig } from '../types';

const config: ScanConfig = {
  outputLanguage: 'both',
  confidenceThreshold: 0.5,
  categories: ['grains', 'dairy', 'other'],
};

const highConfItem: RawItem = {
  nameDevanagari: 'चावल', nameEnglish: 'Rice', quantity: 2, unit: 'kg', category: 'grains', confidence: 0.99,
};
const lowConfItem: RawItem = {
  nameDevanagari: '???', nameEnglish: 'Unknown', quantity: 1, unit: 'kg', category: 'other', confidence: 0.4,
};
const correctedItem: RawItem = {
  nameDevanagari: 'दाल', nameEnglish: 'Lentils', quantity: 1, unit: 'kg', category: 'other', confidence: 0.95,
};

function makePrimary(items: RawItem[]): GroceryProvider {
  return {
    name: 'primary',
    scan: jest.fn().mockResolvedValue({
      items,
      rawText: 'test raw text',
      scanQuality: 'good',
    } as ProviderResult),
  };
}

function makeRefiner(corrected: RawItem[]): RefinementProvider {
  return { refine: jest.fn().mockResolvedValue(corrected) };
}

describe('ChainedProvider', () => {
  it('has name "chained"', () => {
    const provider = new ChainedProvider({
      primary: makePrimary([highConfItem]),
      refiner: makeRefiner([]),
      refinementThreshold: 0.8,
    });
    expect(provider.name).toBe('chained');
  });

  it('returns primary result unchanged when all items are above threshold', async () => {
    const refiner = makeRefiner([]);
    const provider = new ChainedProvider({
      primary: makePrimary([highConfItem]),
      refiner,
      refinementThreshold: 0.8,
    });
    const result = await provider.scan('base64', 'image/jpeg', config);
    expect(refiner.refine).not.toHaveBeenCalled();
    expect(result.items).toHaveLength(1);
    expect(result.items[0].nameEnglish).toBe('Rice');
  });

  it('calls refiner with only the low-confidence items', async () => {
    const refiner = makeRefiner([correctedItem]);
    const provider = new ChainedProvider({
      primary: makePrimary([highConfItem, lowConfItem]),
      refiner,
      refinementThreshold: 0.8,
    });
    await provider.scan('base64', 'image/jpeg', config);
    expect(refiner.refine).toHaveBeenCalledWith('test raw text', [lowConfItem], config);
  });

  it('merges corrected items back into their original positions', async () => {
    const refiner = makeRefiner([correctedItem]);
    const provider = new ChainedProvider({
      primary: makePrimary([highConfItem, lowConfItem]),
      refiner,
      refinementThreshold: 0.8,
    });
    const result = await provider.scan('base64', 'image/jpeg', config);
    expect(result.items).toHaveLength(2);
    expect(result.items[0].nameEnglish).toBe('Rice');    // high-conf: unchanged
    expect(result.items[1].nameEnglish).toBe('Lentils'); // low-conf: replaced
  });

  it('keeps original item when refiner returns fewer items than sent', async () => {
    const refiner = makeRefiner([]); // Claude returns empty array
    const provider = new ChainedProvider({
      primary: makePrimary([highConfItem, lowConfItem]),
      refiner,
      refinementThreshold: 0.8,
    });
    const result = await provider.scan('base64', 'image/jpeg', config);
    expect(result.items[1].nameEnglish).toBe('Unknown'); // original kept
  });

  it('propagates error when refiner throws', async () => {
    expect.assertions(2);
    const refiner: RefinementProvider = {
      refine: jest.fn().mockRejectedValue(new ScanError('PROVIDER_ERROR', 'Claude failed')),
    };
    const provider = new ChainedProvider({
      primary: makePrimary([lowConfItem]),
      refiner,
      refinementThreshold: 0.8,
    });
    try {
      await provider.scan('base64', 'image/jpeg', config);
    } catch (e) {
      expect(e).toBeInstanceOf(ScanError);
      expect((e as ScanError).code).toBe('PROVIDER_ERROR');
    }
  });

  it('propagates primary error without calling refiner', async () => {
    expect.assertions(3);
    const primary: GroceryProvider = {
      name: 'primary',
      scan: jest.fn().mockRejectedValue(new ScanError('PROVIDER_ERROR', 'Primary failed')),
    };
    const refiner = makeRefiner([]);
    const provider = new ChainedProvider({ primary, refiner, refinementThreshold: 0.8 });
    try {
      await provider.scan('base64', 'image/jpeg', config);
    } catch (e) {
      expect(e).toBeInstanceOf(ScanError);
      expect((e as ScanError).code).toBe('PROVIDER_ERROR');
    }
    expect(refiner.refine).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx jest src/__tests__/ChainedProvider.test.ts --no-coverage
```

Expected: FAIL — `Cannot find module '../providers/ChainedProvider'`

- [ ] **Step 3: Create `src/providers/ChainedProvider.ts`**

```ts
import type { GroceryProvider, ProviderResult, RefinementProvider, ScanConfig } from '../types';

export interface ChainedProviderConfig {
  primary: GroceryProvider;
  refiner: RefinementProvider;
  refinementThreshold: number;
}

export class ChainedProvider implements GroceryProvider {
  name = 'chained';
  private primary: GroceryProvider;
  private refiner: RefinementProvider;
  private refinementThreshold: number;

  constructor(config: ChainedProviderConfig) {
    this.primary = config.primary;
    this.refiner = config.refiner;
    this.refinementThreshold = config.refinementThreshold;
  }

  async scan(base64: string, mimeType: string, config: ScanConfig): Promise<ProviderResult> {
    const result = await this.primary.scan(base64, mimeType, config);

    const lowConfIndices = result.items
      .map((item, i) => ({ item, i }))
      .filter(({ item }) => item.confidence < this.refinementThreshold);

    if (lowConfIndices.length === 0) return result;

    const refined = await this.refiner.refine(
      result.rawText,
      lowConfIndices.map(({ item }) => item),
      config,
    );

    const merged = [...result.items];
    lowConfIndices.forEach(({ i }, refIdx) => {
      if (refined[refIdx]) merged[i] = refined[refIdx];
    });

    return { ...result, items: merged };
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx jest src/__tests__/ChainedProvider.test.ts --no-coverage
```

Expected: PASS — 7 tests

- [ ] **Step 5: Run the full test suite**

```bash
npm test
```

Expected: PASS — all tests across all files

- [ ] **Step 6: Commit**

```bash
git add src/providers/ChainedProvider.ts src/__tests__/ChainedProvider.test.ts
git commit -m "feat: add ChainedProvider"
```

---

## Task 5: Export from `src/index.ts`

**Files:**
- Modify: `src/index.ts`

- [ ] **Step 1: Add exports to `src/index.ts`**

```ts
export { GroceryScanner } from './GroceryScanner';
export { ScanError } from './ScanError';
export { ChainedProvider } from './providers/ChainedProvider';
export type { ChainedProviderConfig } from './providers/ChainedProvider';
export type {
  GroceryItem,
  GroceryList,
  GroceryProvider,
  OutputLanguage,
  ProviderResult,
  RefinementProvider,
  ScanConfig,
  ScanErrorCode,
  ScannerConfig,
} from './types';
```

- [ ] **Step 2: Verify typecheck passes**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/index.ts
git commit -m "feat: export ChainedProvider and RefinementProvider"
```

---

## Task 6: Update `test-scan.ts` for local testing

**Files:**
- Modify: `test-scan.ts`

This script shows Groq-only results first, then chain results, so you can see exactly which items Claude corrected.

- [ ] **Step 1: Rewrite `test-scan.ts`**

```ts
import * as fs from 'fs';
import * as path from 'path';
import { GroqProvider } from './src/providers/GroqProvider';
import { ClaudeProvider } from './src/providers/ClaudeProvider';
import { ChainedProvider } from './src/providers/ChainedProvider';
import { normalize } from './src/normalizer';
import type { ScanConfig } from './src/types';

const IMAGE_PATH      = process.argv[2];
const GROQ_KEY        = process.env.GROQ_API_KEY ?? '';
const ANTHROPIC_KEY   = process.env.ANTHROPIC_API_KEY ?? '';
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
if (!GROQ_KEY) {
  console.error('Set GROQ_API_KEY before running.');
  process.exit(1);
}
if (!ANTHROPIC_KEY) {
  console.error('Set ANTHROPIC_API_KEY before running.');
  process.exit(1);
}

function printItems(items: ReturnType<typeof normalize>['items'], threshold?: number) {
  items.forEach((item, i) => {
    const conf = (item.confidence * 100).toFixed(0);
    const flag = threshold !== undefined && item.confidence < threshold ? '  ⚠️  low' : '';
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

  // ── Step 1: Groq only ──────────────────────────────────────────────
  console.log(`\nScanning: ${IMAGE_PATH}`);
  console.log('Step 1 — Groq Vision (Llama 3.2-11b)...\n');

  const groqResult = await new GroqProvider(GROQ_KEY).scan(base64, mimeType, CONFIG);
  const groqList   = normalize(groqResult, CONFIG);
  const lowCount   = groqList.items.filter(i => i.confidence < REFINEMENT_THRESHOLD).length;

  console.log('── Raw text ──────────────────────────────────');
  console.log(groqList.rawText || '(empty)');
  console.log(`\nScan quality : ${groqList.scanQuality}`);
  console.log(`Items found  : ${groqList.items.length}  (${lowCount} below ${REFINEMENT_THRESHOLD * 100}% threshold)`);
  console.log('\n── Groq results ──────────────────────────────');
  printItems(groqList.items, REFINEMENT_THRESHOLD);

  if (lowCount === 0) {
    console.log('\n✓ All items above threshold — no Claude refinement needed.\n');
    console.log('──────────────────────────────────────────────\n');
    return;
  }

  // ── Step 2: Chain (Groq → Claude) ──────────────────────────────────
  console.log(`\n\nStep 2 — Claude refining ${lowCount} low-confidence item(s)...\n`);

  const chainResult = await new ChainedProvider({
    primary: new GroqProvider(GROQ_KEY),
    refiner: new ClaudeProvider(ANTHROPIC_KEY),
    refinementThreshold: REFINEMENT_THRESHOLD,
  }).scan(base64, mimeType, CONFIG);

  const chainList = normalize(chainResult, CONFIG);

  console.log('── Chain results (after Claude correction) ───');
  printItems(chainList.items);
  console.log('\n──────────────────────────────────────────────\n');
}

run().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
```

- [ ] **Step 2: Set environment variables and run**

```bash
export GROQ_API_KEY=gsk_...
export ANTHROPIC_API_KEY=sk-ant-...
npx ts-node test-scan.ts /path/to/grocery-list.jpg
```

Expected output:
```
Scanning: /path/to/grocery-list.jpg
Step 1 — Groq Vision (Llama 3.2-11b)...

── Raw text ──────────────────────────────────
चावल 2 kg, दाल 1 kg, ??? 500g
...

── Groq results ──────────────────────────────
  1. चावल  /  Rice
     Qty       : 2 kg
     Confidence: 99%

  2. ???  /  Unknown
     Confidence: 40%  ⚠️  low

Step 2 — Claude refining 1 low-confidence item(s)...

── Chain results (after Claude correction) ───
  1. चावल  /  Rice
     Confidence: 99%

  2. नमक  /  Salt
     Confidence: 92%
```

- [ ] **Step 3: Commit**

```bash
git add test-scan.ts
git commit -m "feat: update test-scan.ts to demonstrate ChainedProvider"
```

---

## Self-Review

**Spec coverage:**
- [x] `RefinementProvider` interface → Task 1
- [x] `buildRefinementPrompt` → Task 2
- [x] `ClaudeProvider.refine()` → Task 3
- [x] `ChainedProvider` with merge logic → Task 4
- [x] Public exports → Task 5
- [x] Local test script → Task 6
- [x] All 6 test cases from spec → Task 4, Step 1

**No placeholders:** All steps have complete code.

**Type consistency:** `RawItem`, `RefinementProvider`, `ScanConfig` defined in Task 1/2 and used consistently in Tasks 3–6. `ChainedProviderConfig` defined and used in Task 4/6.
