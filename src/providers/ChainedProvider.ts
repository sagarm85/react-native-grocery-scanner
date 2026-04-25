import type { GroceryProvider, ProviderResult, RefinementProvider, ScanConfig } from '../types';

export interface ChainedProviderConfig {
  primary: GroceryProvider;
  refiner: RefinementProvider;
  refinementThreshold: number;
}

export class ChainedProvider implements GroceryProvider {
  name = 'chained';
  private primary: GroceryProvider;
  private refiner: RefinementProvider;
  private refinementThreshold: number;

  constructor(config: ChainedProviderConfig) {
    this.primary = config.primary;
    this.refiner = config.refiner;
    this.refinementThreshold = config.refinementThreshold;
  }

  async scan(base64: string, mimeType: string, config: ScanConfig): Promise<ProviderResult> {
    const result = await this.primary.scan(base64, mimeType, config);

    const lowConfIndices = result.items
      .map((item, i) => ({ item, i }))
      .filter(({ item }) => item.confidence < this.refinementThreshold);

    if (lowConfIndices.length === 0) return result;

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
  }
}
