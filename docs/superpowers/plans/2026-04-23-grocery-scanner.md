# Grocery Scanner SDK Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `react-native-grocery-scanner`, a React Native npm package that scans handwritten Devanagari grocery lists from images or PDFs using Claude Vision and returns normalized, structured grocery objects.

**Architecture:** `GroceryScanner` orchestrates: format validation + base64 encoding via `imageUtils`, AI call via `ClaudeProvider` (implements `GroceryProvider` interface), confidence threshold check, then field normalization via `normalizer`. Claude handles JSON parsing internally; the normalizer receives a typed `ProviderResult` object. The provider interface is open for future additions without changing the public API.

**Tech Stack:** React Native (TypeScript), `@anthropic-ai/sdk` (Claude `claude-sonnet-4-6` Vision), `react-native-fs` (file I/O, peer dep), Jest + ts-jest (unit testing)

---

## File Map

| File | Responsibility |
|---|---|
| `package.json` | Project manifest and dependencies |
| `tsconfig.json` | TypeScript compiler config |
| `jest.config.js` | Jest + ts-jest configuration |
| `src/types.ts` | All public + internal TypeScript types |
| `src/ScanError.ts` | `ScanError` class with typed error codes |
| `src/prompt.ts` | Claude prompt builder (parameterized by config) |
| `src/normalizer.ts` | `ProviderResult` → `GroceryList` with field filtering + category mapping |
| `src/imageUtils.ts` | File URI → base64, MIME type detection, format validation |
| `src/providers/ProviderInterface.ts` | Re-export of `GroceryProvider` types for custom provider implementors |
| `src/providers/ClaudeProvider.ts` | Claude Vision API implementation (JSON parsing lives here) |
| `src/GroceryScanner.ts` | Main class: orchestrates scan flow, enforces confidence threshold |
| `src/index.ts` | Public API exports |
| `src/__mocks__/react-native-fs.ts` | Jest manual mock for RNFS |
| `src/__tests__/ScanError.test.ts` | ScanError unit tests |
| `src/__tests__/prompt.test.ts` | Prompt builder unit tests |
| `src/__tests__/normalizer.test.ts` | Normalizer unit tests |
| `src/__tests__/imageUtils.test.ts` | Image utility unit tests |
| `src/__tests__/providers/ClaudeProvider.test.ts` | Claude provider tests (mocked SDK) |
| `src/__tests__/GroceryScanner.test.ts` | GroceryScanner integration tests |
| `example/App.tsx` | Minimal demo React Native app |

---

## Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `jest.config.js`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "react-native-grocery-scanner",
  "version": "1.0.0",
  "description": "Scan handwritten Devanagari grocery lists using AI vision",
  "main": "src/index.ts",
  "types": "src/index.ts",
  "scripts": {
    "test": "jest",
    "test:watch": "jest --watch",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.30.0"
  },
  "peerDependencies": {
    "react": ">=18.0.0",
    "react-native": ">=0.72.0",
    "react-native-fs": "^2.20.0"
  },
  "devDependencies": {
    "@types/jest": "^29.5.0",
    "@types/react": "^18.0.0",
    "@types/react-native": "^0.72.0",
    "jest": "^29.5.0",
    "ts-jest": "^29.1.0",
    "typescript": "^5.0.0"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "example"]
}
```

- [ ] **Step 3: Create jest.config.js**

```javascript
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/src/__tests__/**/*.test.ts'],
  moduleNameMapper: {
    'react-native-fs': '<rootDir>/src/__mocks__/react-native-fs.ts',
  },
  clearMocks: true,
};
```

- [ ] **Step 4: Install dependencies**

Run: `npm install`
Expected: `node_modules/` created, no errors

- [ ] **Step 5: Commit**

```bash
git add package.json tsconfig.json jest.config.js
git commit -m "chore: project scaffolding"
```

---

## Task 2: Type Definitions

**Files:**
- Create: `src/types.ts`

- [ ] **Step 1: Create src/types.ts**

```typescript
export type OutputLanguage = 'devanagari' | 'english' | 'both';

export type ScanErrorCode =
  | 'LOW_CONFIDENCE'
  | 'PROVIDER_ERROR'
  | 'INVALID_INPUT'
  | 'UNSUPPORTED_FORMAT';

export interface GroceryItem {
  nameDevanagari?: string;
  nameEnglish?: string;
  quantity: number;
  unit: string;
  category: string;
  confidence: number;
}

export interface GroceryList {
  items: GroceryItem[];
  rawText: string;
  scanQuality: 'good' | 'degraded';
}

export interface RawItem {
  nameDevanagari: string;
  nameEnglish: string;
  quantity: number;
  unit: string;
  category: string;
  confidence: number;
}

export interface ProviderResult {
  items: RawItem[];
  rawText: string;
  scanQuality: 'good' | 'degraded';
}

export interface ScanConfig {
  outputLanguage: OutputLanguage;
  confidenceThreshold: number;
  categories: string[];
}

export interface GroceryProvider {
  name: string;
  scan(base64: string, mimeType: string, config: ScanConfig): Promise<ProviderResult>;
}

export interface ScannerConfig extends ScanConfig {
  provider: 'claude' | GroceryProvider;
  apiKey?: string;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/types.ts
git commit -m "feat: add type definitions"
```

---

## Task 3: ScanError Class (TDD)

**Files:**
- Create: `src/__tests__/ScanError.test.ts`
- Create: `src/ScanError.ts`

- [ ] **Step 1: Write failing tests**

Create `src/__tests__/ScanError.test.ts`:

```typescript
import { ScanError } from '../ScanError';

describe('ScanError', () => {
  it('sets code and message', () => {
    const err = new ScanError('LOW_CONFIDENCE', 'Too blurry');
    expect(err.code).toBe('LOW_CONFIDENCE');
    expect(err.message).toBe('Too blurry');
    expect(err).toBeInstanceOf(Error);
  });

  it('stores confidence when provided', () => {
    const err = new ScanError('LOW_CONFIDENCE', 'Too blurry', { confidence: 0.72 });
    expect(err.confidence).toBe(0.72);
  });

  it('stores rawText when provided', () => {
    const err = new ScanError('LOW_CONFIDENCE', 'Too blurry', { rawText: 'चावल' });
    expect(err.rawText).toBe('चावल');
  });

  it('leaves confidence and rawText undefined when not provided', () => {
    const err = new ScanError('PROVIDER_ERROR', 'API error');
    expect(err.confidence).toBeUndefined();
    expect(err.rawText).toBeUndefined();
  });

  it('has name ScanError', () => {
    const err = new ScanError('INVALID_INPUT', 'Empty image');
    expect(err.name).toBe('ScanError');
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

Run: `npx jest src/__tests__/ScanError.test.ts`
Expected: FAIL — "Cannot find module '../ScanError'"

- [ ] **Step 3: Implement ScanError**

Create `src/ScanError.ts`:

```typescript
import type { ScanErrorCode } from './types';

interface ScanErrorOptions {
  confidence?: number;
  rawText?: string;
}

export class ScanError extends Error {
  code: ScanErrorCode;
  confidence?: number;
  rawText?: string;

  constructor(code: ScanErrorCode, message: string, options?: ScanErrorOptions) {
    super(message);
    this.name = 'ScanError';
    this.code = code;
    this.confidence = options?.confidence;
    this.rawText = options?.rawText;
  }
}
```

- [ ] **Step 4: Run test to confirm it passes**

Run: `npx jest src/__tests__/ScanError.test.ts`
Expected: PASS — 5 tests

- [ ] **Step 5: Commit**

```bash
git add src/__tests__/ScanError.test.ts src/ScanError.ts
git commit -m "feat: add ScanError class"
```

---

## Task 4: Prompt Builder (TDD)

**Files:**
- Create: `src/__tests__/prompt.test.ts`
- Create: `src/prompt.ts`

- [ ] **Step 1: Write failing tests**

Create `src/__tests__/prompt.test.ts`:

```typescript
import { buildPrompt } from '../prompt';
import type { ScanConfig } from '../types';

const config: ScanConfig = {
  outputLanguage: 'both',
  confidenceThreshold: 0.99,
  categories: ['dairy', 'grains', 'spices'],
};

describe('buildPrompt', () => {
  it('includes all configured categories', () => {
    const prompt = buildPrompt(config);
    expect(prompt).toContain('dairy');
    expect(prompt).toContain('grains');
    expect(prompt).toContain('spices');
  });

  it('instructs Claude to return JSON only', () => {
    const prompt = buildPrompt(config);
    expect(prompt).toContain('ONLY valid JSON');
  });

  it('includes confidence field instruction', () => {
    const prompt = buildPrompt(config);
    expect(prompt).toContain('confidence');
  });

  it('mentions Devanagari script', () => {
    const prompt = buildPrompt(config);
    expect(prompt).toContain('Devanagari');
  });

  it('returns a non-empty string over 100 characters', () => {
    const prompt = buildPrompt(config);
    expect(typeof prompt).toBe('string');
    expect(prompt.length).toBeGreaterThan(100);
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

Run: `npx jest src/__tests__/prompt.test.ts`
Expected: FAIL — "Cannot find module '../prompt'"

- [ ] **Step 3: Implement buildPrompt**

Create `src/prompt.ts`:

```typescript
import type { ScanConfig } from './types';

export function buildPrompt(config: ScanConfig): string {
  return `You are an expert at reading handwritten Indian grocery lists written in Devanagari script.

Carefully analyze the provided image or document and extract all grocery items listed.

For each grocery item, extract:
- nameDevanagari: item name exactly as written in Devanagari script
- nameEnglish: English translation of the item name
- quantity: numeric quantity (use 1 if not specified)
- unit: unit of measurement — one of: kg, g, litre, ml, packet, piece, dozen, bunch, box, bottle, can, other
- category: best matching category from this list: ${config.categories.join(', ')}
- confidence: your confidence in reading this item correctly (0.0 to 1.0, where 1.0 = perfectly legible)

Respond with ONLY valid JSON in this exact format, no other text:
{
  "items": [
    {
      "nameDevanagari": "string",
      "nameEnglish": "string",
      "quantity": number,
      "unit": "string",
      "category": "string",
      "confidence": number
    }
  ],
  "rawText": "all text visible in the image, exactly as written",
  "scanQuality": "good or degraded"
}

Rules:
- scanQuality is "degraded" when heavy scratches, significant fading, or damage makes reading difficult
- scanQuality is "good" when handwriting is reasonably legible
- Use confidence below 0.5 for items that are very hard to read
- If no grocery items are visible, return an empty items array with relevant rawText
- If the image is entirely blank, return: { "items": [], "rawText": "", "scanQuality": "good" }`;
}
```

- [ ] **Step 4: Run test to confirm it passes**

Run: `npx jest src/__tests__/prompt.test.ts`
Expected: PASS — 5 tests

- [ ] **Step 5: Commit**

```bash
git add src/__tests__/prompt.test.ts src/prompt.ts
git commit -m "feat: add Claude prompt builder"
```

---

## Task 5: Normalizer (TDD)

**Files:**
- Create: `src/__tests__/normalizer.test.ts`
- Create: `src/normalizer.ts`

The normalizer receives an already-parsed `ProviderResult` (no JSON parsing here), applies `outputLanguage` field filtering, maps unknown categories to `'other'`, and throws `INVALID_INPUT` when both `items` is empty and `rawText` is empty.

- [ ] **Step 1: Write failing tests**

Create `src/__tests__/normalizer.test.ts`:

```typescript
import { normalize } from '../normalizer';
import { ScanError } from '../ScanError';
import type { ProviderResult, ScanConfig } from '../types';

const config: ScanConfig = {
  outputLanguage: 'both',
  confidenceThreshold: 0.99,
  categories: ['dairy', 'grains', 'spices', 'other'],
};

const providerResult: ProviderResult = {
  items: [
    { nameDevanagari: 'चावल', nameEnglish: 'Rice', quantity: 2, unit: 'kg', category: 'grains', confidence: 0.99 },
    { nameDevanagari: 'दूध', nameEnglish: 'Milk', quantity: 1, unit: 'litre', category: 'dairy', confidence: 0.98 },
  ],
  rawText: 'चावल 2 kg\nदूध 1 litre',
  scanQuality: 'good',
};

describe('normalize', () => {
  it('returns both name fields when outputLanguage is both', () => {
    const result = normalize(providerResult, config);
    expect(result.items[0].nameDevanagari).toBe('चावल');
    expect(result.items[0].nameEnglish).toBe('Rice');
  });

  it('omits nameEnglish when outputLanguage is devanagari', () => {
    const result = normalize(providerResult, { ...config, outputLanguage: 'devanagari' });
    expect(result.items[0].nameDevanagari).toBe('चावल');
    expect(result.items[0].nameEnglish).toBeUndefined();
  });

  it('omits nameDevanagari when outputLanguage is english', () => {
    const result = normalize(providerResult, { ...config, outputLanguage: 'english' });
    expect(result.items[0].nameDevanagari).toBeUndefined();
    expect(result.items[0].nameEnglish).toBe('Rice');
  });

  it('maps unknown category to other', () => {
    const result = normalize(
      { ...providerResult, items: [{ ...providerResult.items[0], category: 'beverages' }] },
      config,
    );
    expect(result.items[0].category).toBe('other');
  });

  it('preserves rawText and scanQuality', () => {
    const result = normalize(providerResult, config);
    expect(result.rawText).toBe('चावल 2 kg\nदूध 1 litre');
    expect(result.scanQuality).toBe('good');
  });

  it('throws INVALID_INPUT when items is empty and rawText is empty', () => {
    const empty: ProviderResult = { items: [], rawText: '', scanQuality: 'good' };
    try {
      normalize(empty, config);
      fail('expected ScanError to be thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(ScanError);
      expect((e as ScanError).code).toBe('INVALID_INPUT');
    }
  });

  it('returns empty items list when items is empty but rawText has content', () => {
    const result = normalize({ items: [], rawText: 'blurry', scanQuality: 'degraded' }, config);
    expect(result.items).toHaveLength(0);
    expect(result.rawText).toBe('blurry');
  });

  it('maps all item fields correctly', () => {
    const result = normalize(providerResult, config);
    expect(result.items[0].quantity).toBe(2);
    expect(result.items[0].unit).toBe('kg');
    expect(result.items[0].confidence).toBe(0.99);
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

Run: `npx jest src/__tests__/normalizer.test.ts`
Expected: FAIL — "Cannot find module '../normalizer'"

- [ ] **Step 3: Implement normalizer**

Create `src/normalizer.ts`:

```typescript
import { ScanError } from './ScanError';
import type { GroceryItem, GroceryList, ProviderResult, RawItem, ScanConfig } from './types';

export function normalize(result: ProviderResult, config: ScanConfig): GroceryList {
  if (result.items.length === 0 && !result.rawText) {
    throw new ScanError('INVALID_INPUT', 'Image appears to be blank or contains no readable content');
  }

  return {
    items: result.items.map((raw) => mapItem(raw, config)),
    rawText: result.rawText,
    scanQuality: result.scanQuality,
  };
}

function mapItem(raw: RawItem, config: ScanConfig): GroceryItem {
  const item: GroceryItem = {
    quantity: raw.quantity,
    unit: raw.unit,
    category: config.categories.includes(raw.category) ? raw.category : 'other',
    confidence: raw.confidence,
  };

  if (config.outputLanguage === 'devanagari' || config.outputLanguage === 'both') {
    item.nameDevanagari = raw.nameDevanagari;
  }
  if (config.outputLanguage === 'english' || config.outputLanguage === 'both') {
    item.nameEnglish = raw.nameEnglish;
  }

  return item;
}
```

- [ ] **Step 4: Run test to confirm it passes**

Run: `npx jest src/__tests__/normalizer.test.ts`
Expected: PASS — 8 tests

- [ ] **Step 5: Commit**

```bash
git add src/__tests__/normalizer.test.ts src/normalizer.ts
git commit -m "feat: add response normalizer"
```

---

## Task 6: Image Utilities (TDD)

**Files:**
- Create: `src/__mocks__/react-native-fs.ts`
- Create: `src/__tests__/imageUtils.test.ts`
- Create: `src/imageUtils.ts`

- [ ] **Step 1: Create RNFS mock**

Create `src/__mocks__/react-native-fs.ts`:

```typescript
export default {
  readFile: jest.fn(),
};
```

- [ ] **Step 2: Write failing tests**

Create `src/__tests__/imageUtils.test.ts`:

```typescript
import RNFS from 'react-native-fs';
import { fileToBase64, getMimeType } from '../imageUtils';
import { ScanError } from '../ScanError';

const mockReadFile = RNFS.readFile as jest.MockedFunction<typeof RNFS.readFile>;

describe('getMimeType', () => {
  it.each([
    ['photo.jpg', 'image/jpeg'],
    ['photo.jpeg', 'image/jpeg'],
    ['photo.png', 'image/png'],
    ['photo.webp', 'image/webp'],
    ['photo.heic', 'image/heic'],
    ['list.pdf', 'application/pdf'],
  ])('returns correct MIME type for %s', (filename, expected) => {
    expect(getMimeType(filename)).toBe(expected);
  });

  it('throws UNSUPPORTED_FORMAT for unknown extension', () => {
    try {
      getMimeType('file.gif');
      fail('expected ScanError');
    } catch (e) {
      expect(e).toBeInstanceOf(ScanError);
      expect((e as ScanError).code).toBe('UNSUPPORTED_FORMAT');
    }
  });

  it('is case-insensitive', () => {
    expect(getMimeType('photo.JPG')).toBe('image/jpeg');
    expect(getMimeType('photo.PNG')).toBe('image/png');
  });
});

describe('fileToBase64', () => {
  it('reads file and returns base64 string', async () => {
    mockReadFile.mockResolvedValueOnce('abc123base64');
    const result = await fileToBase64('file:///path/to/image.jpg');
    expect(result).toBe('abc123base64');
    expect(mockReadFile).toHaveBeenCalledWith('file:///path/to/image.jpg', 'base64');
  });

  it('throws PROVIDER_ERROR when file cannot be read', async () => {
    mockReadFile.mockRejectedValueOnce(new Error('File not found'));
    try {
      await fileToBase64('file:///missing.jpg');
      fail('expected ScanError');
    } catch (e) {
      expect(e).toBeInstanceOf(ScanError);
      expect((e as ScanError).code).toBe('PROVIDER_ERROR');
    }
  });
});
```

- [ ] **Step 3: Run test to confirm it fails**

Run: `npx jest src/__tests__/imageUtils.test.ts`
Expected: FAIL — "Cannot find module '../imageUtils'"

- [ ] **Step 4: Implement imageUtils**

Create `src/imageUtils.ts`:

```typescript
import RNFS from 'react-native-fs';
import { ScanError } from './ScanError';

const MIME_MAP: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
  pdf: 'application/pdf',
};

export function getMimeType(uri: string): string {
  const ext = uri.split('.').pop()?.toLowerCase() ?? '';
  const mime = MIME_MAP[ext];
  if (!mime) {
    throw new ScanError(
      'UNSUPPORTED_FORMAT',
      `Unsupported file format: .${ext}. Supported formats: JPEG, PNG, WebP, HEIC, PDF`,
    );
  }
  return mime;
}

export async function fileToBase64(uri: string): Promise<string> {
  try {
    return await RNFS.readFile(uri, 'base64');
  } catch {
    throw new ScanError('PROVIDER_ERROR', `Failed to read file at: ${uri}`);
  }
}
```

- [ ] **Step 5: Run test to confirm it passes**

Run: `npx jest src/__tests__/imageUtils.test.ts`
Expected: PASS — 9 tests

- [ ] **Step 6: Commit**

```bash
git add src/__mocks__/react-native-fs.ts src/__tests__/imageUtils.test.ts src/imageUtils.ts
git commit -m "feat: add image utilities"
```

---

## Task 7: Provider Interface

**Files:**
- Create: `src/providers/ProviderInterface.ts`

No tests — this is a pure TypeScript re-export for consumers who want to implement a custom provider.

- [ ] **Step 1: Create ProviderInterface.ts**

Create `src/providers/ProviderInterface.ts`:

```typescript
export type { GroceryProvider, ProviderResult, ScanConfig } from '../types';
```

- [ ] **Step 2: Commit**

```bash
git add src/providers/ProviderInterface.ts
git commit -m "feat: add provider interface re-export"
```

---

## Task 8: Claude Provider (TDD)

**Files:**
- Create: `src/__tests__/providers/ClaudeProvider.test.ts`
- Create: `src/providers/ClaudeProvider.ts`

Claude Vision is called with `image` content blocks for images and `document` blocks for PDFs. JSON parsing (including stripping markdown code fences) happens inside `ClaudeProvider`, returning a typed `ProviderResult`.

- [ ] **Step 1: Write failing tests**

Create `src/__tests__/providers/ClaudeProvider.test.ts`:

```typescript
import Anthropic from '@anthropic-ai/sdk';
import { ClaudeProvider } from '../../providers/ClaudeProvider';
import { ScanError } from '../../ScanError';
import type { ScanConfig } from '../../types';

jest.mock('@anthropic-ai/sdk');

const MockedAnthropic = Anthropic as jest.MockedClass<typeof Anthropic>;

const config: ScanConfig = {
  outputLanguage: 'both',
  confidenceThreshold: 0.99,
  categories: ['dairy', 'grains', 'spices', 'other'],
};

const validResponseJson = JSON.stringify({
  items: [
    { nameDevanagari: 'चावल', nameEnglish: 'Rice', quantity: 2, unit: 'kg', category: 'grains', confidence: 0.99 },
  ],
  rawText: 'चावल 2 kg',
  scanQuality: 'good',
});

function setupMock(responseText: string) {
  const mockCreate = jest.fn().mockResolvedValue({
    content: [{ type: 'text', text: responseText }],
  });
  MockedAnthropic.mockImplementation(
    () => ({ messages: { create: mockCreate } }) as unknown as Anthropic,
  );
  return { mockCreate };
}

describe('ClaudeProvider', () => {
  it('has name claude', () => {
    setupMock(validResponseJson);
    expect(new ClaudeProvider('sk-ant-test').name).toBe('claude');
  });

  it('sends image content block for image MIME types', async () => {
    const { mockCreate } = setupMock(validResponseJson);
    await new ClaudeProvider('sk-ant-test').scan('base64img', 'image/jpeg', config);
    const content = mockCreate.mock.calls[0][0].messages[0].content;
    expect(content).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: 'image' })]),
    );
  });

  it('sends document content block for application/pdf', async () => {
    const { mockCreate } = setupMock(validResponseJson);
    await new ClaudeProvider('sk-ant-test').scan('base64pdf', 'application/pdf', config);
    const content = mockCreate.mock.calls[0][0].messages[0].content;
    expect(content).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: 'document' })]),
    );
  });

  it('returns ProviderResult with parsed items and rawText', async () => {
    setupMock(validResponseJson);
    const result = await new ClaudeProvider('sk-ant-test').scan('base64img', 'image/jpeg', config);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].nameDevanagari).toBe('चावल');
    expect(result.rawText).toBe('चावल 2 kg');
    expect(result.scanQuality).toBe('good');
  });

  it('parses JSON wrapped in markdown code fences', async () => {
    setupMock('```json\n' + validResponseJson + '\n```');
    const result = await new ClaudeProvider('sk-ant-test').scan('base64img', 'image/jpeg', config);
    expect(result.items).toHaveLength(1);
  });

  it('throws PROVIDER_ERROR when API call fails', async () => {
    const mockCreate = jest.fn().mockRejectedValue(new Error('Network error'));
    MockedAnthropic.mockImplementation(
      () => ({ messages: { create: mockCreate } }) as unknown as Anthropic,
    );
    try {
      await new ClaudeProvider('sk-ant-test').scan('base64img', 'image/jpeg', config);
      fail('expected ScanError');
    } catch (e) {
      expect(e).toBeInstanceOf(ScanError);
      expect((e as ScanError).code).toBe('PROVIDER_ERROR');
    }
  });

  it('throws PROVIDER_ERROR when Claude returns invalid JSON', async () => {
    setupMock('Sorry, I cannot read this image.');
    try {
      await new ClaudeProvider('sk-ant-test').scan('base64img', 'image/jpeg', config);
      fail('expected ScanError');
    } catch (e) {
      expect(e).toBeInstanceOf(ScanError);
      expect((e as ScanError).code).toBe('PROVIDER_ERROR');
    }
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

Run: `npx jest src/__tests__/providers/ClaudeProvider.test.ts`
Expected: FAIL — "Cannot find module '../../providers/ClaudeProvider'"

- [ ] **Step 3: Implement ClaudeProvider**

Create `src/providers/ClaudeProvider.ts`:

```typescript
import Anthropic from '@anthropic-ai/sdk';
import { ScanError } from '../ScanError';
import { buildPrompt } from '../prompt';
import type { GroceryProvider, ProviderResult, RawItem, ScanConfig } from '../types';

export class ClaudeProvider implements GroceryProvider {
  name = 'claude';
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async scan(base64: string, mimeType: string, config: ScanConfig): Promise<ProviderResult> {
    const prompt = buildPrompt(config);
    const content =
      mimeType === 'application/pdf'
        ? this.pdfContent(base64, prompt)
        : this.imageContent(base64, mimeType as Anthropic.Base64ImageSource['media_type'], prompt);

    let responseText: string;
    try {
      const response = await this.client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 2048,
        messages: [{ role: 'user', content }],
      });
      responseText = response.content.find((c) => c.type === 'text')?.text ?? '';
    } catch (e) {
      throw new ScanError('PROVIDER_ERROR', `Claude API error: ${(e as Error).message}`);
    }

    return this.parseResponse(responseText);
  }

  private imageContent(
    base64: string,
    mediaType: Anthropic.Base64ImageSource['media_type'],
    prompt: string,
  ): Anthropic.MessageParam['content'] {
    return [
      { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
      { type: 'text', text: prompt },
    ];
  }

  private pdfContent(base64: string, prompt: string): Anthropic.MessageParam['content'] {
    return [
      {
        type: 'document',
        source: { type: 'base64', media_type: 'application/pdf', data: base64 },
      } as Anthropic.DocumentBlockParam,
      { type: 'text', text: prompt },
    ];
  }

  private parseResponse(text: string): ProviderResult {
    const clean = text.replace(/^```(?:json)?\n?([\s\S]*?)\n?```$/m, '$1').trim();
    try {
      const parsed = JSON.parse(clean) as {
        items: RawItem[];
        rawText: string;
        scanQuality: 'good' | 'degraded';
      };
      return { items: parsed.items, rawText: parsed.rawText, scanQuality: parsed.scanQuality };
    } catch {
      throw new ScanError('PROVIDER_ERROR', 'Claude returned an invalid JSON response');
    }
  }
}
```

- [ ] **Step 4: Run test to confirm it passes**

Run: `npx jest src/__tests__/providers/ClaudeProvider.test.ts`
Expected: PASS — 7 tests

- [ ] **Step 5: Commit**

```bash
git add src/__tests__/providers/ClaudeProvider.test.ts src/providers/ClaudeProvider.ts
git commit -m "feat: add Claude vision provider"
```

---

## Task 9: GroceryScanner Main Class (TDD)

**Files:**
- Create: `src/__tests__/GroceryScanner.test.ts`
- Create: `src/GroceryScanner.ts`

`GroceryScanner`: validates format → base64 → provider.scan() → confidence check → normalize → return `GroceryList`.

- [ ] **Step 1: Write failing tests**

Create `src/__tests__/GroceryScanner.test.ts`:

```typescript
import RNFS from 'react-native-fs';
import { GroceryScanner } from '../GroceryScanner';
import { ScanError } from '../ScanError';
import type { GroceryProvider, ProviderResult, ScannerConfig } from '../types';

const mockReadFile = RNFS.readFile as jest.MockedFunction<typeof RNFS.readFile>;

function makeProvider(overrides: Partial<ProviderResult> = {}): GroceryProvider {
  return {
    name: 'mock',
    scan: jest.fn().mockResolvedValue({
      items: [
        { nameDevanagari: 'चावल', nameEnglish: 'Rice', quantity: 2, unit: 'kg', category: 'grains', confidence: 0.99 },
      ],
      rawText: 'चावल 2 kg',
      scanQuality: 'good',
      ...overrides,
    } as ProviderResult),
  };
}

const baseConfig: Omit<ScannerConfig, 'provider'> = {
  outputLanguage: 'both',
  confidenceThreshold: 0.99,
  categories: ['grains', 'dairy', 'other'],
};

describe('GroceryScanner', () => {
  beforeEach(() => {
    mockReadFile.mockResolvedValue('base64data');
  });

  it('returns a normalized GroceryList on successful scan', async () => {
    const scanner = new GroceryScanner({ ...baseConfig, provider: makeProvider() });
    const result = await scanner.scan('file:///photo.jpg');
    expect(result.items).toHaveLength(1);
    expect(result.items[0].nameDevanagari).toBe('चावल');
    expect(result.items[0].nameEnglish).toBe('Rice');
    expect(result.scanQuality).toBe('good');
  });

  it('throws LOW_CONFIDENCE when min item confidence is below threshold', async () => {
    const provider = makeProvider({
      items: [
        { nameDevanagari: 'चावल', nameEnglish: 'Rice', quantity: 1, unit: 'kg', category: 'grains', confidence: 0.80 },
      ],
    });
    const scanner = new GroceryScanner({ ...baseConfig, provider });
    try {
      await scanner.scan('file:///photo.jpg');
      fail('expected ScanError');
    } catch (e) {
      expect(e).toBeInstanceOf(ScanError);
      expect((e as ScanError).code).toBe('LOW_CONFIDENCE');
      expect((e as ScanError).confidence).toBe(0.80);
      expect((e as ScanError).rawText).toBe('चावल 2 kg');
    }
  });

  it('throws UNSUPPORTED_FORMAT for unsupported file extension', async () => {
    const scanner = new GroceryScanner({ ...baseConfig, provider: makeProvider() });
    try {
      await scanner.scan('file:///photo.gif');
      fail('expected ScanError');
    } catch (e) {
      expect(e).toBeInstanceOf(ScanError);
      expect((e as ScanError).code).toBe('UNSUPPORTED_FORMAT');
    }
  });

  it('passes application/pdf mimeType for .pdf files', async () => {
    const provider = makeProvider();
    const scanner = new GroceryScanner({ ...baseConfig, provider });
    await scanner.scan('file:///list.pdf');
    expect(provider.scan).toHaveBeenCalledWith('base64data', 'application/pdf', expect.any(Object));
  });

  it('passes image/jpeg mimeType for .jpg files', async () => {
    const provider = makeProvider();
    const scanner = new GroceryScanner({ ...baseConfig, provider });
    await scanner.scan('file:///photo.jpg');
    expect(provider.scan).toHaveBeenCalledWith('base64data', 'image/jpeg', expect.any(Object));
  });

  it('throws when provider is "claude" but apiKey is missing', () => {
    expect(
      () => new GroceryScanner({ ...baseConfig, provider: 'claude' }),
    ).toThrow('apiKey is required when using the claude provider');
  });

  it('accepts a custom GroceryProvider instance', async () => {
    const customProvider: GroceryProvider = {
      name: 'custom',
      scan: jest.fn().mockResolvedValue({
        items: [{ nameDevanagari: 'दाल', nameEnglish: 'Lentils', quantity: 1, unit: 'kg', category: 'other', confidence: 0.99 }],
        rawText: 'दाल 1 kg',
        scanQuality: 'good',
      }),
    };
    const scanner = new GroceryScanner({ ...baseConfig, provider: customProvider });
    const result = await scanner.scan('file:///photo.jpg');
    expect(result.items[0].nameEnglish).toBe('Lentils');
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

Run: `npx jest src/__tests__/GroceryScanner.test.ts`
Expected: FAIL — "Cannot find module '../GroceryScanner'"

- [ ] **Step 3: Implement GroceryScanner**

Create `src/GroceryScanner.ts`:

```typescript
import { ScanError } from './ScanError';
import { fileToBase64, getMimeType } from './imageUtils';
import { normalize } from './normalizer';
import { ClaudeProvider } from './providers/ClaudeProvider';
import type { GroceryList, GroceryProvider, ScanConfig, ScannerConfig } from './types';

export class GroceryScanner {
  private provider: GroceryProvider;
  private config: ScanConfig;

  constructor(scannerConfig: ScannerConfig) {
    this.provider = this.resolveProvider(scannerConfig);
    this.config = {
      outputLanguage: scannerConfig.outputLanguage,
      confidenceThreshold: scannerConfig.confidenceThreshold,
      categories: scannerConfig.categories,
    };
  }

  async scan(uri: string): Promise<GroceryList> {
    const mimeType = getMimeType(uri);
    const base64 = await fileToBase64(uri);
    const providerResult = await this.provider.scan(base64, mimeType, this.config);

    if (providerResult.items.length > 0) {
      const minConfidence = Math.min(...providerResult.items.map((i) => i.confidence));
      if (minConfidence < this.config.confidenceThreshold) {
        throw new ScanError(
          'LOW_CONFIDENCE',
          `Scan confidence ${minConfidence.toFixed(2)} is below threshold ${this.config.confidenceThreshold}`,
          { confidence: minConfidence, rawText: providerResult.rawText },
        );
      }
    }

    return normalize(providerResult, this.config);
  }

  private resolveProvider(config: ScannerConfig): GroceryProvider {
    if (config.provider === 'claude') {
      if (!config.apiKey) {
        throw new Error('apiKey is required when using the claude provider');
      }
      return new ClaudeProvider(config.apiKey);
    }
    return config.provider;
  }
}
```

- [ ] **Step 4: Run test to confirm it passes**

Run: `npx jest src/__tests__/GroceryScanner.test.ts`
Expected: PASS — 7 tests

- [ ] **Step 5: Run the full test suite**

Run: `npx jest`
Expected: PASS — all tests across all files

- [ ] **Step 6: Commit**

```bash
git add src/__tests__/GroceryScanner.test.ts src/GroceryScanner.ts
git commit -m "feat: add GroceryScanner main class"
```

---

## Task 10: Public Exports

**Files:**
- Create: `src/index.ts`

- [ ] **Step 1: Create public API surface**

Create `src/index.ts`:

```typescript
export { GroceryScanner } from './GroceryScanner';
export { ScanError } from './ScanError';
export type {
  GroceryItem,
  GroceryList,
  GroceryProvider,
  OutputLanguage,
  ProviderResult,
  ScanConfig,
  ScanErrorCode,
  ScannerConfig,
} from './types';
```

- [ ] **Step 2: Verify TypeScript compiles with no errors**

Run: `npx tsc --noEmit`
Expected: No output (zero errors)

- [ ] **Step 3: Commit**

```bash
git add src/index.ts
git commit -m "feat: add public API exports"
```

---

## Task 11: Example App

**Files:**
- Create: `example/App.tsx`

- [ ] **Step 1: Create minimal demo app**

Create `example/App.tsx`:

```tsx
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Button,
  FlatList,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { launchImageLibrary } from 'react-native-image-picker';
import { GroceryScanner, ScanError } from 'react-native-grocery-scanner';
import type { GroceryItem } from 'react-native-grocery-scanner';

const scanner = new GroceryScanner({
  provider: 'claude',
  apiKey: process.env.ANTHROPIC_API_KEY ?? '',
  outputLanguage: 'both',
  confidenceThreshold: 0.99,
  categories: ['dairy', 'grains', 'spices', 'oil', 'pulses', 'snacks', 'other'],
});

export default function App() {
  const [items, setItems] = useState<GroceryItem[]>([]);
  const [loading, setLoading] = useState(false);

  async function handlePickImage() {
    const result = await launchImageLibrary({ mediaType: 'photo' });
    const uri = result.assets?.[0]?.uri;
    if (!uri) return;

    setLoading(true);
    try {
      const list = await scanner.scan(uri);
      setItems(list.items);
    } catch (e) {
      if (e instanceof ScanError && e.code === 'LOW_CONFIDENCE') {
        Alert.alert(
          'Scan quality too low',
          `Confidence: ${((e.confidence ?? 0) * 100).toFixed(0)}%.\nPlease retake the photo in better lighting.\n\nPartial read:\n${e.rawText ?? ''}`,
        );
      } else if (e instanceof ScanError) {
        Alert.alert('Scan failed', e.message);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Grocery Scanner</Text>
      <Button title="Pick Grocery List Image" onPress={handlePickImage} />
      {loading && <ActivityIndicator style={styles.loader} />}
      <FlatList
        data={items}
        keyExtractor={(_, i) => String(i)}
        renderItem={({ item }) => (
          <View style={styles.item}>
            <Text style={styles.name}>
              {item.nameDevanagari} / {item.nameEnglish}
            </Text>
            <Text style={styles.detail}>
              {item.quantity} {item.unit} · {item.category}
            </Text>
            <Text style={styles.confidence}>
              {(item.confidence * 100).toFixed(0)}% confident
            </Text>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 16 },
  loader: { marginTop: 16 },
  item: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#eee' },
  name: { fontSize: 18, fontWeight: '600' },
  detail: { fontSize: 14, color: '#555', marginTop: 2 },
  confidence: { fontSize: 12, color: '#999', marginTop: 2 },
});
```

- [ ] **Step 2: Commit**

```bash
git add example/App.tsx
git commit -m "feat: add example demo app"
```

---

## Spec Coverage Check

| Spec Requirement | Covered By |
|---|---|
| React Native SDK | Task 1 (package.json) |
| Devanagari handwriting OCR | Task 4 (prompt.ts) |
| JPEG, PNG, WebP, HEIC, PDF input | Task 6 (imageUtils.ts) |
| Claude Vision as default provider | Task 8 (ClaudeProvider.ts) |
| Pluggable provider interface | Task 7 (ProviderInterface.ts) + types.ts |
| GroceryItem: nameDevanagari, nameEnglish, quantity, unit, category, confidence | Task 2 (types.ts) |
| outputLanguage config (devanagari/english/both) | Task 5 (normalizer.ts) |
| categories config | Task 4 (prompt.ts) + Task 5 |
| confidenceThreshold config | Task 9 (GroceryScanner.ts) |
| apiKey config | Task 9 (GroceryScanner.ts) |
| LOW_CONFIDENCE error with confidence + rawText | Task 9 |
| PROVIDER_ERROR | Task 8 (ClaudeProvider.ts) |
| INVALID_INPUT (blank image) | Task 5 (normalizer.ts) |
| UNSUPPORTED_FORMAT | Task 6 (imageUtils.ts) |
| GroceryList: items, rawText, scanQuality | Task 2 (types.ts) |
| Example demo app | Task 11 |
| Unit tests | Tasks 3–9 |
| Mocked provider tests | Task 8 |
