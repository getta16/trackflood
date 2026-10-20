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

let cfg, map, wlLayer, rainLayer, floodLayer, radarLayer, freqLayer, hyacinthLayer, floodTiles;
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
  if (p === 'config') {
    // ข้อมูล GISTDA ถูกดึงล่วงหน้าโดย GitHub Actions ไว้ที่ data/gistda/
    const meta = await fetchJson('data/gistda/meta.json').catch(() => null);
    return { ...TF.SETTINGS, static: true, hasGistda: !!meta, gistdaUpdated: meta?.updated };
  }
  if (p.startsWith('gistda/')) {
    const name = p.slice(7);
    if (!TF.GISTDA.datasets[name] && name !== 'flood-freq-summary') throw new Error('ไม่รู้จักชุดข้อมูล ' + name);
    return fetchJson(`data/gistda/${name}.json`);
  }
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
  const gistdaLayer = (title, color, opacity) => L.geoJSON(null, {
    style: typeof color === 'function' ? color : { color, weight: 0.5, fillColor: color, fillOpacity: opacity },
    pointToLayer: (f, ll) => L.circleMarker(ll, { radius: 5, color, fillColor: color, fillOpacity: 0.8, weight: 1 }),
    onEachFeature: (f, layer) => layer.bindPopup(propsTable(title, f)),
  });
  // ความเข้มสี = สัดส่วนพื้นที่ที่ท่วมในเซลล์ H3
  floodLayer = gistdaLayer('พื้นที่น้ำท่วม (GISTDA)', (f) => {
    const p = f.properties, frac = p.cell_m2 ? Math.min(1, p.area_m2 / p.cell_m2) : 0.5;
    return { color: '#ff6b00', weight: 0.3, fillColor: '#ff6b00', fillOpacity: 0.25 + 0.6 * frac };
  }).addTo(map);
  freqLayer = gistdaLayer('พื้นที่น้ำท่วมซ้ำซาก (GISTDA)', (f) => {
    const n = f.properties.freq || 5;
    return { color: '#ae3ec9', weight: 0.4, fillColor: n >= 7 ? '#5f0f7a' : n >= 6 ? '#862e9c' : '#ae3ec9', fillOpacity: 0.6 };
  });
  hyacinthLayer = gistdaLayer('ผักตบชวา / สิ่งกีดขวางทางน้ำ (GISTDA)', '#2b8a3e', 0.7);
  radarLayer = L.layerGroup();
  // tile ภาพน้ำท่วมทั้งประเทศ ใช้ได้เฉพาะตอนรันผ่าน server.js (ต้องแนบ key)
  floodTiles = cfg.hasGistda && !cfg.static
    ? L.tileLayer('api/gistda/tms/7days/{z}/{x}/{y}', { opacity: 0.8, attribution: 'Flood &copy; GISTDA' })
    : null;

  L.circle([cfg.center.lat, cfg.center.lon], {
    radius: cfg.radiusKm * 1000, color: '#0b6bcb', weight: 1.5, dashArray: '6 6', fill: false, interactive: false,
  }).addTo(map);
  L.marker([cfg.center.lat, cfg.center.lon], { title: 'ตัวเมืองกำแพงเพชร' })
    .addTo(map).bindPopup('<b>อ.เมืองกำแพงเพชร</b><br>จ.กำแพงเพชร');

  L.control.layers(bases, {
    'ระดับน้ำ (สสน.)': wlLayer,
    'ฝน 24 ชม. (สสน.)': rainLayer,
    'น้ำท่วมจากดาวเทียม (GISTDA)': floodLayer,
    ...(floodTiles ? { 'น้ำท่วมทั้งประเทศ แบบภาพ (GISTDA)': floodTiles } : {}),
    'น้ำท่วมซ้ำซาก (GISTDA)': freqLayer,
    'ผักตบชวา (GISTDA)': hyacinthLayer,
    'เรดาร์ฝนล่าสุด (RainViewer)': radarLayer,
  }, { collapsed: window.innerWidth < 900 }).addTo(map);

  map.on('overlayadd', (e) => {
    if (e.layer === radarLayer) loadRadar();
    if (e.layer === freqLayer) loadGistdaOnce(freqLayer, 'flood-freq');
    if (e.layer === hyacinthLayer) loadGistdaOnce(hyacinthLayer, 'water_hyacinth');
    if (e.layer === floodTiles) floodTiles.setUrl(`api/gistda/tms/${$('#gistda-period').value}/{z}/{x}/{y}`);
  });
}

const PROP_LABELS = {
  name: ['ชื่อลำน้ำ'], river: ['ลุ่มน้ำย่อย'], tb: ['ตำบล'], ap: ['อำเภอ'], pv: ['จังหวัด'],
  area_m2: ['พื้นที่ท่วม', (v) => `${fmt(v / 1600, 1)} ไร่`], area_rai: ['พื้นที่', (v) => `${fmt(v, 1)} ไร่`],
  freq: ['ท่วมซ้ำ', (v) => `${v} ปี (จาก 14 ปี)`], years: ['ปีที่ท่วม'],
  population: ['ประชากรโดยประมาณ', (v) => fmt(v, 0) + ' คน'], building: ['อาคาร'], school: ['โรงเรียน'], hospital: ['โรงพยาบาล'],
  road_m: ['ถนน', (v) => fmt(v / 1000, 2) + ' กม.'], rice_m2: ['นาข้าว', (v) => fmt(v / 1600, 1) + ' ไร่'],
  maize_m2: ['ข้าวโพด', (v) => fmt(v / 1600, 1) + ' ไร่'], cassava_m2: ['มันสำปะหลัง', (v) => fmt(v / 1600, 1) + ' ไร่'],
  sugarcane_m2: ['อ้อย', (v) => fmt(v / 1600, 1) + ' ไร่'], image_date: ['ภาพดาวเทียมล่าสุด'], agency: ['หน่วยงาน'], image: ['ภาพที่ใช้'],
};
function propsTable(title, f) {
  const rows = Object.entries(f.properties || {})
    .filter(([k, v]) => PROP_LABELS[k] && v !== null && v !== '' && v !== 0)
    .map(([k, v]) => `<tr><td>${PROP_LABELS[k][0]}</td><td>${esc(PROP_LABELS[k][1] ? PROP_LABELS[k][1](v) : v)}</td></tr>`).join('');
  return `<b>${esc(title)}</b><table>${rows}</table>`;
}

// พื้นที่ท่วมจริง (ตร.ม.) ใช้ค่าจาก GISTDA ถ้ามี ไม่งั้นคำนวณจากรูปทรง
const floodM2 = (f) => f.properties?.area_m2 ?? window.TrackFlood.areaM2(f.geometry);

function renderImpact(fc) {
  const rows = {};
  for (const f of fc.features) {
    const p = f.properties, k = p.ap || '-';
    const r = (rows[k] ||= { ap: k, m2: 0, pop: 0, bld: 0, school: 0, hosp: 0, rice: 0, road: 0 });
    r.m2 += floodM2(f); r.pop += p.population || 0; r.bld += p.building || 0; r.school += p.school || 0;
    r.hosp += p.hospital || 0; r.rice += p.rice_m2 || 0; r.road += p.road_m || 0;
  }
  const list = Object.values(rows).sort((a, b) => b.m2 - a.m2);
  const n = (v, d = 0) => Number(v).toLocaleString('th-TH', { maximumFractionDigits: d });
  $('#impact tbody').innerHTML = list.map((r) => `<tr><td>${esc(r.ap)}</td><td class="num"><b>${n(r.m2 / 1600)}</b></td>
    <td class="num">${n(r.rice / 1600)}</td><td class="num">${n(r.pop)}</td><td class="num">${n(r.bld)}</td>
    <td class="num">${n(r.school)}</td><td class="num">${n(r.hosp)}</td><td class="num">${n(r.road / 1000, 1)}</td></tr>`).join('')
    || '<tr><td colspan="8" class="hint">ไม่พบพื้นที่น้ำท่วมในช่วงนี้</td></tr>';
}

async function loadFreqSummary() {
  if (!cfg.hasGistda) return;
  try {
    const s = await api('api/gistda/flood-freq-summary');
    const n = (v) => Number(v || 0).toLocaleString('th-TH');
    $('#freq-table thead tr').innerHTML = '<th>อำเภอ</th><th class="num">รวม (ไร่)</th>' +
      [1, 2, 3, 4, 5, 6, 7].map((k) => `<th class="num">${k} ปี${k === 7 ? '+' : ''}</th>`).join('');
    $('#freq-table tbody').innerHTML = s.amphoe.map((r) => {
      const plus7 = Object.entries(r.byFreq).filter(([k]) => +k >= 7).reduce((a, [, v]) => a + v, 0);
      return `<tr><td>${esc(r.ap)}</td><td class="num"><b>${n(r.total_rai)}</b></td>` +
        [1, 2, 3, 4, 5, 6].map((k) => `<td class="num">${n(r.byFreq[k])}</td>`).join('') + `<td class="num">${n(plus7)}</td></tr>`;
    }).join('');
    $('#freq-hint').textContent = `จำนวนปีที่ถูกน้ำท่วมในช่วง 2554–2567 · บนแผนที่แสดงเฉพาะพื้นที่ที่ท่วม ${s.freqMin} ปีขึ้นไป`;
  } catch (e) {
    $('#freq-hint').textContent = 'โหลดไม่สำเร็จ: ' + e.message;
  }
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
    setKpi('#kpi-flood', 'ไม่มี key', cfg.static ? 'ตั้ง GISTDA_API_KEY ใน GitHub Secrets' : 'ใส่ GISTDA_API_KEY ในไฟล์ .env');
    return null;
  }
  const period = $('#gistda-period').value;
  setKpi('#kpi-flood', '…', 'กำลังโหลด');
  try {
    const fc = await api(`api/gistda/${period}`);
    floodLayer.addData(fc);
    if (floodTiles) floodTiles.setUrl(`api/gistda/tms/${period}/{z}/{x}/{y}`);
    const rai = fc.features.reduce((s, f) => s + floodM2(f), 0) / 1600;
    const pop = fc.features.reduce((s, f) => s + (f.properties.population || 0), 0);
    renderImpact(fc);
    const label = $('#gistda-period').selectedOptions[0].textContent;
    const when = fc.updated || cfg.gistdaUpdated;
    setKpi('#kpi-flood',
      `${Math.round(rai).toLocaleString('th-TH')} ไร่`,
      `จ.${cfg.province} ย้อนหลัง ${label} · ประชากรในพื้นที่ ~${Math.round(pop).toLocaleString('th-TH')} คน` +
        (when ? ` · ดึงเมื่อ ${new Date(when).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' })}` : ''),
      fc.features.length ? '#ff6b00' : LEVELS[3].color);
    return { total: fc.features.length, rai };
  } catch (e) {
    setKpi('#kpi-flood', 'ผิดพลาด', e.message, '#868e96');
    return null;
  }
}

const gistdaLoaded = new Set();
async function loadGistdaOnce(layer, name) {
  if (!cfg.hasGistda || gistdaLoaded.has(name)) return;
  gistdaLoaded.add(name);
  try {
    layer.addData(await api(`api/gistda/${name}`));
  } catch (e) {
    gistdaLoaded.delete(name);
    console.warn(name, e);
  }
}

// ไฟล์ดาวน์โหลด สร้างโดย scripts/build-downloads.js ใน GitHub Actions
async function loadDownloads() {
  const box = $('#downloads');
  let idx;
  try {
    idx = await fetchJson('data/gistda/downloads/index.json');
  } catch {
    box.innerHTML = '<p class="hint">ยังไม่มีไฟล์ดาวน์โหลด (ต้องตั้ง GISTDA_API_KEY แล้วให้ GitHub Actions สร้างไฟล์)</p>';
    return;
  }
  const mb = (b) => (b >= 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1e3))} KB`);
  const d = (s) => (s ? new Date(s).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' }) : '-');
  box.innerHTML = idx.items.map((it) => `
    <div class="dl-item">
      <h3>${esc(it.title || 'พื้นที่น้ำท่วม ' + it.label)}</h3>
      <div class="meta">${it.count.toLocaleString('th-TH')} แปลง · ${it.rai.toLocaleString('th-TH')} ไร่ · ${it.years ? `ข้อมูลปี ${esc(it.years)}` : `ภาพดาวเทียม ${d(it.from)} – ${d(it.to)}`}</div>
      <div class="dl-btns">${it.files.map((f) => `
        <a class="btn dl" href="data/gistda/downloads/${encodeURIComponent(f.file)}" download>${esc(f.format)}<small>${mb(f.bytes)}</small></a>`).join('')}
      </div>
    </div>`).join('') || '<p class="hint">ไม่มีข้อมูลพื้นที่น้ำท่วมในช่วงนี้</p>';
  box.insertAdjacentHTML('beforeend', `<p class="hint" style="grid-column:1/-1;margin:0">สร้างไฟล์เมื่อ ${new Date(idx.updated).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })} · อัปเดตทุก 3 ชั่วโมง</p>`);
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
  if (flood?.total) { level = Math.max(level, 2); reasons.push(`ดาวเทียมพบน้ำท่วม ~${Math.round(flood.rai).toLocaleString('th-TH')} ไร่`); }
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
  loadFreqSummary();
  loadDownloads();
  setInterval(refreshAll, REFRESH_MS);
})();
