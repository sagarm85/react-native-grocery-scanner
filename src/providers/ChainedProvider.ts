import type { ChainLog, GroceryProvider, ItemAudit, ProviderResult, RefinementProvider, ScanConfig } from '../types';

export interface ChainedProviderConfig {
  primary: GroceryProvider;
  refiner: RefinementProvider;
  refinementThreshold: number;
}

// Devanagari consonants mapped to approximate Latin equivalents for phonetic comparison
const DEVANAGARI_CONSONANTS: Record<string, string> = {
  'क': 'k', 'ख': 'k', 'ग': 'g', 'घ': 'g', 'च': 'c', 'छ': 'c', 'ज': 'j', 'झ': 'j',
  'ट': 't', 'ठ': 't', 'ड': 'd', 'ढ': 'd', 'त': 't', 'थ': 't', 'द': 'd', 'ध': 'd',
  'न': 'n', 'ण': 'n', 'प': 'p', 'फ': 'f', 'ब': 'b', 'भ': 'b', 'म': 'm',
  'य': 'y', 'र': 'r', 'ल': 'l', 'व': 'v', 'श': 's', 'ष': 's', 'स': 's', 'ह': 'h',
};

// Returns true if nameDevanagari appears to be a phonetic transliteration of nameEnglish
// rather than actual Hindi vocabulary. High consonant overlap between the two indicates
// the model copied the sound of the English word instead of using the real Hindi term.
function looksLikeTransliteration(nameDevanagari: string, nameEnglish: string): boolean {
  const devaConsonants = new Set<string>();
  for (const char of nameDevanagari) {
    const mapped = DEVANAGARI_CONSONANTS[char];
    if (mapped) devaConsonants.add(mapped);
  }

  // Normalize English: c→k so "capsicum" → {k,p,s,m} which matches Devanagari correctly.
  // This avoids false matches where Devanagari 'च'→'c' coincidentally equals an English 'c'.
  const englishConsonants = new Set(
    nameEnglish.toLowerCase().replace(/c/g, 'k').replace(/[aeiou\s]/g, '').split('').filter(Boolean),
  );

  if (devaConsonants.size === 0 || englishConsonants.size === 0) return false;

  let overlap = 0;
  for (const c of devaConsonants) {
    if (englishConsonants.has(c)) overlap++;
  }

  // ≥4 shared consonants strongly suggests a transliteration
  // (e.g. केपसीकम↔capsicum: k,p,s,m=4; मीन केपसीकम↔green capsicum: m,n,k,p,s=5)
  // Threshold of 4 avoids false positives on native Hindi names that share a few consonants
  // by coincidence (e.g. हरी शिमला मिर्च vs "Green Capsicum" only shares r,s,m=3)
  return overlap >= 4;
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

    const flagged = result.items.map((item, i) => {
      const isLowConf = item.confidence < this.refinementThreshold;
      const isTranslit = looksLikeTransliteration(item.nameDevanagari ?? '', item.nameEnglish ?? '');
      const trigger: 'low_confidence' | 'transliteration' | null =
        isLowConf ? 'low_confidence' : isTranslit ? 'transliteration' : null;
      return { item, i, trigger };
    });

    const toRefine = flagged.filter(({ trigger }) => trigger !== null);

    const chainLog: ChainLog = {
      timestamp: new Date().toISOString(),
      primaryProvider: this.primary.name,
      refinerProvider: 'refiner',
      items: [],
    };

    if (toRefine.length === 0) {
      chainLog.items = flagged.map(({ item }) => ({
        nameEnglish: item.nameEnglish,
        primary: { nameDevanagari: item.nameDevanagari, confidence: item.confidence },
        refinementTrigger: null,
        refined: null,
        final: { nameDevanagari: item.nameDevanagari, confidence: item.confidence },
      }));
      return { ...result, chainLog };
    }

    const refined = await this.refiner.refine(
      result.rawText,
      toRefine.map(({ item }) => item),
      config,
    );

    const merged = [...result.items];
    toRefine.forEach(({ i }, refIdx) => {
      if (refined[refIdx]) merged[i] = refined[refIdx];
    });

    const refinedByOrigIndex = new Map(toRefine.map(({ i }, refIdx) => [i, refined[refIdx]]));
    chainLog.items = flagged.map(({ item, i, trigger }) => {
      const refinedItem = refinedByOrigIndex.get(i);
      const final = refinedItem ?? item;
      return {
        nameEnglish: item.nameEnglish,
        primary: { nameDevanagari: item.nameDevanagari, confidence: item.confidence },
        refinementTrigger: trigger,
        refined: refinedItem
          ? { nameDevanagari: refinedItem.nameDevanagari, confidence: refinedItem.confidence }
          : null,
        final: { nameDevanagari: final.nameDevanagari, confidence: final.confidence },
      } satisfies ItemAudit;
    });

    return { ...result, items: merged, chainLog };
  }
}
