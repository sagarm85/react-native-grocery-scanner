// Usage: ANTHROPIC_API_KEY=sk-ant-... OPENAI_API_KEY=sk-... npx ts-node test-server.ts
/**
 * ps aux | grep "ts-node\|test-server" | grep -v grep || echo "No ts-node process found"
 * kill 97678 97659 2>/dev/null && echo "Killed old server processes"
 * export ANTHROPIC_API_KEY=<your-key> 
 * export OPENAI_API_KEY=<your-key> 
 * npx ts-node test-server.ts
 */
import express from 'express';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { ClaudeProvider } from './src/providers/ClaudeProvider';
import { OpenAIProvider } from './src/providers/OpenAIProvider';
import { ChainedProvider } from './src/providers/ChainedProvider';
import { normalize } from './src/normalizer';
import type { ChainLog, GroceryList } from './src/types'; // GroceryList used in resultsPage signature
import type { ScanConfig } from './src/types';

const LOGS_DIR = path.join(__dirname, 'logs');
if (!fs.existsSync(LOGS_DIR)) fs.mkdirSync(LOGS_DIR);

function writeLog(log: ChainLog): string {
  const filename = `scan-${log.timestamp.replace(/[:.]/g, '-')}.json`;
  fs.writeFileSync(path.join(LOGS_DIR, filename), JSON.stringify(log, null, 2));
  return filename;
}

const anthropicKey = process.env.ANTHROPIC_API_KEY;
const openaiKey = process.env.OPENAI_API_KEY;

if (!anthropicKey) {
  console.error('Error: ANTHROPIC_API_KEY is not set.\n  export ANTHROPIC_API_KEY=sk-ant-...');
  process.exit(1);
}
if (!openaiKey) {
  console.error('Error: OPENAI_API_KEY is not set.\n  export OPENAI_API_KEY=sk-...');
  process.exit(1);
}

const provider = new ChainedProvider({
  primary: new ClaudeProvider(anthropicKey),// OpenAIProvider(openaiKey),
  refiner: new ClaudeProvider(anthropicKey),
  refinementThreshold: 0.8,
});
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


function resultsPage(list: GroceryList, log?: ChainLog, logFile?: string): string {
  const triggerBadge = (t: string | null) => {
    if (!t) return '<span style="color:#888">—</span>';
    const color = t === 'transliteration' ? '#c05' : '#a60';
    return `<span style="color:${color};font-weight:bold">${t}</span>`;
  };
  const conf = (n: number) => `${(n * 100).toFixed(0)}%`;

  const rows = list.items.map((item, i) => {
    const audit = log?.items[i];
    if (audit) {
      return `
    <tr>
      <td>${item.day ?? ''}</td>
      <td><b>${audit.final.nameDevanagari}</b></td>
      <td>${item.nameEnglish ?? ''}</td>
      <td>${item.quantity} ${item.unit}</td>
      <td>${item.category}</td>
      <td>${conf(audit.primary.confidence)}</td>
      <td>${triggerBadge(audit.refinementTrigger)}</td>
      <td>${audit.refined ? conf(audit.refined.confidence) : '<span style="color:#888">—</span>'}</td>
      <td><b>${conf(audit.final.confidence)}</b></td>
    </tr>`;
    }
    return `
    <tr>
      <td>${item.day ?? ''}</td>
      <td>${item.nameDevanagari ?? ''}</td>
      <td>${item.nameEnglish ?? ''}</td>
      <td>${item.quantity} ${item.unit}</td>
      <td>${item.category}</td>
      <td>—</td><td>—</td><td>—</td>
      <td>${conf(item.confidence)}</td>
    </tr>`;
  }).join('');

  const logLink = logFile
    ? `<p style="font-size:0.85em"><a href="/logs/${logFile}">⬇ Download full log (JSON)</a></p>`
    : '';

  return `
<html><body style="font-family:sans-serif;max-width:1000px;margin:40px auto">
  <h2>Results</h2>
  <p>Scan quality: <b>${list.scanQuality}</b> &nbsp;|&nbsp; ${log ? `${log.primaryProvider} → refiner` : 'single provider'} &nbsp;|&nbsp; ${log?.timestamp ?? ''}</p>
  <p>Raw text: <pre>${list.rawText}</pre></p>
  <table border="1" cellpadding="8" style="font-size:0.9em">
    <tr style="background:#f0f0f0">
      <th>Day</th><th>देवनागरी</th><th>English</th><th>Qty</th><th>Category</th>
      <th>Primary conf</th><th>Trigger</th><th>Refined conf</th><th>Final conf</th>
    </tr>
    ${rows}
  </table>
  ${logLink}
  <br><a href="/">← Scan another</a> &nbsp; <a href="/logs">📋 All logs</a>
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
    const logFile = result.chainLog ? writeLog(result.chainLog) : undefined;
    if (logFile) console.log(`[log] ${logFile}`);
    res.send(resultsPage(normalize(result, CONFIG), result.chainLog, logFile));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unexpected error';
    res.status(500).send(`<pre>Error: ${message}</pre><br><a href="/">← Try again</a>`);
  }
});

app.get('/logs', (_req, res) => {
  const files = fs.readdirSync(LOGS_DIR).filter(f => f.endsWith('.json')).sort().reverse();
  const links = files.map(f => `<li><a href="/logs/${f}">${f}</a></li>`).join('');
  res.send(`<html><body style="font-family:sans-serif;max-width:600px;margin:40px auto">
    <h2>Scan Logs</h2><ul>${links || '<li>No logs yet</li>'}</ul>
    <a href="/">← Home</a></body></html>`);
});

app.get('/logs/:filename', (req, res) => {
  const file = path.join(LOGS_DIR, path.basename(req.params.filename));
  if (!fs.existsSync(file)) { res.status(404).send('Not found'); return; }
  res.type('json').send(fs.readFileSync(file, 'utf8'));
});

app.listen(3000, () => console.log('Open http://localhost:3000'));
