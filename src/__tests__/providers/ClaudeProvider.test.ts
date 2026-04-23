import Anthropic from '@anthropic-ai/sdk';
import { ClaudeProvider } from '../../providers/ClaudeProvider';
import { ScanError } from '../../ScanError';
import type { ScanConfig } from '../../types';

jest.mock('@anthropic-ai/sdk');

const MockedAnthropic = Anthropic as jest.MockedClass<typeof Anthropic>;

const config: ScanConfig = {
  outputLanguage: 'both',
  confidenceThreshold: 0.99,
  categories: ['dairy', 'grains', 'spices', 'other'],
};

const validResponseJson = JSON.stringify({
  items: [
    { nameDevanagari: 'चावल', nameEnglish: 'Rice', quantity: 2, unit: 'kg', category: 'grains', confidence: 0.99 },
  ],
  rawText: 'चावल 2 kg',
  scanQuality: 'good',
});

function setupMock(responseText: string) {
  const mockCreate = jest.fn().mockResolvedValue({
    content: [{ type: 'text', text: responseText }],
  });
  MockedAnthropic.mockImplementation(
    () => ({ messages: { create: mockCreate } }) as unknown as Anthropic,
  );
  return { mockCreate };
}

describe('ClaudeProvider', () => {
  it('has name claude', () => {
    setupMock(validResponseJson);
    expect(new ClaudeProvider('sk-ant-test').name).toBe('claude');
  });

  it('sends image content block for image MIME types', async () => {
    const { mockCreate } = setupMock(validResponseJson);
    await new ClaudeProvider('sk-ant-test').scan('base64img', 'image/jpeg', config);
    const content = mockCreate.mock.calls[0][0].messages[0].content;
    expect(content).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: 'image' })]),
    );
  });

  it('sends document content block for application/pdf', async () => {
    const { mockCreate } = setupMock(validResponseJson);
    await new ClaudeProvider('sk-ant-test').scan('base64pdf', 'application/pdf', config);
    const content = mockCreate.mock.calls[0][0].messages[0].content;
    expect(content).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: 'document' })]),
    );
  });

  it('returns ProviderResult with parsed items and rawText', async () => {
    setupMock(validResponseJson);
    const result = await new ClaudeProvider('sk-ant-test').scan('base64img', 'image/jpeg', config);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].nameDevanagari).toBe('चावल');
    expect(result.rawText).toBe('चावल 2 kg');
    expect(result.scanQuality).toBe('good');
  });

  it('parses JSON wrapped in markdown code fences', async () => {
    setupMock('```json\n' + validResponseJson + '\n```');
    const result = await new ClaudeProvider('sk-ant-test').scan('base64img', 'image/jpeg', config);
    expect(result.items).toHaveLength(1);
  });

  it('throws PROVIDER_ERROR when API call fails', async () => {
    expect.assertions(2); // one per expect in catch block
    const mockCreate = jest.fn().mockRejectedValue(new Error('Network error'));
    MockedAnthropic.mockImplementation(
      () => ({ messages: { create: mockCreate } }) as unknown as Anthropic,
    );
    try {
      await new ClaudeProvider('sk-ant-test').scan('base64img', 'image/jpeg', config);
    } catch (e) {
      expect(e).toBeInstanceOf(ScanError);
      expect((e as ScanError).code).toBe('PROVIDER_ERROR');
    }
  });

  it('throws PROVIDER_ERROR when Claude returns invalid JSON', async () => {
    expect.assertions(2); // one per expect in catch block
    setupMock('Sorry, I cannot read this image.');
    try {
      await new ClaudeProvider('sk-ant-test').scan('base64img', 'image/jpeg', config);
    } catch (e) {
      expect(e).toBeInstanceOf(ScanError);
      expect((e as ScanError).code).toBe('PROVIDER_ERROR');
    }
  });
});
