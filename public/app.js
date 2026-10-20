// หน้าเว็บติดตามสถานการณ์น้ำ จ.กำแพงเพชร
const LEVELS = {
  5: { text: 'ล้นตลิ่ง', color: '#e03131' },
  4: { text: 'น้ำมาก', color: '#1c5fd6' },
  3: { text: 'ปกติ', color: '#2f9e44' },
  2: { text: 'น้ำน้อย', color: '#f2b705' },
  1: { text: 'น้อยวิกฤต', color: '#8a1c1c' },
};
const RIVER_POINTS = [
  { name: 'ปิง (เมืองตาก, ต้นน้ำ)', lat: 16.88, lon: 99.12, color: '#868e96' },
  { name: 'ปิง (เมืองกำแพงเพชร)', lat: 16.48, lon: 99.52, color: '#1c5fd6' },
  { name: 'ปิง (ขาณุวรลักษบุรี)', lat: 16.06, lon: 99.86, color: '#e8590c' },
];
const REFRESH_MS = 10 * 60 * 1000;

let cfg, map, wlLayer, rainLayer, floodLayer, radarLayer;
let wlChart, rainChart, qChart;
let stations = [];
let selectedId = null;
let last = {};

const $ = (s) => document.querySelector(s);
const fmt = (v, d = 2) => (v === null || v === undefined || Number.isNaN(v) ? '–' : Number(v).toFixed(d));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// โหมด server: เรียกผ่าน server.js (/api/*)
// โหมด static (เช่น GitHub Pages): ไม่มี server จึงเรียก ThaiWater ตรงจากเบราว์เซอร์
let staticMode = false;

async function api(path) {
  if (staticMode) return staticApi(path);
  const r = await fetch(path);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
  return j;
}

async function fetchJson(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status} จาก ${new URL(url).host}`);
  return r.json();
}

async function staticApi(path) {
  const u = new URL(path, location.href);
  const p = u.pathname.replace(/^.*\/api\//, '');
  const TF = window.TrackFlood;
  if (p === 'config') return { ...TF.SETTINGS, hasGistda: false, static: true };
  if (p === 'waterlevel') return { data: TF.parseWaterLevels(await fetchJson(TF.URLS.waterlevel), cfg) };
  if (p === 'rain') return { data: TF.parseRain(await fetchJson(TF.URLS.rain), cfg) };
  if (p === 'dams') return { data: TF.parseDams(await fetchJson(TF.URLS.main)) };
  if (p === 'waterlevel/graph') {
    return { data: TF.parseGraph(await fetchJson(TF.URLS.graph(u.searchParams.get('id'), Number(u.searchParams.get('days') || 7)))) };
  }
  throw new Error('ข้อมูลนี้ต้องรันผ่าน server.js');
}

function setKpi(id, val, note, color) {
  const el = $(id);
  el.querySelector('.val').textContent = val;
  el.querySelector('.note').textContent = note || '';
  el.style.borderLeftColor = color || 'var(--line)';
}

function rainColor(mm) {
  if (mm >= 90) return '#c92a2a';
  if (mm >= 35) return '#e8590c';
  if (mm >= 10) return '#7048e8';
  if (mm > 0) return '#91a7ff';
  return '#adb5bd';
}

// ---------------- แผนที่ ----------------
function initMap() {
  map = L.map('map', { zoomControl: true }).setView([cfg.center.lat, cfg.center.lon], 9);

  const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19, attribution: '&copy; OpenStreetMap',
  });
  const esri = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 19, attribution: 'Imagery &copy; Esri',
  });
  const bases = {};
  if (cfg.longdoKey) {
    const longdo = (mode) => L.tileLayer(
      `https://ms.longdo.com/mmmap/tile.php?zoom={z}&x={x}&y={y}&key=${encodeURIComponent(cfg.longdoKey)}&proj=epsg3857&mode=${mode}&HD=1`,
      { maxZoom: 20, attribution: '&copy; Longdo Map' });
    bases['Longdo Map'] = longdo('icons');
    bases['Longdo ภาพดาวเทียม'] = longdo('bluemarble_terrain');
  }
  bases['OpenStreetMap'] = osm;
  bases['ภาพถ่ายดาวเทียม (Esri)'] = esri;
  Object.values(bases)[0].addTo(map);

  wlLayer = L.layerGroup().addTo(map);
  rainLayer = L.layerGroup().addTo(map);
  floodLayer = L.geoJSON(null, {
    style: { color: '#ff6b00', weight: 0.5, fillColor: '#ff6b00', fillOpacity: 0.55 },
    onEachFeature: (f, layer) => layer.bindPopup(propsTable(f.properties)),
  }).addTo(map);
  radarLayer = L.layerGroup();

  L.circle([cfg.center.lat, cfg.center.lon], {
    radius: cfg.radiusKm * 1000, color: '#0b6bcb', weight: 1.5, dashArray: '6 6', fill: false, interactive: false,
  }).addTo(map);
  L.marker([cfg.center.lat, cfg.center.lon], { title: 'ตัวเมืองกำแพงเพชร' })
    .addTo(map).bindPopup('<b>อ.เมืองกำแพงเพชร</b><br>จ.กำแพงเพชร');

  L.control.layers(bases, {
    'ระดับน้ำ (สสน.)': wlLayer,
    'ฝน 24 ชม. (สสน.)': rainLayer,
    'น้ำท่วมจากดาวเทียม (GISTDA)': floodLayer,
    'เรดาร์ฝนล่าสุด (RainViewer)': radarLayer,
  }, { collapsed: window.innerWidth < 900 }).addTo(map);

  map.on('overlayadd', (e) => { if (e.layer === radarLayer) loadRadar(); });
}

function propsTable(p) {
  const rows = Object.entries(p || {})
    .filter(([k, v]) => v !== null && typeof v !== 'object' && !/^_/.test(k))
    .slice(0, 14)
    .map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join('');
  return `<b>พื้นที่น้ำท่วม (GISTDA)</b><table>${rows}</table>`;
}

async function loadRadar() {
  try {
    const j = await fetch('https://api.rainviewer.com/public/weather-maps.json').then((r) => r.json());
    const last = j.radar.past[j.radar.past.length - 1];
    radarLayer.clearLayers();
    L.tileLayer(`${j.host}${last.path}/256/{z}/{x}/{y}/2/1_1.png`, {
      opacity: 0.7, maxNativeZoom: 7, maxZoom: 19, attribution: 'Radar &copy; RainViewer',
    }).addTo(radarLayer);
  } catch (e) { console.warn('radar', e); }
}

// ---------------- ระดับน้ำ ----------------
async function loadWaterLevels() {
  const { data } = await api('api/waterlevel');
  stations = data;
  wlLayer.clearLayers();
  for (const s of data) {
    const lv = LEVELS[s.level] || { text: 'ไม่ทราบ', color: '#868e96' };
    const m = L.circleMarker([s.lat, s.lon], {
      radius: 8, color: '#fff', weight: 1.5, fillColor: lv.color, fillOpacity: 0.95,
    }).addTo(wlLayer);
    m.bindPopup(`
      <b>${esc(s.name)}</b> ${s.code ? `(${esc(s.code)})` : ''}<br>
      ${esc(s.river || '')} · อ.${esc(s.amphoe)} จ.${esc(s.province)}<br>
      ระดับน้ำ <b>${fmt(s.wlMsl)}</b> ม.รทก. · ตลิ่ง ${fmt(s.bankMsl)} ม.รทก.<br>
      ${esc(s.diffBankText || '')} ${fmt(s.diffBank)} · ความจุลำน้ำ ${fmt(s.storagePercent, 0)}%<br>
      สถานะ: <b style="color:${lv.color}">${lv.text}</b> · ${esc(s.datetime)} (${esc(s.agency)})`);
    m.on('click', () => selectStation(s.id));
  }
  renderStationList();

  const inProv = data.filter((s) => s.inProvince);
  const nearOverflow = inProv.filter((s) => s.level === 5);
  const high = inProv.filter((s) => s.level === 4);
  const outside = data.filter((s) => !s.inProvince && s.level === 5).length;
  setKpi('#kpi-overflow', `${nearOverflow.length} / ${inProv.length}`,
    (nearOverflow.length ? `เช่น ${nearOverflow[0].name} · ` : '') + `น้ำมาก ${high.length} แห่ง · นอกจังหวัดล้นตลิ่ง ${outside} แห่ง`,
    nearOverflow.length ? LEVELS[5].color : high.length ? LEVELS[4].color : LEVELS[3].color);

  if (!selectedId && data.length) selectStation((nearOverflow[0] || data[0]).id);
  return { nearOverflow, high };
}

function renderStationList() {
  $('#stations').innerHTML = stations.map((s) => {
    const lv = LEVELS[s.level] || { text: '–', color: '#868e96' };
    const delta = s.wlMsl != null && s.wlPrev != null ? s.wlMsl - s.wlPrev : null;
    const trend = delta == null ? '' : delta > 0.005 ? `<span class="up">▲ ${fmt(delta)}</span>` : delta < -0.005 ? `<span class="down">▼ ${fmt(-delta)}</span>` : '■ ทรงตัว';
    return `<div class="st ${s.id === selectedId ? 'active' : ''}" data-id="${s.id}">
      <span class="dot" style="background:${lv.color}"></span>
      <div><div class="name">${esc(s.name)}</div>
        <div class="meta">${esc(s.river || '')} · ${esc(s.province)} · ${s.distanceKm} กม.</div></div>
      <div class="wl"><b>${fmt(s.wlMsl)}</b> ม.<small style="color:${lv.color}">${lv.text} ${s.storagePercent != null ? fmt(s.storagePercent, 0) + '%' : ''}</small><small>${trend}</small></div>
    </div>`;
  }).join('') || '<p class="hint">ไม่มีข้อมูล</p>';
  $('#stations').querySelectorAll('.st').forEach((el) =>
    el.addEventListener('click', () => {
      const s = stations.find((x) => String(x.id) === el.dataset.id);
      selectStation(s.id);
      map.setView([s.lat, s.lon], 12);
    }));
}

async function selectStation(id) {
  selectedId = id;
  const s = stations.find((x) => x.id === id);
  if (!s) return;
  renderStationList();
  $('#graph-title').textContent = `ระดับน้ำย้อนหลัง 7 วัน: ${s.name}`;
  $('#graph-hint').textContent = `${s.river || ''} · หน่วย ม.รทก. · เส้นประแดง = ระดับตลิ่ง`;
  try {
    const { data } = await api(`api/waterlevel/graph?id=${id}&days=7`);
    const pts = data.filter((p) => p.v !== null);
    const labels = pts.map((p) => p.t.slice(5, 16));
    const ds = [{
      label: 'ระดับน้ำ', data: pts.map((p) => +p.v.toFixed(2)), borderColor: '#0b6bcb',
      backgroundColor: 'rgba(11,107,203,.12)', fill: true, pointRadius: 0, tension: 0.2, borderWidth: 2,
    }];
    if (s.bankMsl != null) ds.push({
      label: 'ตลิ่ง', data: pts.map(() => s.bankMsl), borderColor: '#e03131',
      borderDash: [6, 4], pointRadius: 0, borderWidth: 1.5, fill: false,
    });
    wlChart = drawChart(wlChart, '#wl-chart', 'line', labels, ds, { maxTicksLimit: 8 });
  } catch (e) {
    $('#graph-hint').textContent = 'โหลดกราฟไม่สำเร็จ: ' + e.message;
  }
}

// ---------------- ฝน ----------------
async function loadRain() {
  const { data } = await api('api/rain');
  rainLayer.clearLayers();
  for (const r of data) {
    const mm = r.rain24h ?? 0;
    L.circleMarker([r.lat, r.lon], {
      radius: 4 + Math.min(12, Math.sqrt(mm) * 1.3), color: rainColor(mm), weight: 1,
      fillColor: rainColor(mm), fillOpacity: 0.35,
    }).addTo(rainLayer).bindPopup(
      `<b>${esc(r.name)}</b><br>อ.${esc(r.amphoe)} จ.${esc(r.province)}<br>ฝน 24 ชม. <b>${fmt(mm, 1)}</b> มม.<br>${esc(r.datetime)} (${esc(r.agency)})`);
  }
  $('#rain-table tbody').innerHTML = data
    .slice().sort((a, b) => (b.rain24h ?? 0) - (a.rain24h ?? 0)).slice(0, 25)
    .map((r) => `<tr><td>${esc(r.name)}</td><td>${esc(r.amphoe)} / ${esc(r.province)}</td><td class="num">${r.distanceKm}</td>
      <td class="num" style="color:${rainColor(r.rain24h)}"><b>${fmt(r.rain24h, 1)}</b></td><td>${esc(r.datetime)}</td><td>${esc(r.agency)}</td></tr>`)
    .join('');

  const local = data.filter((r) => r.inProvince);
  if (local.length) {
    const max = local.reduce((a, b) => ((b.rain24h ?? 0) > (a.rain24h ?? 0) ? b : a));
    setKpi('#kpi-rain', `${fmt(max.rain24h, 1)} มม.`, `${max.name} อ.${max.amphoe} · ${max.datetime}`, rainColor(max.rain24h));
  } else {
    setKpi('#kpi-rain', '–', 'ไม่พบสถานีในจังหวัด');
  }
  return local;
}

// ---------------- GISTDA ----------------
async function loadFlood() {
  floodLayer.clearLayers();
  if (!cfg.hasGistda) {
    setKpi('#kpi-flood', 'ไม่มี key', cfg.static ? 'ดูได้เมื่อรันผ่าน server.js พร้อม GISTDA_API_KEY' : 'ใส่ GISTDA_API_KEY ในไฟล์ .env');
    return null;
  }
  const period = $('#gistda-period').value;
  setKpi('#kpi-flood', '…', 'กำลังโหลด');
  try {
    const fc = await api(`api/gistda/flood?period=${period}`);
    floodLayer.addData(fc);
    const areaKey = (p) => p.area_rai ?? p.rai ?? null;
    const raiTotal = fc.features.reduce((s, f) => s + (Number(areaKey(f.properties || {})) || 0), 0);
    const label = $('#gistda-period').selectedOptions[0].textContent;
    setKpi('#kpi-flood',
      raiTotal ? `${Math.round(raiTotal).toLocaleString('th-TH')} ไร่` : `${fc.features.length.toLocaleString('th-TH')} แปลง`,
      `จ.${cfg.province} ย้อนหลัง ${label}`,
      fc.features.length ? '#ff6b00' : LEVELS[3].color);
    return { total: fc.features.length };
  } catch (e) {
    setKpi('#kpi-flood', 'ผิดพลาด', e.message, '#868e96');
    return null;
  }
}

// ---------------- พยากรณ์ (Open-Meteo) ----------------
async function loadForecast() {
  const { lat, lon } = cfg.center;
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&daily=precipitation_sum,precipitation_probability_max&past_days=3&forecast_days=10&timezone=Asia%2FBangkok`;
  const j = await fetch(url).then((r) => r.json());
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Bangkok' });
  const labels = j.daily.time.map((t) => (t === today ? 'วันนี้' : t.slice(5)));
  const colors = j.daily.time.map((t) => (t < today ? 'rgba(134,142,150,.6)' : '#7048e8'));
  rainChart = drawChart(rainChart, '#rain-chart', 'bar', labels, [
    { type: 'bar', label: 'ฝน (มม.)', data: j.daily.precipitation_sum, backgroundColor: colors, yAxisID: 'y', borderRadius: 3 },
    { type: 'line', label: 'โอกาสฝน (%)', data: j.daily.precipitation_probability_max, borderColor: '#f59f00', pointRadius: 2, borderWidth: 1.5, yAxisID: 'y1' },
  ], { y1: true });

  const idx = j.daily.time.indexOf(today);
  const next7 = j.daily.precipitation_sum.slice(idx, idx + 7).reduce((a, b) => a + (b || 0), 0);
  const maxDay = Math.max(...j.daily.precipitation_sum.slice(idx, idx + 7));
  setKpi('#kpi-forecast', `${fmt(next7, 0)} มม.`, `สูงสุด ${fmt(maxDay, 1)} มม./วัน`,
    maxDay >= 35 ? '#e8590c' : maxDay >= 10 ? '#7048e8' : LEVELS[3].color);
  return { next7, maxDay };
}

async function loadDischarge() {
  const res = await Promise.all(RIVER_POINTS.map((p) =>
    fetch(`https://flood-api.open-meteo.com/v1/flood?latitude=${p.lat}&longitude=${p.lon}&daily=river_discharge&past_days=14&forecast_days=21`)
      .then((r) => r.json())));
  const labels = res[0].daily.time.map((t) => t.slice(5));
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Bangkok' });
  const todayIdx = res[0].daily.time.indexOf(today);
  qChart = drawChart(qChart, '#q-chart', 'line', labels, res.map((r, i) => ({
    label: RIVER_POINTS[i].name, data: r.daily.river_discharge, borderColor: RIVER_POINTS[i].color,
    pointRadius: 0, borderWidth: 2, tension: 0.25,
    segment: { borderDash: (ctx) => (ctx.p0DataIndex >= todayIdx ? [5, 4] : undefined) },
  })), { maxTicksLimit: 10 });
}

// ---------------- เขื่อน ----------------
async function loadDams() {
  const { data } = await api('api/dams');
  $('#dams tbody').innerHTML = data.map((d) => {
    const pct = d.storagePercent ?? 0;
    const c = pct >= 100 ? LEVELS[5].color : pct >= 80 ? LEVELS[4].color : pct >= 30 ? LEVELS[3].color : LEVELS[2].color;
    return `<tr><td>${esc(d.name)}<br><span class="hint">${esc(d.province)}</span></td>
      <td class="num"><b style="color:${c}">${fmt(pct, 1)}</b><span class="bar"><b style="width:${Math.min(100, pct)}%;background:${c}"></b></span></td>
      <td class="num">${fmt(d.inflow)}</td><td class="num">${fmt(d.released)}</td></tr>`;
  }).join('');
}

// ---------------- Chart helper ----------------
function drawChart(existing, sel, type, labels, datasets, opt = {}) {
  if (existing) existing.destroy();
  const ink = getComputedStyle(document.body).color;
  const grid = 'rgba(128,128,128,.18)';
  const scales = {
    x: { ticks: { color: ink, maxTicksLimit: opt.maxTicksLimit || 14, maxRotation: 0 }, grid: { display: false } },
    y: { ticks: { color: ink }, grid: { color: grid } },
  };
  if (opt.y1) scales.y1 = { position: 'right', min: 0, max: 100, ticks: { color: ink }, grid: { display: false } };
  return new Chart(document.querySelector(sel), {
    type, data: { labels, datasets },
    options: {
      responsive: true, maintainAspectRatio: false, animation: false,
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { labels: { color: ink, boxWidth: 12 } } },
      scales,
    },
  });
}

// ---------------- ภาพรวม ----------------
function overall({ wl, rain, fc, flood }) {
  const near = wl?.nearOverflow?.length || 0;
  const localRain = Math.max(0, ...(rain || []).map((r) => r.rain24h || 0));
  let level = 0;
  const reasons = [];
  if (flood?.total) { level = Math.max(level, 2); reasons.push(`ดาวเทียมพบพื้นที่น้ำท่วม ${flood.total} แปลง`); }
  if (near) { level = Math.max(level, near >= 3 ? 3 : 2); reasons.push(`สถานีในจังหวัดล้นตลิ่ง ${near} แห่ง`); }
  else if (wl?.high?.length) { level = Math.max(level, 1); reasons.push(`สถานีน้ำมาก ${wl.high.length} แห่ง`); }
  if (localRain >= 90) { level = Math.max(level, 3); reasons.push('ฝนหนักมากใน 24 ชม.'); }
  else if (localRain >= 35) { level = Math.max(level, 2); reasons.push('ฝนหนักใน 24 ชม.'); }
  if (fc?.maxDay >= 35) { level = Math.max(level, 2); reasons.push('คาดการณ์ฝนหนักใน 7 วัน'); }
  else if (fc?.maxDay >= 10 && level < 1) { level = 1; reasons.push('คาดการณ์ฝนปานกลาง'); }
  const L = [
    ['ปกติ', LEVELS[3].color],
    ['เฝ้าระวัง', '#f2b705'],
    ['เฝ้าระวังสูง', '#e8590c'],
    ['วิกฤต', LEVELS[5].color],
  ][level];
  setKpi('#kpi-status', L[0], reasons.join(' · ') || 'ไม่พบปัจจัยเสี่ยง', L[1]);
}

async function refreshAll() {
  $('#updated').textContent = 'กำลังโหลด…';
  const settle = (p) => p.then((v) => v, (e) => { console.error(e); return null; });
  const [wl, rain, fc, flood] = await Promise.all([
    settle(loadWaterLevels()), settle(loadRain()), settle(loadForecast()), settle(loadFlood()),
    settle(loadDischarge()), settle(loadDams()),
  ]);
  last = { wl, rain, fc, flood };
  overall(last);
  if (map.hasLayer(radarLayer)) loadRadar();
  $('#updated').textContent = 'อัปเดต ' + new Date().toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' });
}

(async function main() {
  try {
    cfg = await api('api/config');
  } catch (e) {
    staticMode = true;
    cfg = await api('api/config');
  }
  document.querySelectorAll('.r').forEach((el) => (el.textContent = cfg.radiusKm));
  initMap();
  $('#refresh').addEventListener('click', refreshAll);
  $('#gistda-period').addEventListener('change', async () => {
    last.flood = await loadFlood();
    overall(last);
  });
  await refreshAll();
  setInterval(refreshAll, REFRESH_MS);
})();
