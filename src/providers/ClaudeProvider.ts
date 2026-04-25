import Anthropic from '@anthropic-ai/sdk';
import { ScanError } from '../ScanError';
import { buildPrompt, buildRefinementPrompt } from '../prompt';
import type { GroceryProvider, ProviderResult, RawItem, RefinementProvider, ScanConfig } from '../types';

type ImageMediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';

export class ClaudeProvider implements GroceryProvider, RefinementProvider {
  name = 'claude';
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async scan(base64: string, mimeType: string, config: ScanConfig): Promise<ProviderResult> {
    const prompt = buildPrompt(config);
    const content =
      mimeType === 'application/pdf'
        ? this.pdfContent(base64, prompt)
        : this.imageContent(base64, mimeType as ImageMediaType, prompt);

    let responseText: string;
    try {
      const response = await this.client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 2048,
        messages: [{ role: 'user', content }],
      });
      responseText = response.content.find((c) => c.type === 'text')?.text ?? '';
    } catch (e) {
      throw new ScanError('PROVIDER_ERROR', `Claude API error: ${(e as Error).message}`);
    }

    return this.parseResponse(responseText);
  }

  async refine(rawText: string, items: RawItem[], config: ScanConfig): Promise<RawItem[]> {
    const prompt = buildRefinementPrompt(rawText, items, config);
    let responseText: string;
    try {
      const response = await this.client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      });
      responseText = response.content.find((c) => c.type === 'text')?.text ?? '';
    } catch (e) {
      throw new ScanError('PROVIDER_ERROR', `Claude API error: ${(e as Error).message}`);
    }
    const clean = responseText.replace(/^```(?:json)?\n?([\s\S]*?)\n?```$/m, '$1').trim();
    try {
      return JSON.parse(clean) as RawItem[];
    } catch {
      throw new ScanError('PROVIDER_ERROR', 'Claude returned invalid JSON for refinement');
    }
  }

  private imageContent(
    base64: string,
    mediaType: ImageMediaType,
    prompt: string,
  ): Anthropic.MessageParam['content'] {
    return [
      { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
      { type: 'text', text: prompt },
    ];
  }

  private pdfContent(base64: string, prompt: string): Anthropic.MessageParam['content'] {
    return [
      // Claude API supports PDF documents; SDK types may lag behind API capabilities
      { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } } as any,
      { type: 'text', text: prompt },
    ];
  }

  private parseResponse(text: string): ProviderResult {
    const clean = text.replace(/^```(?:json)?\n?([\s\S]*?)\n?```$/m, '$1').trim();
    try {
      const parsed = JSON.parse(clean) as {
        items: RawItem[];
        rawText: string;
        scanQuality: 'good' | 'degraded';
      };
      return { items: parsed.items, rawText: parsed.rawText, scanQuality: parsed.scanQuality };
    } catch {
      throw new ScanError('PROVIDER_ERROR', 'Claude returned an invalid JSON response');
    }
  }
}
