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
  if (raw.day) {
    item.day = raw.day;
  }

  return item;
}
