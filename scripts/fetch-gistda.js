// ดึงข้อมูล GISTDA ล่วงหน้าเป็นไฟล์ JSON สำหรับ GitHub Pages (โหมด static)
// key อยู่ใน GitHub Secret จึงไม่หลุดไปที่หน้าเว็บ
// รัน: GISTDA_API_KEY=xxx node scripts/fetch-gistda.js

const fs = require('fs');
const path = require('path');
const TF = require('../public/shared');

const KEY = process.env.GISTDA_API_KEY || '';
const OUT = path.join(__dirname, '..', 'public', 'data', 'gistda');

(async () => {
  if (!KEY) {
    console.log('ไม่มี GISTDA_API_KEY ข้ามการดึงข้อมูล GISTDA');
    return;
  }
  fs.mkdirSync(OUT, { recursive: true });
  const meta = { updated: new Date().toISOString(), datasets: {} };
  for (const name of Object.keys(TF.GISTDA.datasets)) {
    try {
      const fc = await TF.fetchGistda(name, TF.SETTINGS, KEY);
      fs.writeFileSync(path.join(OUT, `${name}.json`), JSON.stringify(fc));
      meta.datasets[name] = { ok: true, count: fc.features.length };
      console.log(`${name}: ${fc.features.length} features`);
    } catch (e) {
      meta.datasets[name] = { ok: false, error: e.message };
      console.error(`${name}: ${e.message}`);
    }
  }
  fs.writeFileSync(path.join(OUT, 'meta.json'), JSON.stringify(meta, null, 1));
  // key ผิดหรือหมดอายุ ให้ workflow แจ้ง fail จะได้รู้ตัว
  if (Object.values(meta.datasets).every((d) => !d.ok)) process.exit(1);
})();
