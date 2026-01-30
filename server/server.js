const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

const UPLOAD_DIR = path.join(__dirname, 'uploads');
const META_FILE = path.join(__dirname, 'metadata.json');
const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.BASE_URL || '';

if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

let metadata = {};
try { metadata = JSON.parse(fs.readFileSync(META_FILE, 'utf8') || '{}'); } catch (e) { metadata = {}; }

function saveMeta() { fs.writeFileSync(META_FILE, JSON.stringify(metadata, null, 2)); }

const app = express();
const upload = multer({ dest: UPLOAD_DIR });

// CORS middleware
app.use((req, res, next) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

function isExpired(item) {
  return !item || (Date.now() > item.expiresAt);
}

app.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const mimetype = req.file.mimetype || '';
  if (!mimetype.includes('pdf')) { try { fs.unlinkSync(req.file.path); } catch (e) {} return res.status(400).json({ error: 'Only PDF allowed' }); }

  const expiresMinutes = Math.max(1, parseInt(req.body.expiresMinutes) || 60);
  const id = uuidv4();
  const token = crypto.randomBytes(18).toString('hex');
  const ext = path.extname(req.file.originalname) || '.pdf';
  const newName = id + ext;
  const newPath = path.join(UPLOAD_DIR, newName);
  fs.renameSync(req.file.path, newPath);

  const expiresAt = Date.now() + expiresMinutes * 60 * 1000;
  metadata[id] = { id, fileName: newName, originalName: req.file.originalname, token, expiresAt };
  saveMeta();

  return res.json({ viewer: (BASE_URL || '') + '/view/' + id + '?t=' + token, expiresAt });
});

app.get('/view/:id', (req, res) => {
  const id = req.params.id;
  const t = req.query.t || '';
  const entry = metadata[id];
  if (!entry || entry.token !== t || isExpired(entry)) return res.status(404).send('Not found or expired');

  // Serve viewer page that embeds the protected /file route
  res.set('Content-Security-Policy', "default-src 'self'; frame-ancestors 'none';");
  res.send(`<!doctype html><html><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>Secure PDF</title><style>body{margin:0;height:100vh}iframe{width:100%;height:100vh;border:0} .no-select{user-select:none;-webkit-user-select:none;-ms-user-select:none}</style></head><body class=\"no-select\">` +
    `<div id=\"overlay\" style=\"position:fixed;inset:0;z-index:9999\"></div>` +
    `<iframe src=\"/file/${id}?t=${t}\" allow=\"encrypted-media\"></iframe>` +
    `<script>document.addEventListener('contextmenu', e=>e.preventDefault());document.addEventListener('keydown', e=>{ if((e.ctrlKey||e.metaKey)&&['s','p','S','P'].includes(e.key)) e.preventDefault(); if(e.key==='PrintScreen') e.preventDefault(); });</script></body></html>`);
});

app.get('/file/:id', (req, res) => {
  const id = req.params.id;
  const t = req.query.t || '';
  const entry = metadata[id];
  if (!entry || entry.token !== t || isExpired(entry)) return res.status(404).send('Not found or expired');

  const filePath = path.join(UPLOAD_DIR, entry.fileName);
  if (!fs.existsSync(filePath)) return res.status(404).send('File missing');

  res.set('Content-Type', 'application/pdf');
  res.set('Content-Disposition', 'inline; filename="' + entry.originalName.replace(/\"/g,'') + '"');
  res.set('Cache-Control', 'no-store');
  res.sendFile(filePath);
});

// Background cleanup of expired files (runs every 60s)
setInterval(() => {
  const now = Date.now();
  let changed = false;
  for (const id of Object.keys(metadata)) {
    const item = metadata[id];
    if (!item) { delete metadata[id]; changed = true; continue; }
    if (now > item.expiresAt) {
      const filePath = path.join(UPLOAD_DIR, item.fileName);
      try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch (e) {}
      delete metadata[id];
      changed = true;
    }
  }
  if (changed) saveMeta();
}, 60*1000);

app.listen(PORT, () => console.log('Server listening on', PORT));
