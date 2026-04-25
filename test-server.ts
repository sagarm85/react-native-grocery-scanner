// ANTHROPIC_API_KEY=your_key_here npx ts-node test-server.ts

import express from 'express';
  import multer from 'multer';
  import { ClaudeProvider } from './src/providers/ClaudeProvider';
  import { normalize } from './src/normalizer';

  const app    = express();
  const upload = multer({ storage: multer.memoryStorage() });

  const CONFIG = {
    outputLanguage: 'both' as const,
    confidenceThreshold: 0.0,
    categories: ['dairy', 'grains', 'spices', 'oil', 'pulses', 'snacks', 'vegetables', 'other'],
  };

  app.get('/', (_req, res) => res.send(`
    <html><body style="font-family:sans-serif;max-width:600px;margin:40px auto">
      <h2>Grocery Scanner Test</h2>
      <form method="POST" action="/scan" enctype="multipart/form-data">
        <input type="file" name="image" accept="image/*,.pdf" required><br><br>
        <button type="submit">Scan</button>
      </form>
    </body></html>
  `));

  app.post('/scan', upload.single('image'), async (req, res) => {
    if (!req.file) return res.status(400).send('No file uploaded');
    const base64   = req.file.buffer.toString('base64');
    const mimeType = req.file.mimetype;
    const provider = new ClaudeProvider(process.env.ANTHROPIC_API_KEY ?? '');
    const result   = await provider.scan(base64, mimeType, CONFIG);
    const list     = normalize(result, CONFIG);
    const rows = list.items.map(item =>
      `<tr><td>${item.day ?? ''}</td><td>${item.nameDevanagari}</td><td>${item.nameEnglish}</td>
       <td>${item.quantity} ${item.unit}</td><td>${item.category}</td>
       <td>${(item.confidence*100).toFixed(0)}%</td></tr>`
    ).join('');
    res.send(`
      <html><body style="font-family:sans-serif;max-width:800px;margin:40px auto">
        <h2>Results</h2>
        <p>Scan quality: <b>${list.scanQuality}</b></p>
        <p>Raw text: <pre>${list.rawText}</pre></p>
        <table border="1" cellpadding="8">
          <tr><th>Day</th><th>देवनागरी</th><th>English</th><th>Qty</th><th>Category</th><th>Confidence</th></tr>
          ${rows}
        </table>
        <br><a href="/">← Scan another</a>
      </body></html>
    `);
  });

  app.listen(3000, () => console.log('Open http://localhost:3000'));
