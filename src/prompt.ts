import type { ScanConfig } from './types';

export function buildPrompt(config: ScanConfig): string {
  return `You are an expert at reading handwritten Indian grocery lists written in Devanagari script.

Carefully analyze the provided image or document and extract all grocery items listed.

For each grocery item, extract:
- nameDevanagari: item name exactly as written in Devanagari script
- nameEnglish: English translation of the item name
- quantity: numeric quantity (use 1 if not specified)
- unit: unit of measurement — one of: kg, g, litre, ml, packet, piece, dozen, bunch, box, bottle, can, other
- category: best matching category from this list: ${config.categories.join(', ')}
- confidence: your confidence in reading this item correctly (0.0 to 1.0, where 1.0 = perfectly legible)

Respond with ONLY valid JSON in this exact format, no other text:
{
  "items": [
    {
      "nameDevanagari": "string",
      "nameEnglish": "string",
      "quantity": number,
      "unit": "string",
      "category": "string",
      "confidence": number
    }
  ],
  "rawText": "all text visible in the image, exactly as written",
  "scanQuality": "good"
}

Rules:
- scanQuality is "degraded" when heavy scratches, significant fading, or damage makes reading difficult
- scanQuality is "good" when handwriting is reasonably legible
- Use confidence below 0.5 for items that are very hard to read
- If no grocery items are visible, return an empty items array with relevant rawText
- If the image is entirely blank, return: { "items": [], "rawText": "", "scanQuality": "good" }`;
}
