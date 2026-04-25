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
  day?: string;
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
  day?: string;
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
