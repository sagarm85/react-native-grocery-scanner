import { buildPrompt, buildRefinementPrompt } from '../prompt';
import type { RawItem, ScanConfig } from '../types';

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

describe('buildRefinementPrompt', () => {
  const rawText = 'चावल 2 kg, दाल 1 kg, ??? 500g';
  const items: RawItem[] = [
    { nameDevanagari: '???', nameEnglish: 'Unknown', quantity: 500, unit: 'g', category: 'other', confidence: 0.3 },
  ];

  it('includes rawText verbatim', () => {
    const prompt = buildRefinementPrompt(rawText, items, config);
    expect(prompt).toContain(rawText);
  });

  it('includes the items as JSON', () => {
    const prompt = buildRefinementPrompt(rawText, items, config);
    expect(prompt).toContain('"confidence"');
    expect(prompt).toContain('0.3');
  });

  it('includes all configured categories', () => {
    const prompt = buildRefinementPrompt(rawText, items, config);
    expect(prompt).toContain('dairy');
    expect(prompt).toContain('grains');
  });

  it('instructs the model to return a JSON array of the same length', () => {
    const prompt = buildRefinementPrompt(rawText, items, config);
    expect(prompt).toContain('JSON array');
    expect(prompt).toContain('same length');
  });

  it('returns a non-empty string over 100 characters', () => {
    const prompt = buildRefinementPrompt(rawText, items, config);
    expect(typeof prompt).toBe('string');
    expect(prompt.length).toBeGreaterThan(100);
  });
});
