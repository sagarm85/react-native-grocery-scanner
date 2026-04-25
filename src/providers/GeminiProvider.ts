  import { GoogleGenerativeAI } from '@google/generative-ai';
  import { buildPrompt } from '../prompt';
  import type { GroceryProvider, ProviderResult, RawItem, ScanConfig } from '../types';
  import { ScanError } from '../ScanError';

  export class GeminiProvider implements GroceryProvider {
    name = 'gemini';
    private client: GoogleGenerativeAI;

    constructor(apiKey: string) {
      this.client = new GoogleGenerativeAI(apiKey);
    }

    async scan(base64: string, mimeType: string, config: ScanConfig): Promise<ProviderResult> {
      const model  = this.client.getGenerativeModel({ model: 'gemini-2.0-flash' });
      const prompt = buildPrompt(config);

      try {
        const result = await model.generateContent([
          { inlineData: { data: base64, mimeType } },
          prompt,
        ]);
        const text = result.response.text();
        return this.parseResponse(text);
      } catch (e) {
        throw new ScanError('PROVIDER_ERROR', `Gemini API error: ${(e as Error).message}`);
      }
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
        throw new ScanError('PROVIDER_ERROR', 'Gemini returned invalid JSON');
      }
    }
  }
