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

  async scanPdf(uri: string): Promise<GroceryList> {
    // Validate it's actually a PDF
    const mimeType = getMimeType(uri);
    if (mimeType !== 'application/pdf') {
      throw new ScanError('UNSUPPORTED_FORMAT', `scanPdf() requires a PDF file, got: ${mimeType}`);
    }
    return this.scan(uri);
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
