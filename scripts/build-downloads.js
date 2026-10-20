// แปลง GeoJSON พื้นที่น้ำท่วม (จาก fetch-gistda.js) เป็นไฟล์ดาวน์โหลด: GeoJSON (zip), Shapefile (zip), KMZ
// ต้องมี ogr2ogr (GDAL) และ zip หรือ tar ในเครื่อง
// รัน: node scripts/build-downloads.js   (Windows + QGIS: ตั้ง OGR2OGR="C:\Program Files\QGIS x\bin\ogr2ogr.exe")

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const TF = require('../public/shared');

const DL = path.join(__dirname, '..', 'public', 'data', 'gistda', 'downloads');
const OGR2OGR = process.env.OGR2OGR || 'ogr2ogr';
const PERIODS = { '7days': '7 วัน', '30days': '30 วัน' };

// ชื่อฟิลด์ใน Shapefile ยาวได้ไม่เกิน 10 ตัวอักษร
// CAST ไว้ เพราะถ้าทั้งคอลัมน์เป็น null GDAL จะเดาเป็น String
const num = (f, as = f) => `CAST(${f} AS float) AS ${as}`;
const SHP_FIELDS = ['pv_tn', 'ap_tn', 'tb_tn', 'pv_idn', 'ap_idn', 'tb_idn', 'h3_address AS h3_addr',
  num('flood_m2'), num('flood_rai'), num('cell_m2'), num('population', 'pop'), 'building', 'school', 'hospital',
  num('road_m'), num('rice_rai'), num('maize_rai'), num('cassava_rai', 'cassav_rai'), num('sugarcane_rai', 'sugar_rai'),
  'first_img', 'last_img', 'n_images'].join(', ');

const run = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, stdio: ['ignore', 'ignore', 'pipe'] });

// Linux ใช้ zip, Windows ใช้ tar ของระบบ (bsdtar สร้าง zip ได้ ต่างจาก GNU tar ของ Git Bash)
const WIN_TAR = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe');
function zip(out, files, cwd) {
  const rel = path.relative(cwd, out);
  if (process.platform === 'win32') run(WIN_TAR, ['--format', 'zip', '-c', '-f', rel, ...files], cwd);
  else run('zip', ['-q', rel, ...files], cwd);
}

function readme(label, fc, stats) {
  return `พื้นที่น้ำท่วมจากดาวเทียม ${label} จ.${TF.SETTINGS.province} (GISTDA Disaster Platform)
แหล่งข้อมูล: ${TF.GISTDA.base}/features/flood/{ช่วงเวลา}?pv_idn=${TF.SETTINGS.provinceCode}
ดึงข้อมูลเมื่อ: ${new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok', dateStyle: 'long', timeStyle: 'short' })} น.
จำนวน ${fc.features.length.toLocaleString('th-TH')} แปลง · ${Math.round(stats.rai).toLocaleString('th-TH')} ไร่ · ภาพดาวเทียม ${stats.from || '-'} ถึง ${stats.to || '-'}
พิกัด: WGS84 (EPSG:4326) · รูปทรงเป็นพื้นที่น้ำท่วมจริงที่ตัดตามเซลล์ H3 resolution 9 (~0.12 ตร.กม./เซลล์)

ฟิลด์ (ชื่อใน Shapefile อยู่ในวงเล็บ ถ้าต่างจาก GeoJSON)
  pv_tn, ap_tn, tb_tn         จังหวัด อำเภอ ตำบล
  pv_idn, ap_idn, tb_idn      รหัสจังหวัด/อำเภอ/ตำบล
  h3_address (h3_addr)        รหัสเซลล์ H3
  flood_m2, flood_rai         พื้นที่น้ำท่วมในเซลล์ (ตร.ม. / ไร่)
  cell_m2                     พื้นที่ทั้งเซลล์ H3 (ตร.ม.)
  population (pop)            ประชากรโดยประมาณในพื้นที่ท่วม
  building, school, hospital  จำนวนอาคาร โรงเรียน โรงพยาบาล
  road_m                      ความยาวถนนที่ถูกน้ำท่วม (ม.)
  rice_rai, maize_rai         นาข้าว ข้าวโพด ที่ถูกน้ำท่วม (ไร่)
  cassava_rai (cassav_rai)    มันสำปะหลัง (ไร่)
  sugarcane_rai (sugar_rai)   อ้อย (ไร่)
  first_img, last_img         วันที่ภาพดาวเทียมแรก/ล่าสุดที่พบน้ำท่วม
  n_images                    จำนวนภาพดาวเทียมที่ใช้
  images                      รายชื่อภาพ (เฉพาะ GeoJSON/KMZ)
`;
}

if (!fs.existsSync(DL)) {
  console.log('ไม่มีข้อมูลสำหรับไฟล์ดาวน์โหลด (ยังไม่ได้ดึง GISTDA)');
  process.exit(0);
}

const index = { updated: new Date().toISOString(), items: [] };

for (const [period, label] of Object.entries(PERIODS)) {
  const base = `gistda_flood_${period}_${TF.SETTINGS.slug}`;
  const src = path.join(DL, `${base}.geojson`);
  if (!fs.existsSync(src)) continue;

  const fc = JSON.parse(fs.readFileSync(src, 'utf8'));
  const stats = { rai: 0 };
  for (const f of fc.features) {
    const p = f.properties;
    stats.rai += p.flood_rai || 0;
    if (p.first_img && (!stats.from || p.first_img < stats.from)) stats.from = p.first_img;
    if (p.last_img && (!stats.to || p.last_img > stats.to)) stats.to = p.last_img;
  }
  const item = { period, label, count: fc.features.length, rai: Math.round(stats.rai), from: stats.from, to: stats.to, files: [] };
  const add = (format, file) => item.files.push({ format, file, bytes: fs.statSync(path.join(DL, file)).size });

  const work = path.join(DL, `_${period}`);
  fs.rmSync(work, { recursive: true, force: true });
  fs.mkdirSync(work);
  fs.writeFileSync(path.join(work, 'README.txt'), '\ufeff' + readme(label, fc, stats));

  try {
    // GeoJSON
    fs.copyFileSync(src, path.join(work, `${base}.geojson`));
    zip(path.join(DL, `${base}_geojson.zip`), [`${base}.geojson`, 'README.txt'], work);
    add('GeoJSON', `${base}_geojson.zip`);

    // Shapefile (UTF-8 + .cpg)
    if (fc.features.length) {
      run(OGR2OGR, ['-f', 'ESRI Shapefile', `${base}.shp`, `${base}.geojson`, '-sql', `SELECT ${SHP_FIELDS} FROM "${base}"`,
        '-lco', 'ENCODING=UTF-8', '-a_srs', 'EPSG:4326', '-nlt', 'MULTIPOLYGON'], work);
      zip(path.join(DL, `${base}_shp.zip`), ['cpg', 'dbf', 'prj', 'shp', 'shx'].map((e) => `${base}.${e}`).concat('README.txt'), work);
      add('Shapefile', `${base}_shp.zip`);

      // KMZ = zip ที่มี doc.kml (เปิดใน Google Earth ได้)
      run(OGR2OGR, ['-f', 'KML', 'doc.kml', `${base}.geojson`, '-dsco', 'NameField=tb_tn', '-dsco', 'DescriptionField=last_img'], work);
      zip(path.join(DL, `${base}.kmz`), ['doc.kml'], work);
      add('KMZ', `${base}.kmz`);
    }
    console.log(`${period}: ${item.files.map((f) => `${f.file} ${(f.bytes / 1e6).toFixed(1)} MB`).join(', ')}`);
  } catch (e) {
    console.error(`${period}: แปลงไฟล์ไม่สำเร็จ ${e.stderr || e.message}`);
  }
  fs.rmSync(work, { recursive: true, force: true });
  if (item.files.length) {
    fs.rmSync(src);
    index.items.push(item);
  }
}

fs.writeFileSync(path.join(DL, 'index.json'), JSON.stringify(index, null, 1));
