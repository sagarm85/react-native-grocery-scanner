// Usage: ANTHROPIC_API_KEY=sk-ant-... npx ts-node test-server.ts

import express from 'express';
import multer from 'multer';
import { ClaudeProvider } from './src/providers/ClaudeProvider';
import { normalize } from './src/normalizer';
import type { GroceryList } from './src/types';
import type { ScanConfig } from './src/types';

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  console.error('Error: ANTHROPIC_API_KEY is not set.\n  export ANTHROPIC_API_KEY=sk-ant-...');
  process.exit(1);
}

const provider = new ClaudeProvider(apiKey);
const app = express();
const upload = multer({ storage: multer.memoryStorage() });

const CONFIG: ScanConfig = {
  outputLanguage: 'both',
  confidenceThreshold: 0.0,
  categories: ['dairy', 'grains', 'spices', 'oil', 'pulses', 'snacks', 'vegetables', 'other'],
};

function uploadForm(): string {
  return `
<html><body style="font-family:sans-serif;max-width:600px;margin:40px auto">
  <h2>Grocery Scanner Test</h2>
  <form method="POST" action="/scan" enctype="multipart/form-data">
    <input type="file" name="image" accept="image/*,.pdf" required><br><br>
    <button type="submit">Scan</button>
  </form>
</body></html>`;
}

function resultsPage(list: GroceryList): string {
  const rows = list.items.map(item => `
    <tr>
      <td>${item.day ?? ''}</td>
      <td>${item.nameDevanagari ?? ''}</td>
      <td>${item.nameEnglish ?? ''}</td>
      <td>${item.quantity} ${item.unit}</td>
      <td>${item.category}</td>
      <td>${(item.confidence * 100).toFixed(0)}%</td>
    </tr>`).join('');
  return `
<html><body style="font-family:sans-serif;max-width:800px;margin:40px auto">
  <h2>Results</h2>
  <p>Scan quality: <b>${list.scanQuality}</b></p>
  <p>Raw text: <pre>${list.rawText}</pre></p>
  <table border="1" cellpadding="8">
    <tr><th>Day</th><th>देवनागरी</th><th>English</th><th>Qty</th><th>Category</th><th>Confidence</th></tr>
    ${rows}
  </table>
  <br><a href="/">← Scan another</a>
</body></html>`;
}

app.get('/', (_req, res) => res.send(uploadForm()));

app.post('/scan', upload.single('image'), async (req, res) => {
  if (!req.file) {
    res.status(400).send('No file uploaded');
    return;
  }
  try {
    const base64 = req.file.buffer.toString('base64');
    const result = await provider.scan(base64, req.file.mimetype, CONFIG);
    res.send(resultsPage(normalize(result, CONFIG)));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unexpected error';
    res.status(500).send(`<pre>Error: ${message}</pre><br><a href="/">← Try again</a>`);
  }
});

app.listen(3000, () => console.log('Open http://localhost:3000'));
