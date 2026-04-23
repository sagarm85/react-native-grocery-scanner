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
