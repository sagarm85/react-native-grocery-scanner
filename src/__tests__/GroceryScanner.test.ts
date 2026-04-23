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
