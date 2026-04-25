import { ScanError } from '../ScanError';
import { buildPrompt } from '../prompt';
import type { GroceryProvider, ProviderResult, RawItem, ScanConfig } from '../types';

export class GroqProvider implements GroceryProvider {
  name = 'groq';
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async scan(base64: string, mimeType: string, config: ScanConfig): Promise<ProviderResult> {
    const prompt = buildPrompt(config);

    let response: Response;
    try {
      response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'llama-3.2-11b-vision-preview',
          messages: [
            {
              role: 'user',
              content: [
                { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64}` } },
                { type: 'text', text: prompt },
              ],
            },
          ],
          max_tokens: 2048,
        }),
      });
    } catch (e) {
      throw new ScanError('PROVIDER_ERROR', `Groq API error: ${(e as Error).message}`);
    }

    if (!response.ok) {
      const err = await response.text();
      throw new ScanError('PROVIDER_ERROR', `Groq API error ${response.status}: ${err}`);
    }

    const data = await response.json() as { choices: { message: { content: string } }[] };
    const text = data.choices[0]?.message?.content ?? '';
    return this.parseResponse(text);
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
      throw new ScanError('PROVIDER_ERROR', 'Groq returned invalid JSON');
    }
  }
}
