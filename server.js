// เว็บติดตามสถานการณ์น้ำ จ.กำแพงเพชร
// Node >= 18 (ใช้ fetch ในตัว) ไม่ต้องติดตั้ง package เพิ่ม
// รัน: node server.js  แล้วเปิด http://localhost:3000

const http = require('http');
const fs = require('fs');
const path = require('path');

// ---------- โหลด .env แบบง่าย ----------
const envFile = path.join(__dirname, '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const PORT = Number(process.env.PORT || 3000);
const GISTDA_API_KEY = process.env.GISTDA_API_KEY || '';
const LONGDO_API_KEY = process.env.LONGDO_API_KEY || '';

const TF = require('./public/shared');
const CFG = { ...TF.SETTINGS, radiusKm: Number(process.env.RADIUS_KM || TF.SETTINGS.radiusKm) };

// ---------- cache ----------
const cache = new Map();
async function cached(key, ttlMs, fn) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.t < ttlMs) return hit.v;
  const v = await fn();
  cache.set(key, { t: Date.now(), v });
  return v;
}

async function getJson(url, headers = {}) {
  const res = await fetch(url, { headers: { Accept: 'application/json', ...headers }, signal: AbortSignal.timeout(45000) });
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status} จาก ${new URL(url).host}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

// ---------- ThaiWater ----------
const waterLevels = async () => TF.parseWaterLevels(await cached('wl', 10 * 60e3, () => getJson(TF.URLS.waterlevel)), CFG);
const rain24h = async () => TF.parseRain(await cached('rain', 10 * 60e3, () => getJson(TF.URLS.rain)), CFG);
const dams = async () => TF.parseDams(await cached('main', 30 * 60e3, () => getJson(TF.URLS.main)));
async function waterLevelGraph(stationId, days) {
  const url = TF.URLS.graph(stationId, days);
  return TF.parseGraph(await cached(url, 10 * 60e3, () => getJson(url)));
}

// ---------- GISTDA Disaster Platform ----------
function needGistdaKey() {
  if (GISTDA_API_KEY) return;
  const e = new Error('ยังไม่ได้ตั้งค่า GISTDA_API_KEY ในไฟล์ .env');
  e.status = 503;
  throw e;
}
async function gistdaFeatures(name) {
  needGistdaKey();
  return cached('gistda:' + name, 30 * 60e3, () => TF.fetchGistda(name, CFG, GISTDA_API_KEY));
}

// ส่งต่อ tile ภาพ (TMS) โดยแนบ API-Key ฝั่ง server
async function gistdaTile(res, layer, z, x, y) {
  needGistdaKey();
  const tilePath = layer === 'flood-freq' ? 'maps/flood-freq' : `maps/flood/${layer}`;
  const r = await fetch(`${TF.GISTDA.base}/${tilePath}/tms/${z}/${x}/${y}`, {
    headers: { 'API-Key': GISTDA_API_KEY }, signal: AbortSignal.timeout(30000),
  });
  if (!r.ok) { res.writeHead(r.status === 404 ? 404 : 502); return res.end(); }
  res.writeHead(200, { 'Content-Type': r.headers.get('content-type') || 'image/png', 'Cache-Control': 'public, max-age=1800' });
  res.end(Buffer.from(await r.arrayBuffer()));
}

// ---------- HTTP ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json' };

function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

async function handleApi(url, res) {
  const p = url.pathname;
  try {
    if (p === '/api/config') {
      return send(res, 200, {
        ...CFG,
        longdoKey: LONGDO_API_KEY || CFG.longdoKey, // key ฝั่ง browser ของ Longdo ผูกกับ domain อยู่แล้ว
        hasGistda: !!GISTDA_API_KEY,
      });
    }
    if (p === '/api/waterlevel') return send(res, 200, { updated: new Date().toISOString(), data: await waterLevels() });
    if (p === '/api/rain') return send(res, 200, { updated: new Date().toISOString(), data: await rain24h() });
    if (p === '/api/dams') return send(res, 200, { data: await dams() });
    if (p === '/api/waterlevel/graph') {
      const id = url.searchParams.get('id');
      const days = Math.min(30, Math.max(1, Number(url.searchParams.get('days') || 7)));
      if (!/^\d+$/.test(id || '')) return send(res, 400, { error: 'id ไม่ถูกต้อง' });
      return send(res, 200, { data: await waterLevelGraph(id, days) });
    }
    let m;
    if ((m = p.match(/^\/api\/gistda\/tms\/([\w-]+)\/(\d+)\/(\d+)\/(\d+)$/))) {
      if (!TF.GISTDA.tmsLayers.includes(m[1])) return send(res, 400, { error: 'layer ไม่ถูกต้อง' });
      return await gistdaTile(res, m[1], m[2], m[3], m[4]);
    }
    if ((m = p.match(/^\/api\/gistda\/([\w-]+)$/))) {
      if (!TF.GISTDA.datasets[m[1]]) return send(res, 400, { error: 'ชุดข้อมูลต้องเป็น ' + Object.keys(TF.GISTDA.datasets).join(', ') });
      return send(res, 200, { updated: new Date().toISOString(), ...(await gistdaFeatures(m[1])) });
    }
    send(res, 404, { error: 'not found' });
  } catch (e) {
    console.error(p, e.message);
    send(res, e.status === 503 ? 503 : 502, { error: e.message });
  }
}

function serveStatic(url, res) {
  const root = path.join(__dirname, 'public');
  let file = path.normalize(path.join(root, decodeURIComponent(url.pathname)));
  if (!file.startsWith(root)) { res.writeHead(403); return res.end(); }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(buf);
  });
}

http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname.startsWith('/api/')) return handleApi(url, res);
  serveStatic(url, res);
}).listen(PORT, () => {
  console.log(`TrackFlood ${CFG.province}: http://localhost:${PORT}`);
  console.log(`  GISTDA key: ${GISTDA_API_KEY ? 'มี' : 'ไม่มี (ชั้นข้อมูลน้ำท่วมจากดาวเทียมจะปิดไว้)'}`);
  console.log(`  Longdo key: ${LONGDO_API_KEY ? 'มี' : 'ไม่มี (ใช้แผนที่ OSM แทน)'}`);
});
