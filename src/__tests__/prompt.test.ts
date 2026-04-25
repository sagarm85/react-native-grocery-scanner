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
