// สร้างข้อมูลไทม์ไลน์ของหน้าสรุปอุทกภัย 2569 (flood2569.html)
//   public/flood2569-timeline.json   ระดับน้ำรายวันจาก ThaiWater + ฝนรายวันจาก Open-Meteo (ERA5)
//   public/flood2569-satellite.geojson  พื้นที่น้ำท่วมจากดาวเทียม GISTDA รายภาพ ตัดเฉพาะ จ.กำแพงเพชร รวมรายตำบล
//
// รัน: node scripts/build-flood2569-timeline.js [--scenes <โฟลเดอร์ไฟล์ zip/shp ของ GISTDA>]
//   ไม่ใส่ --scenes จะสร้างเฉพาะ timeline.json (ไฟล์ดาวเทียมเดิมไม่ถูกแตะ)
//   --scenes ต้องมี ogr2ogr (Windows + QGIS: ตั้ง OGR2OGR="C:\Program Files\QGIS x\bin\ogr2ogr.exe")
//   ไฟล์ zip ชื่อแบบ S1D_20261002_0609.zip (ดาวเทียม_วันที่_เวลา) ที่ดาวน์โหลดจาก GISTDA

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const TF = require('../public/shared');

const START = '2026-09-15';
const END = '2026-11-10';
const PUB = path.join(__dirname, '..', 'public');
const OGR2OGR = process.env.OGR2OGR || 'ogr2ogr';
const SAT_NAMES = { S1D: 'Sentinel-1', rd2: 'RADARSAT-2', cm2: 'COSMO-SkyMed' };

const days = [];
for (let d = new Date(START + 'T00:00:00Z'); d <= new Date(END + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + 1)) days.push(d.toISOString().slice(0, 10));

const getJson = async (url) => {
  for (let i = 0; ; i++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': 'trackflood-build' } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } catch (e) {
      if (i >= 2) throw new Error(`${url}: ${e.message}`);
      await new Promise((ok) => setTimeout(ok, 1500 * (i + 1)));
    }
  }
};
const round = (v, n = 2) => (v == null ? null : +v.toFixed(n));

// ---------- ระดับน้ำรายวัน (ThaiWater) ----------
async function buildStations() {
  const list = TF.parseWaterLevels(await getJson(TF.URLS.waterlevel), TF.SETTINGS)
    .filter((s) => s.inProvince || s.agency === 'ชป.');
  const out = [];
  for (const s of list) {
    const url = `https://api-v3.thaiwater.net/api/v1/thaiwater30/public/waterlevel_graph?station_type=tele_waterlevel&station_id=${s.id}&start_date=${START}&end_date=${END}`;
    let j;
    try { j = await getJson(url); } catch (e) { console.warn('skip', s.code, e.message); continue; }
    const byDay = {};
    for (const p of j.data?.graph_data || []) {
      if (p.value == null) continue;
      const d = p.datetime.slice(0, 10);
      const b = (byDay[d] ||= { wl: -Infinity, q: null });
      b.wl = Math.max(b.wl, +p.value);
      if (p.discharge != null) b.q = Math.max(b.q ?? -Infinity, +p.discharge);
    }
    const wl = days.map((d) => (byDay[d] ? round(byDay[d].wl) : null));
    if (wl.every((v) => v == null)) continue;
    out.push({
      code: s.code, name: s.name, agency: s.agency, river: s.river,
      amphoe: s.amphoe, province: s.province, lat: s.lat, lon: s.lon,
      bank: round(j.data?.min_bank ?? s.bankMsl), ground: round(j.data?.ground_level ?? s.groundMsl),
      wl, q: days.map((d) => (byDay[d]?.q != null ? round(byDay[d].q, 1) : null)),
    });
    console.log('station', s.code, s.name, wl.filter((v) => v != null).length, 'days');
  }
  return out;
}

// ---------- ฝนรายวัน (Open-Meteo archive, กริด 0.25° ตามกริด ERA5) ----------
function inRing(x, y, ring) {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
async function buildRain() {
  const fc = JSON.parse(fs.readFileSync(path.join(PUB, 'kpp_boundary.geojson'), 'utf8'));
  const polys = fc.features.flatMap((f) => (f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates));
  const inside = (x, y) => polys.some((p) => inRing(x, y, p[0]) && !p.slice(1).some((h) => inRing(x, y, h)));
  const H = 0.125, cells = [];
  for (let lat = 15.75; lat <= 17.0; lat += 0.25) {
    for (let lon = 98.75; lon <= 100.25; lon += 0.25) {
      // เก็บช่องที่มีส่วนใดส่วนหนึ่งอยู่ในจังหวัด (สุ่มตรวจ 5x5 จุด)
      let hit = false;
      for (let a = -2; a <= 2 && !hit; a++) for (let b = -2; b <= 2 && !hit; b++) hit = inside(lon + (b * H) / 2.2, lat + (a * H) / 2.2);
      if (hit) cells.push({ lat, lon });
    }
  }
  const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${cells.map((c) => c.lat).join(',')}&longitude=${cells.map((c) => c.lon).join(',')}` +
    `&start_date=${START}&end_date=${END}&daily=precipitation_sum&timezone=Asia%2FBangkok`;
  const res = [].concat(await getJson(url));
  return cells.map((c, i) => {
    const d = res[i].daily;
    return { lat: c.lat, lon: c.lon, mm: days.map((day) => { const k = d.time.indexOf(day); return k < 0 ? null : round(d.precipitation_sum[k], 1); }) };
  });
}

// ---------- พื้นที่น้ำท่วมจากดาวเทียม (GISTDA) ----------
function buildSatellite(dir) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gistda-'));
  for (const f of fs.readdirSync(dir)) {
    // แตกไฟล์ zip ด้วย tar (มีใน Windows 10+ และ Linux/macOS)
    if (/^(S1D|rd2|cm2|S1A|S1B)_\d{8}_\d{4}.*\.zip$/i.test(f)) execFileSync('tar', ['-xf', path.join(dir, f), '-C', tmp]);
    else if (/\.(shp|shx|dbf|prj|cpg)$/i.test(f)) fs.copyFileSync(path.join(dir, f), path.join(tmp, f));
  }
  const features = [];
  const scenes = [];
  for (const shp of fs.readdirSync(tmp).filter((f) => /\.shp$/i.test(f)).sort()) {
    const base = shp.replace(/\.shp$/i, '');
    const m = base.match(/^([A-Za-z0-9]+)_(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})/);
    if (!m) continue;
    const date = `${m[2]}-${m[3]}-${m[4]}`;
    // ไฟล์ .cpg บางชุดเขียน "ISO 885911" ซึ่ง GDAL ไม่รู้จัก ให้อ่านเป็น CP874 (ภาษาไทย)
    const cpgFile = fs.readdirSync(tmp).find((f) => f.toLowerCase() === base.toLowerCase() + '.cpg');
    const cpg = cpgFile ? fs.readFileSync(path.join(tmp, cpgFile), 'utf8') : '';
    const enc = /utf/i.test(cpg) ? 'UTF-8' : 'CP874';
    const out = path.join(tmp, base + '.geojson');
    execFileSync(OGR2OGR, ['-f', 'GeoJSON', out, path.join(tmp, shp), '-oo', `ENCODING=${enc}`,
      '-dialect', 'SQLite', '-sql',
      `SELECT AP_TN AS a, TB_TN AS t, SUM(flood_area) AS r, ST_Union(geometry) AS geometry FROM "${base}" WHERE PV_IDN=62 GROUP BY AP_TN, TB_TN`,
      '-nlt', 'MULTIPOLYGON', '-simplify', '0.0002', '-lco', 'COORDINATE_PRECISION=5', '-lco', 'RFC7946=YES'], { stdio: ['ignore', 'ignore', 'pipe'] });
    const fc = JSON.parse(fs.readFileSync(out, 'utf8'));
    const valid = fc.features.filter((f) => f.geometry);
    if (!valid.length) continue;
    let rai = 0;
    for (const f of valid) {
      const p = f.properties;
      rai += p.r || 0;
      features.push({ type: 'Feature', properties: { d: date, s: m[1], a: p.a, t: p.t, r: round(p.r, 1) }, geometry: f.geometry });
    }
    scenes.push({ date, time: `${m[5]}:${m[6]}`, sat: m[1], satName: SAT_NAMES[m[1]] || m[1], scene: base, rai: Math.round(rai), tambon: valid.length });
    console.log('scene', base, valid.length, 'tambon', Math.round(rai), 'rai');
  }
  fs.rmSync(tmp, { recursive: true, force: true });
  const key = (x) => x.date + (x.time || '');
  scenes.sort((a, b) => key(a).localeCompare(key(b)));
  features.sort((a, b) => a.properties.d.localeCompare(b.properties.d));
  return { type: 'FeatureCollection', scenes, features };
}

(async () => {
  const sceneArg = process.argv.indexOf('--scenes');
  if (sceneArg > 0) {
    const fc = buildSatellite(process.argv[sceneArg + 1]);
    fs.writeFileSync(path.join(PUB, 'flood2569-satellite.geojson'), JSON.stringify(fc));
    console.log('wrote flood2569-satellite.geojson', fc.scenes.length, 'scenes', fc.features.length, 'features');
  }
  const [stations, rain] = await Promise.all([buildStations(), buildRain()]);
  const out = {
    built: new Date().toISOString(), days, stations, rain,
    sources: {
      stations: 'ThaiWater (สสน.) api-v3.thaiwater.net ระดับน้ำรายชั่วโมง สรุปเป็นค่าสูงสุดรายวัน',
      rain: 'Open-Meteo Historical Weather API (ERA5 reanalysis) ฝนรายวันกริด 0.25° เป็นค่าจากแบบจำลอง ไม่ใช่สถานีวัดฝน',
    },
  };
  fs.writeFileSync(path.join(PUB, 'flood2569-timeline.json'), JSON.stringify(out));
  console.log('wrote flood2569-timeline.json', stations.length, 'stations', rain.length, 'rain cells');
})().catch((e) => { console.error(e); process.exit(1); });
