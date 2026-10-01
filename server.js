import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 3000);
const dataDir = path.join(__dirname, 'data');
const dataFile = path.join(dataDir, 'items.json');
fs.mkdirSync(dataDir, { recursive: true });
if (!fs.existsSync(dataFile)) fs.writeFileSync(dataFile, '[]\n');

const readItems = () => JSON.parse(fs.readFileSync(dataFile, 'utf8'));
const writeItems = (items) => fs.writeFileSync(dataFile, `${JSON.stringify(items, null, 2)}\n`);
const findItem = (items, id) => items.find((item) => item.id === id);

const app = express();
app.use(express.json({ limit: '100kb' }));
app.use(express.static(path.join(__dirname, 'public')));

function validate(payload) {
  const name = typeof payload?.name === 'string' ? payload.name.trim() : '';
  const description = typeof payload?.description === 'string' ? payload.description.trim() : '';
  const status = payload?.status === 'inactive' ? 'inactive' : 'active';
  if (!name || name.length > 120) return { error: 'Nama wajib diisi dan maksimal 120 karakter.' };
  if (description.length > 500) return { error: 'Deskripsi maksimal 500 karakter.' };
  return { value: { name, description, status } };
}

app.get('/api/items', (_req, res) => res.json(readItems().sort((a, b) => b.id - a.id)));

app.get('/api/items/:id', (req, res) => {
  const item = findItem(readItems(), Number(req.params.id));
  if (!item) return res.status(404).json({ error: 'Data tidak ditemukan.' });
  return res.json(item);
});

app.post('/api/items', (req, res) => {
  const result = validate(req.body);
  if (result.error) return res.status(400).json(result);
  const items = readItems();
  const now = new Date().toISOString();
  const item = { id: items.reduce((max, current) => Math.max(max, current.id), 0) + 1, ...result.value, created_at: now, updated_at: now };
  items.push(item);
  writeItems(items);
  return res.status(201).json(item);
});

app.put('/api/items/:id', (req, res) => {
  const id = Number(req.params.id);
  const result = validate(req.body);
  if (!Number.isInteger(id) || result.error) return res.status(400).json({ error: result.error || 'ID tidak valid.' });
  const items = readItems();
  const item = findItem(items, id);
  if (!item) return res.status(404).json({ error: 'Data tidak ditemukan.' });
  Object.assign(item, result.value, { updated_at: new Date().toISOString() });
  writeItems(items);
  return res.json(item);
});

app.delete('/api/items/:id', (req, res) => {
  const items = readItems();
  const remaining = items.filter((item) => item.id !== Number(req.params.id));
  if (remaining.length === items.length) return res.status(404).json({ error: 'Data tidak ditemukan.' });
  writeItems(remaining);
  return res.status(204).end();
});

app.get('*', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(port, () => console.log(`CRUD App berjalan di http://localhost:${port}`));
