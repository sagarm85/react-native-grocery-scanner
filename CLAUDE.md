# grocery-scanner

React Native TypeScript library for scanning handwritten Devanagari grocery lists using AI vision models.

## Project purpose

Scans photos/PDFs of handwritten Hindi grocery lists and returns structured `GroceryItem[]` with Devanagari names, English translations, quantities, units, categories, and confidence scores.

## Architecture

```
GroceryScanner (entry point)
  └── GroceryProvider (interface)
        ├── ClaudeProvider      — primary + refiner (Anthropic SDK)
        ├── OpenAIProvider      — primary only (raw fetch, gpt-4o default)
        ├── GeminiProvider      — primary only
        ├── GroqProvider        — primary only
        └── ChainedProvider     — wraps primary + refiner for 99% accuracy
```

**ChainedProvider** is the recommended production provider. It runs a primary scan then flags items below `refinementThreshold` or with phonetic transliterations (e.g. केपसीकम instead of शिमला मिर्च), and passes those to a `RefinementProvider` (typically `ClaudeProvider`) for correction.

## Key files

- `src/types.ts` — all shared types (`GroceryItem`, `GroceryProvider`, `RefinementProvider`, `ChainedLog`, etc.)
- `src/GroceryScanner.ts` — public entry point; resolves provider, calls `normalize()`
- `src/prompt.ts` — `buildPrompt()` and `buildRefinementPrompt()`; the source of truth for what the AI is asked to do
- `src/normalizer.ts` — maps `RawItem[]` → `GroceryItem[]` based on `outputLanguage` config
- `src/providers/ChainedProvider.ts` — transliteration detection + two-phase refinement logic

## Commands

```bash
npm test            # run all tests (Jest + ts-jest)
npm run test:watch  # watch mode
npm run typecheck   # tsc --noEmit
```

Tests live in `src/__tests__/`. The mock for `react-native-fs` is at `src/__mocks__/react-native-fs.ts`.

## Development rules

- **Never mock the database / real API calls in integration tests** — unit tests mock providers, but integration tests should hit real APIs.
- **Do not add transliteration fallbacks** — the whole point of `ChainedProvider` is to eliminate phonetic transliterations. Any fix that accepts a transliteration as "good enough" is wrong.
- **`nameDevanagari` must be correct standard Hindi**, never a phonetic copy of the English (e.g. केपसीकम is always wrong; शिमला मिर्च is correct for capsicum).
- **Prompt changes require prompt tests** — `src/__tests__/prompt.test.ts` guards the prompt contract.
- **`ChainedProvider` is the accuracy target** — the goal is ≥ 99% Devanagari name accuracy. Confidence threshold default is `0.8`; transliteration detection fires at ≥ 4 shared consonants.

## Provider interface contract

```ts
interface GroceryProvider {
  name: string;
  scan(base64: string, mimeType: string, config: ScanConfig): Promise<ProviderResult>;
}

interface RefinementProvider {
  refine(rawText: string, items: RawItem[], config: ScanConfig): Promise<RawItem[]>;
}
```

All providers parse AI responses from JSON, strip optional code fences, and throw `ScanError` on failure.

## Environment variables

API keys are passed into provider constructors — not read from `process.env` inside the library. Callers supply them:

```ts
new ClaudeProvider(process.env.ANTHROPIC_API_KEY!)
new OpenAIProvider(process.env.OPENAI_API_KEY!)
```
