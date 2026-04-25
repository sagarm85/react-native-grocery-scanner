import type { ScanConfig } from './types';

export function buildPrompt(config: ScanConfig): string {
  return `You are an expert at reading handwritten Indian grocery lists written in Devanagari script.

Carefully analyze the provided image or document and extract all grocery items listed.

The list may be divided into sections by day of the week written as a heading (e.g. सोमवार, मंगलवार, बुधवार, गुरुवार, शुक्रवार, शनिवार, रविवार — or their English equivalents). Treat these as section headers, NOT as grocery items.

For each grocery item, extract:
- nameDevanagari: correct standard Hindi name in Devanagari script — NEVER use phonetic transliterations of English words (e.g. "केपसीकम" is wrong; use "शिमला मिर्च" for capsicum). Derive from the English name, not the handwriting. Examples: Mint → पुदीना, Coriander → धनिया, Green Capsicum → हरी शिमला मिर्च, Tomato → टमाटर, Onion → प्याज, Potato → आलू
- nameEnglish: English translation of the item name
- quantity: numeric quantity (use 1 if not specified; omit the entire item if it is crossed out)
- unit: unit of measurement — one of: kg, g, litre, ml, packet, piece, dozen, bunch, box, bottle, can, other
- category: best matching category from this list: ${config.categories.join(', ')}
- confidence: your confidence in reading this item correctly (0.0 to 1.0, where 1.0 = perfectly legible)
- day: English name of the day this item appears under (e.g. "Friday"), or omit if no day section header is present

Respond with ONLY valid JSON in this exact format, no other text:
{
  "items": [
    {
      "nameDevanagari": "string",
      "nameEnglish": "string",
      "quantity": number,
      "unit": "string",
      "category": "string",
      "confidence": number,
      "day": "string"
    }
  ],
  "rawText": "all text visible in the image, exactly as written",
  "scanQuality": "good"
}

Rules:
- Day headings (सोमवार/Monday, मंगलवार/Tuesday, etc.) are section labels — do NOT include them as grocery items
- SKIP any item that is crossed out or has a strikethrough entire line — these are cancelled items and must NOT appear in the output
- nameEnglish must always be in English using Latin script, even when the item is written in Devanagari (e.g. पुदीना → "Mint", टमाटर → "Tomato")
- nameDevanagari must be the correct standard Hindi name — never copy phonetic English transliterations from the handwriting (e.g. केपसीकम → शिमला मिर्च, टमाटो → टमाटर)
- if nameEnglish is correct but corresponding nameDevanagari is not matched with actual hindi version, then correct nameDevanagari (e.g पोदिना → "Mint" → पुदीना, ग्रीन कैपसीकम → Green Capsicum → हरी शिमला मिर्च ))
- scanQuality is "degraded" when heavy scratches, significant fading, or damage makes reading difficult
- scanQuality is "good" when handwriting is reasonably legible
- Use confidence below 0.5 for items that are very hard to read
- If no grocery items are visible, return an empty items array with relevant rawText
- If the image is entirely blank, return: { "items": [], "rawText": "", "scanQuality": "good" }`;
}
