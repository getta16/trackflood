// ดึงข้อมูล GISTDA ล่วงหน้าเป็นไฟล์ JSON สำหรับ GitHub Pages (โหมด static)
// key อยู่ใน GitHub Secret จึงไม่หลุดไปที่หน้าเว็บ
// รัน: GISTDA_API_KEY=xxx node scripts/fetch-gistda.js

const fs = require('fs');
const path = require('path');
const TF = require('../public/shared');
const { SLIM, exportFlood, fetchFloodFreq, hasH3 } = require('../lib/gistda-slim');

const KEY = process.env.GISTDA_API_KEY || '';
const OUT = path.join(__dirname, '..', 'public', 'data', 'gistda');
// GeoJSON รูปทรงเดิมสำหรับไฟล์ดาวน์โหลด (scripts/build-downloads.js แปลงต่อเป็น SHP/KMZ)
const DL = path.join(OUT, 'downloads');
const EXPORT = ['7days', '30days'];
// น้ำท่วมซ้ำซากเป็นข้อมูลรายปี ไฟล์ใหญ่ ดึงใหม่เมื่อเก่ากว่านี้ (workflow เก็บ cache ไว้)
const FREQ_MAX_AGE_DAYS = 30;

const write = (name, obj) => {
  const file = path.join(OUT, `${name}.json`);
  fs.writeFileSync(file, JSON.stringify(obj));
  return (fs.statSync(file).size / 1e6).toFixed(2) + ' MB';
};

(async () => {
  if (!KEY) {
    console.log('ไม่มี GISTDA_API_KEY ข้ามการดึงข้อมูล GISTDA');
    return;
  }
  if (!hasH3) console.warn('ไม่พบ h3-js: ใช้ polygon เดิม ไฟล์จะใหญ่กว่า (รัน npm ci ก่อน)');
  fs.mkdirSync(OUT, { recursive: true });
  const meta = { updated: new Date().toISOString(), datasets: {} };

  fs.mkdirSync(DL, { recursive: true });
  for (const name of Object.keys(SLIM)) {
    try {
      const raw = [];
      const fc = await TF.fetchGistda(name, TF.SETTINGS, KEY, (f) => {
        if (EXPORT.includes(name)) raw.push(exportFlood(f));
        return SLIM[name](f);
      });
      if (EXPORT.includes(name)) {
        const base = `gistda_flood_${name}_${TF.SETTINGS.slug}`;
        fs.writeFileSync(path.join(DL, `${base}.geojson`), JSON.stringify({
          type: 'FeatureCollection', name: base,
          crs: { type: 'name', properties: { name: 'urn:ogc:def:crs:OGC:1.3:CRS84' } },
          features: raw,
        }));
      }
      const size = write(name, fc);
      meta.datasets[name] = { ok: true, count: fc.features.length };
      console.log(`${name}: ${fc.features.length} features, ${size}`);
    } catch (e) {
      meta.datasets[name] = { ok: false, error: e.message };
      console.error(`${name}: ${e.message}`);
    }
  }

  // อายุดูจาก updated ในไฟล์ (เวลาไฟล์จะเปลี่ยนเมื่อ restore จาก cache)
  const freqFile = path.join(OUT, 'flood-freq-summary.json');
  const s = fs.existsSync(freqFile) && fs.existsSync(path.join(OUT, 'flood-freq.json'))
    ? JSON.parse(fs.readFileSync(freqFile, 'utf8')) : null;
  const freqAge = s?.updated ? (Date.now() - Date.parse(s.updated)) / 86400e3 : Infinity;
  if (freqAge < FREQ_MAX_AGE_DAYS && !process.env.FORCE_FREQ) {
    meta.datasets['flood-freq'] = { ok: true, cached: true, count: s.mapCount };
    console.log(`flood-freq: ใช้ cache (อายุ ${freqAge.toFixed(1)} วัน)`);
  } else {
    try {
      const { map, summary } = await fetchFloodFreq(TF.SETTINGS, KEY);
      summary.mapCount = map.features.length;
      summary.updated = meta.updated;
      const size = write('flood-freq', map);
      write('flood-freq-summary', summary);
      meta.datasets['flood-freq'] = { ok: true, count: map.features.length };
      console.log(`flood-freq: ${map.features.length} features (freq >= ${summary.freqMin}), ${size}; ${summary.amphoe.length} อำเภอ`);
    } catch (e) {
      meta.datasets['flood-freq'] = { ok: false, error: e.message };
      console.error(`flood-freq: ${e.message}`);
    }
  }

  fs.writeFileSync(path.join(OUT, 'meta.json'), JSON.stringify(meta, null, 1));
  // key ผิดหรือหมดอายุ ให้ workflow แจ้ง fail จะได้รู้ตัว
  if (Object.values(meta.datasets).every((d) => !d.ok)) process.exit(1);
})();
