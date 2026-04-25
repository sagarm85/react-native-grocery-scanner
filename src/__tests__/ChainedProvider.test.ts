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
    const refiner = makeRefiner([]);
    const provider = new ChainedProvider({
      primary: makePrimary([highConfItem, lowConfItem]),
      refiner,
      refinementThreshold: 0.8,
    });
    const result = await provider.scan('base64', 'image/jpeg', config);
    expect(result.items[1].nameEnglish).toBe('Unknown');
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

  it('sends high-confidence items to refiner when nameDevanagari is a transliteration', async () => {
    const transliteratedItem: RawItem = {
      nameDevanagari: 'केपसीकम', nameEnglish: 'Capsicum', quantity: 1, unit: 'piece', category: 'vegetables', confidence: 0.85,
    };
    const corrected: RawItem = {
      nameDevanagari: 'शिमला मिर्च', nameEnglish: 'Capsicum', quantity: 1, unit: 'piece', category: 'vegetables', confidence: 0.95,
    };
    const refiner = makeRefiner([corrected]);
    const provider = new ChainedProvider({
      primary: makePrimary([transliteratedItem]),
      refiner,
      refinementThreshold: 0.8,
    });
    const result = await provider.scan('base64', 'image/jpeg', config);
    expect(refiner.refine).toHaveBeenCalledWith('test raw text', [transliteratedItem], config);
    expect(result.items[0].nameDevanagari).toBe('शिमला मिर्च');
  });

  it('does not send to refiner when nameDevanagari is correct native Hindi', async () => {
    const nativeItem: RawItem = {
      nameDevanagari: 'हरी शिमला मिर्च', nameEnglish: 'Green Capsicum', quantity: 1, unit: 'piece', category: 'vegetables', confidence: 0.9,
    };
    const refiner = makeRefiner([]);
    const provider = new ChainedProvider({
      primary: makePrimary([nativeItem]),
      refiner,
      refinementThreshold: 0.8,
    });
    await provider.scan('base64', 'image/jpeg', config);
    expect(refiner.refine).not.toHaveBeenCalled();
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
