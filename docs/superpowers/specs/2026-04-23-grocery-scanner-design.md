# Grocery Scanner SDK — Design Spec
**Date:** 2026-04-23  
**Status:** Approved

---

## Overview

`react-native-grocery-scanner` is a React Native npm package that scans handwritten Indian grocery lists from images or PDFs (Devanagari script) and returns normalized, structured grocery objects. It is designed to be embedded in any mobile app (iOS and Android) with minimal setup.

Key constraints:
- Devanagari handwriting, including bad handwriting, scratches, creases, and faded ink
- Default confidence threshold of 99% — scans below this halt with a structured error
- Claude Vision is the built-in AI provider; the provider interface is open for future additions (Google Vision, AWS Textract, etc.)
- Output is configurable: Devanagari, English, or both

---

## Architecture

The SDK has three layers:

```
┌─────────────────────────────────────────┐
│            Mobile App (consumer)         │
└──────────────────┬──────────────────────┘
                   │ calls
┌──────────────────▼──────────────────────┐
│           GroceryScanner SDK            │
│  ┌─────────────┐   ┌─────────────────┐  │
│  │  Config     │   │  Scanner API    │  │  ← public surface
│  └─────────────┘   └────────┬────────┘  │
│  ┌──────────────────────────▼────────┐  │
│  │       Provider Interface          │  │  ← abstraction layer
│  └──────────────┬────────────────────┘  │
│           ClaudeProvider                │  ← default built-in provider
└─────────────────────────────────────────┘
                   │ returns
┌──────────────────▼──────────────────────┐
│         GroceryList (normalized JSON)    │
└─────────────────────────────────────────┘
```

The public API (`GroceryScanner`) is fully decoupled from the provider. Switching providers in the future requires no changes to consumer code.

---

## Configuration & Public API

### Initialization

```typescript
import { GroceryScanner } from 'react-native-grocery-scanner';

const scanner = new GroceryScanner({
  provider: 'claude',           // 'claude' | CustomProvider instance
  apiKey: 'sk-ant-...',
  outputLanguage: 'both',       // 'devanagari' | 'english' | 'both'
  confidenceThreshold: 0.99,    // 0.0–1.0, default 0.99
  categories: [                 // customizable list
    'dairy', 'grains', 'spices', 'oil', 'pulses', 'snacks', 'other'
  ],
});
```

### Scanning

```typescript
const result = await scanner.scan(imageUri);     // image URI from camera/file picker
const result = await scanner.scanPdf(pdfUri);    // PDF URI, scanned page by page
```

Supported image formats: JPEG, PNG, WebP, HEIC. PDF must be single or multi-page with at least one handwritten page.

### Output Types

```typescript
interface GroceryItem {
  nameDevanagari?: string;  // e.g. "चावल"   — present when outputLanguage is 'devanagari' or 'both'
  nameEnglish?: string;     // e.g. "Rice"    — present when outputLanguage is 'english' or 'both'
  quantity: number;         // e.g. 2
  unit: string;             // e.g. "kg" | "litre" | "packet" | "piece"
  category: string;         // one of the configured categories
  confidence: number;       // per-item confidence 0.0–1.0
}

interface GroceryList {
  items: GroceryItem[];
  rawText: string;           // full OCR'd text, for debugging or fallback UI
  scanQuality: 'good' | 'degraded';  // overall image quality assessment
}
```

### Error Handling

```typescript
class ScanError extends Error {
  code: 'LOW_CONFIDENCE' | 'PROVIDER_ERROR' | 'INVALID_INPUT' | 'UNSUPPORTED_FORMAT';
  confidence?: number;  // present when code === 'LOW_CONFIDENCE'
  rawText?: string;     // partial OCR output, for manual-entry fallback UI
}
```

| Error Code | Trigger |
|---|---|
| `LOW_CONFIDENCE` | Min item confidence is below `confidenceThreshold` |
| `PROVIDER_ERROR` | Claude API unreachable or returned a 5xx error |
| `UNSUPPORTED_FORMAT` | Input file is not a recognized image or PDF |
| `INVALID_INPUT` | Image is blank or empty |

Consumer usage:

```typescript
try {
  const list = await scanner.scan(uri);
  // use list.items
} catch (e) {
  if (e.code === 'LOW_CONFIDENCE') {
    // show manual entry fallback using e.rawText
  }
}
```

---

## Provider Interface

Any provider — built-in or custom — must implement:

```typescript
interface GroceryProvider {
  name: string;
  scan(imageBase64: string, config: ScanConfig): Promise<ProviderResult>;
}

interface ProviderResult {
  items: RawItem[];       // un-normalized items as returned by AI; each item carries its own confidence score
  rawText: string;
}
// The SDK derives the overall confidence as min(items[i].confidence) for the threshold check.
```

Custom provider example:

```typescript
class MyCustomProvider implements GroceryProvider {
  name = 'my-provider';
  async scan(imageBase64: string, config: ScanConfig): Promise<ProviderResult> {
    // call any AI API here
  }
}

const scanner = new GroceryScanner({ provider: new MyCustomProvider(), ... });
```

---

## Claude Provider Implementation

A single Claude Vision API call per image with a structured prompt that instructs Claude to:
1. Read all handwritten lines in Devanagari
2. Parse each line into: item name (Devanagari + English as configured), quantity, unit
3. Return structured JSON with per-item confidence scores
4. Assess overall scan quality as `good` or `degraded`

The prompt is parameterized with `categories` and `outputLanguage` from config so the response always conforms to the expected schema. No separate translation call is needed — Claude handles Devanagari → English inline.

---

## Data Flow

### Happy Path

```
App calls scan(imageUri)
  → SDK converts image to base64
  → ClaudeProvider sends to Claude Vision API with structured prompt
  → Claude returns JSON: items[] + per-item confidence + rawText + scanQuality
  → SDK checks: min(item.confidence) >= confidenceThreshold?
      YES → normalize items → return GroceryList
      NO  → throw ScanError({ code: 'LOW_CONFIDENCE', confidence, rawText })
```

### PDF Handling

PDFs are converted page-by-page to images. Each page is scanned independently and results are merged into a single `GroceryList`. If any page falls below the confidence threshold, the entire scan halts and returns `LOW_CONFIDENCE`.

---

## Package Structure

```
react-native-grocery-scanner/
├── src/
│   ├── index.ts                  # public exports
│   ├── GroceryScanner.ts         # main class — orchestrates the scan flow
│   ├── types.ts                  # all public + internal TypeScript types
│   ├── providers/
│   │   ├── ProviderInterface.ts  # GroceryProvider interface
│   │   └── ClaudeProvider.ts     # Claude Vision implementation
│   ├── normalizer.ts             # maps raw AI output → GroceryItem[]
│   ├── imageUtils.ts             # base64 conversion, PDF→image per page
│   └── prompt.ts                 # Claude prompt template (parameterized by config)
├── example/                      # minimal React Native demo app
│   └── App.tsx                   # camera capture → scan → display list
├── package.json
└── README.md
```

---

## Testing Strategy

- **Unit tests** (Jest): normalizer logic, config validation, `ScanError` construction — no network calls
- **Provider tests** (Jest + mocked Claude responses): prompt construction, response parsing, confidence threshold gating
- **Fixture-based integration tests**: sample handwritten Devanagari images (good quality, degraded, illegible) with expected outputs — run against the real Claude API in CI to catch regressions
- **Example app**: minimal demo app ships in the repo for manual integration testing during development
