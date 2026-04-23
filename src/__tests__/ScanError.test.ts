import { ScanError } from '../ScanError';

describe('ScanError', () => {
  it('sets code and message', () => {
    const err = new ScanError('LOW_CONFIDENCE', 'Too blurry');
    expect(err.code).toBe('LOW_CONFIDENCE');
    expect(err.message).toBe('Too blurry');
    expect(err).toBeInstanceOf(Error);
  });

  it('stores confidence when provided', () => {
    const err = new ScanError('LOW_CONFIDENCE', 'Too blurry', { confidence: 0.72 });
    expect(err.confidence).toBe(0.72);
  });

  it('stores rawText when provided', () => {
    const err = new ScanError('LOW_CONFIDENCE', 'Too blurry', { rawText: 'चावल' });
    expect(err.rawText).toBe('चावल');
  });

  it('leaves confidence and rawText undefined when not provided', () => {
    const err = new ScanError('PROVIDER_ERROR', 'API error');
    expect(err.confidence).toBeUndefined();
    expect(err.rawText).toBeUndefined();
  });

  it('has name ScanError', () => {
    const err = new ScanError('INVALID_INPUT', 'Empty image');
    expect(err.name).toBe('ScanError');
  });
});
