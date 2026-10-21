// ย่อข้อมูล GISTDA ให้เล็กพอโหลดในเบราว์เซอร์
// - พื้นที่น้ำท่วม: ใช้รูปหกเหลี่ยม H3 จาก h3_address แทน polygon ละเอียด และเก็บเฉพาะค่าที่ใช้
// - น้ำท่วมซ้ำซาก: แสดงบนแผนที่เฉพาะพื้นที่ที่ท่วม >= FREQ_MIN ครั้ง ที่เหลือรวมเป็นสรุปรายอำเภอ

const TF = require('../public/shared');

let h3 = null;
try { h3 = require('h3-js'); } catch { /* ไม่มี h3-js ก็ใช้ polygon เดิมแบบปัดทศนิยม */ }

const FREQ_MIN = 5;

const roundCoords = (c) => (typeof c[0] === 'number' ? [+c[0].toFixed(5), +c[1].toFixed(5)] : c.map(roundCoords));
const roundGeom = (g) => (g ? { type: g.type, coordinates: roundCoords(g.coordinates) } : g);
const r0 = (v) => (v == null ? null : Math.round(v));

function hexGeometry(addr) {
  // formatAsGeoJson = true คืนวงปิดแบบ [lng, lat] แล้ว
  const ring = h3.cellToBoundary(addr, true).map(([x, y]) => [+x.toFixed(5), +y.toFixed(5)]);
  return { type: 'Polygon', coordinates: [ring] };
}

// วันที่ภาพดาวเทียมล่าสุดจาก file_name เช่น "S1D_20261016_0551, cm4_20261019_0627"
function lastImageDate(fileName) {
  const d = (String(fileName || '').match(/20\d{6}/g) || []).sort().pop();
  return d ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}` : null;
}

function slimFlood(f) {
  const p = f.properties;
  return {
    type: 'Feature',
    geometry: h3 && p.h3_address ? hexGeometry(p.h3_address) : roundGeom(f.geometry),
    properties: {
      ap: p.ap_tn, tb: p.tb_tn,
      area_m2: r0(p.f_area), cell_m2: r0(p.h3_area),
      building: p.building || 0, population: +(p.population || 0).toFixed(1),
      hospital: p.hospital || 0, school: p.school || 0, road_m: r0(p.length_road) || 0,
      rice_m2: r0(p.rice_area) || 0, maize_m2: r0(p.maize_area) || 0,
      cassava_m2: r0(p.cassava_area) || 0, sugarcane_m2: r0(p.sugarcane_area) || 0,
      image_date: lastImageDate(p.file_name),
    },
  };
}

// สำหรับไฟล์ดาวน์โหลด: เก็บรูปทรงเดิม ตัดฟิลด์ภายในระบบ เพิ่มหน่วยไร่และวันที่ภาพ
function exportFlood(f) {
  const p = f.properties;
  const dates = (String(p.file_name || '').match(/20\d{6}/g) || []).sort()
    .map((d) => `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`);
  const rai = (v) => (v == null ? null : +(v / 1600).toFixed(3));
  const fix = (v, d) => (v == null ? null : +Number(v).toFixed(d));
  return {
    type: 'Feature',
    geometry: f.geometry,
    properties: {
      pv_tn: p.pv_tn, ap_tn: p.ap_tn, tb_tn: p.tb_tn, pv_idn: p.pv_idn, ap_idn: p.ap_idn, tb_idn: p.tb_idn,
      h3_address: p.h3_address,
      flood_m2: fix(p.f_area, 2), flood_rai: rai(p.f_area), cell_m2: fix(p.h3_area, 2),
      population: fix(p.population || 0, 2), building: p.building, school: p.school, hospital: p.hospital,
      road_m: fix(p.length_road || 0, 1),
      rice_rai: rai(p.rice_area), maize_rai: rai(p.maize_area), cassava_rai: rai(p.cassava_area), sugarcane_rai: rai(p.sugarcane_area),
      first_img: dates[0] || null, last_img: dates[dates.length - 1] || null, n_images: dates.length, images: p.file_name,
    },
  };
}

const roundCoords6 = (c) => (typeof c[0] === 'number' ? [+c[0].toFixed(6), +c[1].toFixed(6)] : c.map(roundCoords6));

// สำหรับไฟล์ดาวน์โหลดน้ำท่วมซ้ำซาก: ทุกแปลง รูปทรงเดิม (ปัดทศนิยม 6 ตำแหน่ง ~0.1 ม.)
function exportFreq(f) {
  const p = f.properties;
  const years = {};
  for (const k of Object.keys(p).filter((k) => /^y_\d{4}$/.test(k)).sort()) years[k] = Number(p[k]) > 0 ? 1 : 0;
  return {
    type: 'Feature',
    geometry: f.geometry && { type: f.geometry.type, coordinates: roundCoords6(f.geometry.coordinates) },
    properties: {
      pv_tn: p.pv_tn, ap_tn: p.ap_tn, tb_tn: p.tb_tn, pv_idn: p.pv_idn, ap_idn: p.ap_idn, tb_idn: p.tb_idn,
      freq: p.freq, area_rai: p.area_rai == null ? null : +Number(p.area_rai).toFixed(3),
      years: Object.keys(years).filter((k) => years[k]).map((k) => k.slice(2)).join(', '),
      ...years,
    },
  };
}

// ดึงน้ำท่วมซ้ำซากทั้งหมด คืน { map: FeatureCollection (freq >= FREQ_MIN), summary }
// onRaw(feature) ถ้ามี จะได้ทุกแปลงสำหรับไฟล์ดาวน์โหลด
async function fetchFloodFreq(cfg, key, onRaw) {
  const byAmphoe = {};
  const fc = await TF.fetchGistda('flood-freq', cfg, key, (f) => {
    if (onRaw) onRaw(exportFreq(f));
    const p = f.properties;
    const ap = p.ap_tn || '-';
    const row = (byAmphoe[ap] ||= { ap, total_rai: 0, byFreq: {} });
    row.total_rai += p.area_rai || 0;
    row.byFreq[p.freq] = (row.byFreq[p.freq] || 0) + (p.area_rai || 0);
    if (!(p.freq >= FREQ_MIN)) return null;
    const years = Object.keys(p).filter((k) => /^y_\d{4}$/.test(k) && Number(p[k]) > 0).map((k) => k.slice(2));
    return {
      type: 'Feature',
      geometry: roundGeom(f.geometry),
      properties: { ap: p.ap_tn, tb: p.tb_tn, freq: p.freq, area_rai: +(p.area_rai || 0).toFixed(1), years: years.join(', ') },
    };
  });
  const summary = Object.values(byAmphoe)
    .map((r) => ({ ...r, total_rai: Math.round(r.total_rai), byFreq: Object.fromEntries(Object.entries(r.byFreq).map(([k, v]) => [k, Math.round(v)])) }))
    .sort((a, b) => b.total_rai - a.total_rai);
  return { map: fc, summary: { freqMin: FREQ_MIN, amphoe: summary } };
}

const SLIM = { '1day': slimFlood, '3days': slimFlood, '7days': slimFlood, '30days': slimFlood };

module.exports = { SLIM, exportFlood, exportFreq, fetchFloodFreq, FREQ_MIN, hasH3: !!h3 };
