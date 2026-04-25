# ChainedProvider Design

**Date:** 2026-04-25
**Status:** Approved

## Summary

Add a `ChainedProvider` that runs a primary AI provider (e.g. Groq/OpenAI) for image scanning, then passes any low-confidence items to Claude for text-based correction. The caller receives one merged `GroceryList` — the chaining is an implementation detail.

## Motivation

Image OCR is more accurate with OpenAI-compatible models (Groq). Claude is better at reasoning over ambiguous text. Combining both gives the best of each: fast, accurate image decoding first, then targeted semantic correction for the items the first model was unsure about.

## Architecture

Three additions; nothing existing changes:

1. **`RefinementProvider` interface** (`src/types.ts`) — a single method for text-based item correction.
2. **`ClaudeProvider.refine()`** — implements `RefinementProvider`; calls Claude with a text-only prompt, no image.
3. **`ChainedProvider`** (`src/providers/ChainedProvider.ts`) — implements `GroceryProvider`; orchestrates primary scan + conditional refinement + merge.

`GroceryScanner`, `ScannerConfig`, and all existing providers are unchanged.

## Data Flow

```
scanner.scan(uri)
  │
  ├─ fileToBase64(uri) → base64
  │
  └─ ChainedProvider.scan(base64, mimeType, config)
       │
       ├─ primary.scan(base64, mimeType, config)
       │     └─ ProviderResult { items, rawText, scanQuality }
       │
       ├─ items.filter(i => i.confidence < refinementThreshold)
       │     ├─ none low → return result as-is (no Claude call)
       │     └─ some low → continue
       │
       ├─ refiner.refine(rawText, lowConfItems, config)
       │     └─ Claude text-only call → corrected RawItem[]
       │
       ├─ merge: replace low-conf slots with corrected items (by position)
       │
       └─ return merged ProviderResult
            │
            └─ GroceryScanner normalizes → GroceryList
                 └─ if any item still < confidenceThreshold → throw LOW_CONFIDENCE
```

## Two Thresholds

| Threshold | Location | Role |
|---|---|---|
| `refinementThreshold` | `ChainedProviderConfig` | Items below this are sent to Claude for correction |
| `confidenceThreshold` | `ScannerConfig` | If the final merged result has any item below this, throw `LOW_CONFIDENCE` |

Setting `refinementThreshold` higher than `confidenceThreshold` gives Claude a chance to correct borderline items before the scanner rejects the result.

## Types

### `src/types.ts` additions

```ts
export interface RefinementProvider {
  refine(rawText: string, items: RawItem[], config: ScanConfig): Promise<RawItem[]>;
}
```

### `src/providers/ChainedProvider.ts`

```ts
export interface ChainedProviderConfig {
  primary: GroceryProvider;
  refiner: RefinementProvider;
  refinementThreshold: number; // 0.0–1.0
}
```

## Usage

```ts
import { GroceryScanner, ChainedProvider } from 'react-native-grocery-scanner';
import { GroqProvider, ClaudeProvider } from 'react-native-grocery-scanner/providers';

const scanner = new GroceryScanner({
  provider: new ChainedProvider({
    primary: new GroqProvider(process.env.GROQ_API_KEY),
    refiner: new ClaudeProvider(process.env.ANTHROPIC_API_KEY),
    refinementThreshold: 0.85,
  }),
  outputLanguage: 'both',
  confidenceThreshold: 0.7,
  categories: ['dairy', 'grains', 'spices', 'oil', 'pulses', 'snacks', 'other'],
});

const list = await scanner.scan(imageUri);
```

## `ChainedProvider` Merge Logic

Items are matched by position. The refiner receives only the low-confidence items (in their original order); it returns a same-length corrected array. `ChainedProvider` replaces each low-confidence slot in the original array with the corresponding corrected item:

```ts
const lowConfIndices = result.items
  .map((item, i) => ({ item, i }))
  .filter(({ item }) => item.confidence < this.refinementThreshold);

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
```

## Refinement Prompt

`buildRefinementPrompt(rawText, items, config)` in `src/prompt.ts` — text-only, no image:

```
You are correcting specific items from a handwritten Devanagari grocery list.

The full text extracted from the image is:
"<rawText>"

The following items were read with low confidence and need correction.
Using the raw text above as context, correct each item.

Return ONLY a JSON array of the same length as the input, in the same order.
Each element must follow this schema:
{
  "nameDevanagari": string,
  "nameEnglish": string,
  "quantity": number,
  "unit": string,
  "category": string (one of: <categories>),
  "confidence": number,
  "day"?: string
}
```

Claude receives the low-confidence items as a JSON array in the message body.

## Error Handling

| Scenario | Behaviour |
|---|---|
| `primary.scan()` throws | Propagates immediately; refiner never called |
| `refiner.refine()` throws | Propagates as-is (caller handles `ScanError`) |
| Claude returns fewer corrected items than sent | Missing slots keep original low-confidence items |
| Claude returns malformed JSON | `ClaudeProvider.refine()` throws `ScanError('PROVIDER_ERROR', ...)` |

## Files Changed

| File | Change |
|---|---|
| `src/types.ts` | Add `RefinementProvider` interface |
| `src/providers/ClaudeProvider.ts` | Implement `RefinementProvider` (`refine()` method) |
| `src/providers/ChainedProvider.ts` | New file — `ChainedProvider` + `ChainedProviderConfig` |
| `src/prompt.ts` | Add `buildRefinementPrompt()` |
| `src/index.ts` | Export `ChainedProvider` and `RefinementProvider` |
| `src/__tests__/ChainedProvider.test.ts` | New test file |

## Test Cases

| Scenario | Expected |
|---|---|
| All items above `refinementThreshold` | Refiner never called; primary result returned unchanged |
| Some items below threshold | Refiner called with only those items; corrected slots merged back |
| All items below threshold | Refiner called with all items; full replacement |
| Refiner returns fewer items than sent | Missing slots keep original low-confidence items |
| Refiner throws `PROVIDER_ERROR` | Error propagates to caller |
| Primary throws | Error propagates; refiner never called |
