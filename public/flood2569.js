// หน้าสรุปอุทกภัย จ.กำแพงเพชร ปี 2569 (ข้อมูลจาก flood2569-data.js)
const D = window.FLOOD2569;
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const rows = (sel, list, fn) => { $(sel + ' tbody').innerHTML = list.map(fn).join(''); };
const markers = {};
let map;
// ระลอก 1–2 คือจุดที่รายงานต่อเนื่องทั้งสองระลอก
const WAVE_ORDER = ['1', '1-2', '2', '3'];

function renderText() {
  const s = D.source;
  $('#facts').innerHTML = D.facts.map(([lbl, val, note]) =>
    `<div class="kpi"><span class="lbl">${esc(lbl)}</span><b class="val">${esc(val)}</b><span class="note">${esc(note)}</span></div>`).join('');
  $('#source-text').innerHTML = `เรียบเรียงจากรายงานสถานการณ์อุทกภัย <b>${s.reports} ฉบับ</b> ของ<b>${esc(s.agency)}</b>
    ข้อมูลระหว่าง ${esc(s.period)} (สรุปเมื่อ ${esc(s.compiled)}) รายชื่อรายงานอยู่ท้ายหน้า`;
  $('#notes').innerHTML = D.notes.map((n) => `<li>${esc(n)}</li>`).join('');

  rows('#waves', ['1', '2', '3'], (k) => {
    const w = D.waves[k];
    return `<tr><td><i class="sw" style="background:${w.color}"></i><b>${esc(w.name)}</b></td><td>${esc(w.period)}</td><td>${esc(w.area)}</td>
      <td>${esc(w.river)}</td><td>${esc(w.cause)}</td><td>${esc(w.impact)}</td><td>${esc(w.end)}</td></tr>`;
  });
  rows('#points', D.points, (p) => {
    const w = D.waves[p.event];
    return `<tr data-id="${p.id}"><td class="num">${p.id}</td><td><b>${esc(p.name)}</b><div class="meta">${esc(p.kind)}</div></td>
      <td>ต.${esc(p.tambon)}<div class="meta">อ.${esc(p.amphoe)}</div></td><td>${esc(p.river)}</td>
      <td><i class="sw" style="background:${w.color}"></i>${esc(w.name)}</td><td>${esc(p.first)} – ${esc(p.last)}</td>
      <td>${esc(p.maxd)}</td><td>${esc(p.status)}</td></tr>`;
  });
  rows('#rain', D.rain, ([when, amphoe, mm]) => `<tr><td>${esc(when)}</td><td>${esc(amphoe)}</td><td class="num"><b>${mm}</b></td></tr>`);
  rows('#actions', D.actions, (a) => `<tr>${a.map((x) => `<td>${esc(x)}</td>`).join('')}</tr>`);
  rows('#files', s.files, ([f, when]) => `<tr><td>${esc(f)}</td><td>${esc(when)}</td></tr>`);

  document.querySelectorAll('#points tbody tr').forEach((tr) => tr.addEventListener('click', () => {
    const m = markers[tr.dataset.id];
    map.setView(m.getLatLng(), 12);
    m.openPopup();
    $('#map').scrollIntoView({ behavior: 'smooth', block: 'center' });
  }));
}

function popup(p) {
  const w = D.waves[p.event];
  const series = p.series.length
    ? `<table class="series"><tr>${p.series.map((x) => `<td>${esc(x[0])}</td>`).join('')}</tr>
       <tr>${p.series.map((x) => `<td><b>${esc(x[1])}</b></td>`).join('')}</tr></table>`
    : '';
  return `<b>${p.id}. ${esc(p.name)}</b><table>
    <tr><td>ที่ตั้ง</td><td>ต.${esc(p.tambon)} อ.${esc(p.amphoe)}</td></tr>
    <tr><td>ลำน้ำ</td><td>${esc(p.river)} · ${esc(p.cause)}</td></tr>
    <tr><td>ระลอก</td><td>${esc(w.name)} (${esc(w.period)})</td></tr>
    <tr><td>ช่วงรายงาน</td><td>${esc(p.first)} – ${esc(p.last)}</td></tr>
    <tr><td>ระดับน้ำสูงสุด</td><td>${esc(p.maxd)} ม.</td></tr>
    <tr><td>สถานะล่าสุด</td><td>${esc(p.status)}</td></tr>
    ${p.note ? `<tr><td>หมายเหตุ</td><td>${esc(p.note)}</td></tr>` : ''}</table>
    ${series ? `<div class="meta">ระดับน้ำ (ม.) ตามรายงานแต่ละฉบับ</div>${series}` : ''}`;
}

// ---------- วันที่ภาษาไทย ----------
const TH_MON = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const TH_DOW = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];
// "20 ก.ย. 2569" หรือ "28 ก.ย. 07.00" (ไม่มีปี = 2569) -> "2026-09-20"
function thToIso(s) {
  const m = String(s).match(/(\d{1,2})\s*([ก-๙.]+)\s*(\d{4})?/);
  if (!m) return null;
  const mon = TH_MON.indexOf(m[2]);
  if (mon < 0) return null;
  const y = m[3] ? +m[3] - 543 : 2026;
  return `${y}-${String(mon + 1).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}
const isoToTh = (iso, dow = false) => {
  const d = new Date(iso + 'T00:00:00Z');
  return `${dow ? TH_DOW[d.getUTCDay()] + ' ' : ''}${d.getUTCDate()} ${TH_MON[d.getUTCMonth()]} ${d.getUTCFullYear() + 543}`;
};
const daysBetween = (a, b) => Math.round((new Date(b + 'T00:00:00Z') - new Date(a + 'T00:00:00Z')) / 86400e3);
const fmt = (v, n = 2) => (v == null || Number.isNaN(v) ? '-' : (+v).toLocaleString('th-TH', { minimumFractionDigits: n, maximumFractionDigits: n }));

// ---------- สี ----------
function rainColor(mm) {
  if (mm >= 90) return '#5f3dc4';
  if (mm >= 60) return '#7048e8';
  if (mm >= 35) return '#4c6ef5';
  if (mm >= 20) return '#339af0';
  if (mm >= 10) return '#74c0fc';
  if (mm >= 3) return '#a5d8ff';
  return null;
}
const RAIN_STEPS = [[3, '3–10'], [10, '10–20'], [20, '20–35'], [35, '35–60'], [60, '60–90'], [90, '90+']];
// สถานะเทียบตลิ่ง (ม. ต่ำกว่าตลิ่ง)
function bankLevel(diff) {
  if (diff == null) return { color: '#adb5bd', text: 'ไม่มีข้อมูล' };
  if (diff < 0) return { color: '#e03131', text: 'ล้นตลิ่ง' };
  if (diff < 1) return { color: '#f76707', text: 'ต่ำกว่าตลิ่งไม่ถึง 1 ม.' };
  if (diff < 2) return { color: '#f2b705', text: 'ต่ำกว่าตลิ่ง 1–2 ม.' };
  return { color: '#1c7ed6', text: 'ต่ำกว่าตลิ่งเกิน 2 ม.' };
}
const FLOOD_COLOR = '#e8590c';

// ---------- ไทม์ไลน์ ----------
const TL = { days: [], i: 0, timer: null, sat: null, data: null, layers: {}, chart: null };

function initMap() {
  map = L.map('map', { zoomControl: true }).setView([16.35, 99.5], 9);
  const bases = {
    'OpenStreetMap': L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap' }),
    'ภาพถ่ายดาวเทียม (Esri)': L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: 'Imagery &copy; Esri' }),
  };
  bases['OpenStreetMap'].addTo(map);
  map.createPane('rainPane').style.zIndex = 350;
  map.createPane('floodPane').style.zIndex = 400;

  TL.layers.rain = L.layerGroup().addTo(map);
  TL.layers.flood = L.layerGroup().addTo(map);
  TL.layers.stations = L.layerGroup().addTo(map);
  TL.layers.points = L.layerGroup().addTo(map);

  // จุดประสบภัยจากรายงาน: ช่วงวันที่รายงาน
  for (const p of D.points) {
    p.firstIso = thToIso(p.first);
    p.lastIso = thToIso(p.last);
    markers[p.id] = L.marker([p.lat, p.lon], { title: p.name }).bindPopup(popup(p), { maxWidth: 420 }).addTo(TL.layers.points);
  }

  fetch('kpp_boundary.geojson').then((r) => r.json()).then((fc) => {
    const b = L.geoJSON(fc, { style: { color: '#0b6bcb', weight: 2, dashArray: '6 6', fill: false }, interactive: false }).addTo(map);
    b.bringToBack();
    // ถ้าผู้ใช้เลือกจุดจากตารางไปแล้ว ไม่ต้องซูมกลับ
    if (!map._popup?.isOpen()) map.fitBounds(b.getBounds(), { padding: [10, 10] });
  }).catch((e) => console.warn('boundary', e));

  L.control.layers(bases, {
    'พื้นที่น้ำท่วมจากดาวเทียม': TL.layers.flood,
    'ฝนรายวัน (แบบจำลอง)': TL.layers.rain,
    'ระดับน้ำสถานี': TL.layers.stations,
    'จุดประสบภัยตามรายงาน': TL.layers.points,
  }, { collapsed: window.innerWidth < 900 }).addTo(map);

  $('#legend').innerHTML =
    `<span><i class="sq" style="background:${FLOOD_COLOR}"></i>น้ำท่วมจากดาวเทียม</span>` +
    WAVE_ORDER.map((k) => D.waves[k]).map((w) => `<span><i style="background:${w.color}"></i>${esc(w.name)}</span>`).join('') +
    ['ล้นตลิ่ง', 'ต่ำกว่าตลิ่งไม่ถึง 1 ม.', 'ต่ำกว่าตลิ่ง 1–2 ม.', 'ต่ำกว่าตลิ่งเกิน 2 ม.'].map((t, k) =>
      `<span><i class="ring" style="border-color:${['#e03131', '#f76707', '#f2b705', '#1c7ed6'][k]}"></i>${t}</span>`).join('') +
    `<span>ฝน (มม./วัน) ${RAIN_STEPS.map(([v, t]) => `<i class="sq" style="background:${rainColor(v)}" title="${t}"></i>${t}`).join(' ')}</span>`;

  initTimeline();
}

async function initTimeline() {
  const get = (u) => fetch(u).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${u}: HTTP ${r.status}`))));
  const [sat, data] = await Promise.all([
    get('flood2569-satellite.geojson?v=20261117a').catch((e) => { console.warn(e); return null; }),
    get('flood2569-timeline.json?v=20261117a').catch((e) => { console.warn(e); return null; }),
  ]);
  TL.sat = sat;
  TL.data = data;
  TL.days = data?.days || dayRange('2026-09-15', '2026-11-10');

  // ชั้นน้ำท่วมแยกตามภาพดาวเทียม
  TL.scenes = (sat?.scenes || []).map((s) => ({
    ...s,
    layer: L.geoJSON({ type: 'FeatureCollection', features: sat.features.filter((f) => f.properties.d === s.date && f.properties.s === s.sat) }, {
      pane: 'floodPane',
      style: { color: FLOOD_COLOR, weight: 0.6, fillColor: FLOOD_COLOR, fillOpacity: 0.6 },
      onEachFeature: (f, l) => l.bindPopup(`<b>${esc(f.properties.t)} ${esc(f.properties.a)}</b><br>น้ำท่วม <b>${fmt(f.properties.r, 0)}</b> ไร่<br>
        <span class="meta">ภาพ ${esc(s.satName)} ${esc(isoToTh(s.date))} ${esc(s.time)} น. (GISTDA)</span>`),
    }),
  }));

  // ฝน: ช่องกริด 0.25°
  TL.rainCells = (data?.rain || []).map((c) => ({
    ...c,
    rect: L.rectangle([[c.lat - 0.125, c.lon - 0.125], [c.lat + 0.125, c.lon + 0.125]], { pane: 'rainPane', weight: 0, fillOpacity: 0.3, interactive: true })
      .bindTooltip('', { sticky: true }),
  }));
  // สถานีวัดระดับน้ำ
  TL.stations = (data?.stations || []).map((s) => ({
    ...s,
    marker: L.circleMarker([s.lat, s.lon], { radius: 7, weight: 3, color: '#1c7ed6', fillColor: '#fff', fillOpacity: 1 })
      .bindTooltip('', { direction: 'top', offset: [0, -6] }),
  }));
  TL.stations.forEach((s) => s.marker.addTo(TL.layers.stations));

  const range = $('#tl-range');
  range.max = TL.days.length - 1;
  range.addEventListener('input', () => { stop(); show(+range.value); });
  $('#tl-play').addEventListener('click', () => (TL.timer ? stop() : play()));
  $('#tl-prev').addEventListener('click', () => { stop(); step(-1); });
  $('#tl-next').addEventListener('click', () => { stop(); step(1); });
  $('#tl-speed').addEventListener('change', () => { if (TL.timer) { stop(); play(); } });
  $('#tl-satonly').addEventListener('change', () => { if (isSatOnly() && !satOn(TL.days[TL.i])) step(1); });

  initTimelineChart();
  // เริ่มที่วันแรกที่มีภาพดาวเทียม ถ้าไม่มีเริ่มวันแรก
  const first = TL.scenes.length ? TL.days.indexOf(TL.scenes[0].date) : 0;
  show(first > 0 ? first : 0);
  if (!sat || !data) $('#tl-status').textContent = 'โหลดข้อมูลบางส่วนไม่สำเร็จ';
}

function dayRange(a, b) {
  const out = [];
  for (let d = new Date(a + 'T00:00:00Z'); d <= new Date(b + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + 1)) out.push(d.toISOString().slice(0, 10));
  return out;
}
const isSatOnly = () => $('#tl-satonly').checked;
const satOn = (day) => TL.scenes.some((s) => s.date === day);

function step(dir) {
  let i = TL.i;
  do { i += dir; } while (i >= 0 && i < TL.days.length && isSatOnly() && !satOn(TL.days[i]));
  if (i < 0 || i >= TL.days.length) {
    // เล่นจนจบแล้ววนกลับต้นเฉพาะตอนเล่นอัตโนมัติ
    if (!TL.timer) return false;
    i = dir > 0 ? 0 : TL.days.length - 1;
    while (isSatOnly() && !satOn(TL.days[i]) && i < TL.days.length - 1) i++;
  }
  show(i);
  return true;
}
function play() {
  if (TL.i >= TL.days.length - 1) show(0);
  TL.timer = setInterval(() => step(1), +$('#tl-speed').value);
  $('#tl-play').innerHTML = '&#10074;&#10074; หยุด';
  $('#tl-play').setAttribute('aria-label', 'หยุดไทม์ไลน์');
}
function stop() {
  clearInterval(TL.timer);
  TL.timer = null;
  $('#tl-play').innerHTML = '&#9654; เล่น';
  $('#tl-play').setAttribute('aria-label', 'เล่นไทม์ไลน์');
}

function pointIcon(p, active) {
  const w = D.waves[p.event];
  return L.divIcon({ className: '', html: `<div class="pin${active ? '' : ' off'}" style="background:${w.color}">${p.id}</div>`, iconSize: [24, 24], iconAnchor: [12, 12] });
}

function show(i) {
  TL.i = i;
  const day = TL.days[i];
  $('#tl-range').value = i;
  $('#tl-date').textContent = isoToTh(day, true);

  // ภาพดาวเทียมล่าสุดที่ถ่ายไม่เกินวันนี้
  const scene = [...TL.scenes].reverse().find((s) => s.date <= day);
  TL.layers.flood.clearLayers();
  if (scene) {
    const age = daysBetween(scene.date, day);
    scene.layer.setStyle({ fillOpacity: age === 0 ? 0.65 : 0.35, opacity: age === 0 ? 1 : 0.6, dashArray: age === 0 ? null : '3 3' });
    TL.layers.flood.addLayer(scene.layer);
    scene.age = age;
  }

  // ฝน
  TL.layers.rain.clearLayers();
  let rainSum = 0, rainN = 0, rainMax = 0;
  for (const c of TL.rainCells) {
    const mm = c.mm[i];
    if (mm == null) continue;
    rainSum += mm; rainN++; rainMax = Math.max(rainMax, mm);
    const col = rainColor(mm);
    if (!col) continue;
    c.rect.setStyle({ fillColor: col }).setTooltipContent(`ฝน ${fmt(mm, 1)} มม. (แบบจำลอง ERA5)`);
    TL.layers.rain.addLayer(c.rect);
  }

  // สถานี
  const st = TL.stations.map((s) => {
    const wl = s.wl[i];
    const diff = wl != null && s.bank != null ? s.bank - wl : null;
    const lv = bankLevel(diff);
    s.marker.setStyle({ color: lv.color, fillColor: diff != null && diff < 0 ? lv.color : '#fff' });
    s.marker.setTooltipContent(`<b>${esc(s.code)}</b> ${esc(s.name)}<br>${wl == null ? 'ไม่มีข้อมูล' : `ระดับน้ำสูงสุด ${fmt(wl)} ม.รทก.<br>${diff < 0 ? `ล้นตลิ่ง ${fmt(-diff)} ม.` : `ต่ำกว่าตลิ่ง ${fmt(diff)} ม.`}`}${s.q[i] != null ? `<br>น้ำไหล ${fmt(s.q[i], 0)} ลบ.ม./วิ.` : ''}`);
    return { ...s, wlDay: wl, diff, lv };
  });

  // จุดประสบภัยตามรายงาน
  const active = [];
  for (const p of D.points) {
    const on = p.firstIso && p.lastIso && p.firstIso <= day && day <= p.lastIso;
    if (on) active.push(p);
    markers[p.id].setIcon(pointIcon(p, on)).setZIndexOffset(on ? 1000 : 0);
  }

  renderSide(day, scene, { rainN, rainAvg: rainN ? rainSum / rainN : null, rainMax }, st, active);
  if (TL.chart) TL.chart.update('none');
}

function renderSide(day, scene, rain, st, active) {
  const satTxt = scene
    ? `<b>${fmt(scene.rai, 0)}</b> ไร่ ใน ${scene.tambon} ตำบล<div class="meta">${esc(scene.satName)} ${esc(isoToTh(scene.date))} ${esc(scene.time)} น.${scene.age ? ` · ภาพเมื่อ ${scene.age} วันก่อน` : ' · ถ่ายวันนี้'}</div>`
    : '<span class="meta">ยังไม่มีภาพดาวเทียม (ภาพแรก 26 ก.ย.)</span>';
  const watch = st.filter((s) => s.diff != null).sort((a, b) => a.diff - b.diff).slice(0, 6);
  $('#tl-side').innerHTML = `
    <div class="tl-item"><span class="lbl">น้ำท่วมจากดาวเทียม</span>${satTxt}</div>
    <div class="tl-item"><span class="lbl">ฝนเฉลี่ยทั้งจังหวัด (แบบจำลอง)</span>${rain.rainN ? `<b>${fmt(rain.rainAvg, 1)}</b> มม. <span class="meta">สูงสุด ${fmt(rain.rainMax, 1)} มม.</span>` : '<span class="meta">ไม่มีข้อมูล</span>'}</div>
    <div class="tl-item"><span class="lbl">จุดประสบภัยตามรายงาน</span><b>${active.length}</b> จุด
      ${active.length ? `<div class="meta">${active.map((p) => `${p.id}. ${esc(p.name)}`).join('<br>')}</div>` : ''}</div>
    <div class="tl-item"><span class="lbl">สถานีที่น้ำใกล้ตลิ่งที่สุด</span>
      ${watch.length ? `<table class="tl-st">${watch.map((s) => `<tr><td><i class="sw" style="background:${s.lv.color}"></i>${esc(s.code)}</td>
        <td class="meta">${esc(s.name)}</td><td class="num">${s.diff < 0 ? `+${fmt(-s.diff)}` : `−${fmt(s.diff)}`}</td></tr>`).join('')}</table>
        <div class="meta">ม. เทียบตลิ่ง (+ = ล้นตลิ่ง)</div>` : '<span class="meta">ไม่มีข้อมูล</span>'}</div>`;
}

function initTimelineChart() {
  const ink = getComputedStyle(document.body).color;
  const days = TL.days;
  const rainAvg = days.map((_, i) => {
    const v = TL.rainCells.map((c) => c.mm[i]).filter((x) => x != null);
    return v.length ? +(v.reduce((a, b) => a + b, 0) / v.length).toFixed(1) : null;
  });
  const satRai = days.map((d) => TL.scenes.find((s) => s.date === d)?.rai ?? null);
  const nPoints = days.map((d) => D.points.filter((p) => p.firstIso <= d && d <= p.lastIso).length);
  // เส้นแนวตั้งบอกวันที่เลือก
  const cursor = {
    id: 'cursor',
    afterDatasetsDraw(c) {
      const x = c.scales.x.getPixelForValue(TL.i);
      const { top, bottom } = c.chartArea;
      const g = c.ctx;
      g.save(); g.strokeStyle = '#e03131'; g.lineWidth = 2; g.beginPath(); g.moveTo(x, top); g.lineTo(x, bottom); g.stroke(); g.restore();
    },
  };
  TL.chart = new Chart($('#tl-chart'), {
    data: {
      labels: days.map((d) => isoToTh(d).replace(/ \d{4}$/, '')),
      datasets: [
        { type: 'bar', label: 'ฝนเฉลี่ย (มม.)', data: rainAvg, backgroundColor: '#74c0fc', yAxisID: 'y', order: 3 },
        { type: 'line', label: 'น้ำท่วมจากดาวเทียม (ไร่)', data: satRai, borderColor: FLOOD_COLOR, backgroundColor: FLOOD_COLOR, yAxisID: 'y1', spanGaps: true, pointRadius: 4, borderWidth: 2, order: 1 },
        { type: 'line', label: 'จุดประสบภัยตามรายงาน', data: nPoints, borderColor: '#c92a2a', backgroundColor: '#c92a2a', yAxisID: 'y2', stepped: true, pointRadius: 0, borderWidth: 1.5, borderDash: [4, 3], order: 2 },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false, animation: false,
      interaction: { mode: 'index', intersect: false },
      onClick: (e, els, c) => {
        const i = Math.round(c.scales.x.getValueForPixel(e.x));
        if (i >= 0 && i < days.length) { stop(); show(i); }
      },
      plugins: { legend: { labels: { color: ink, boxWidth: 12 } } },
      scales: {
        x: { ticks: { color: ink, maxRotation: 0, autoSkip: true, maxTicksLimit: 12 }, grid: { display: false } },
        y: { position: 'left', beginAtZero: true, ticks: { color: ink }, title: { display: true, text: 'ฝน มม.', color: ink }, grid: { color: 'rgba(128,128,128,.18)' } },
        y1: { position: 'right', beginAtZero: true, ticks: { color: FLOOD_COLOR }, title: { display: true, text: 'ไร่', color: FLOOD_COLOR }, grid: { display: false } },
        y2: { display: false, beginAtZero: true, suggestedMax: 20 },
      },
    },
    plugins: [cursor],
  });
}

function chart(sel, type, labels, datasets, yTitle, extra = {}) {
  const ink = getComputedStyle(document.body).color;
  return new Chart($(sel), {
    type, data: { labels, datasets },
    options: {
      responsive: true, maintainAspectRatio: false, animation: false, spanGaps: false,
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { labels: { color: ink, boxWidth: 12 } } },
      scales: {
        x: { ticks: { color: ink, maxRotation: 0, autoSkip: true, maxTicksLimit: 8 }, grid: { display: false } },
        y: { ticks: { color: ink }, grid: { color: 'rgba(128,128,128,.18)' }, title: { display: true, text: yTitle, color: ink }, ...extra },
      },
    },
  });
}

function initCharts() {
  const labels = D.daily.map((d) => d[0]);
  chart('#daily-chart', 'bar', labels, [
    { label: 'จุด', data: D.daily.map((d) => d[1]), backgroundColor: '#C92A2A' },
    { label: 'ตำบล', data: D.daily.map((d) => d[2]), backgroundColor: '#E8590C' },
    { label: 'อำเภอ', data: D.daily.map((d) => d[3]), backgroundColor: '#868E96' },
  ], 'จำนวน', { beginAtZero: true });

  const line = ([label, color, data]) => ({ label, data, borderColor: color, backgroundColor: color, pointRadius: 2, borderWidth: 2, tension: 0.2 });
  chart('#flow-chart', 'line', D.flow.labels, D.flow.series.map(line), 'ลบ.ม./วินาที', { beginAtZero: true });
  chart('#res-chart', 'line', D.reservoir.labels, [
    ...D.reservoir.series.map(line),
    { label: 'ระดับเก็บกัก 100%', data: D.reservoir.labels.map(() => 100), borderColor: '#868E96', borderDash: [5, 5], pointRadius: 0, borderWidth: 1 },
  ], '% ความจุ');
}

renderText();
initMap();
initCharts();
