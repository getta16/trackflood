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

function initMap() {
  map = L.map('map', { zoomControl: true }).setView([16.35, 99.5], 9);
  const bases = {
    'OpenStreetMap': L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap' }),
    'ภาพถ่ายดาวเทียม (Esri)': L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: 'Imagery &copy; Esri' }),
  };
  bases['OpenStreetMap'].addTo(map);

  const groups = {};
  for (const k of WAVE_ORDER) groups[k] = L.layerGroup().addTo(map);
  for (const p of D.points) {
    const w = D.waves[p.event];
    const icon = L.divIcon({ className: '', html: `<div class="pin" style="background:${w.color}">${p.id}</div>`, iconSize: [24, 24], iconAnchor: [12, 12] });
    markers[p.id] = L.marker([p.lat, p.lon], { icon, title: p.name }).bindPopup(popup(p), { maxWidth: 420 }).addTo(groups[p.event]);
  }
  const stations = L.layerGroup().addTo(map);
  for (const s of D.stations) {
    L.marker([s.lat, s.lon], { icon: L.divIcon({ className: '', html: '<div class="stn"></div>', iconSize: [14, 12], iconAnchor: [7, 9] }) })
      .bindTooltip(s.code, { permanent: true, direction: 'left', offset: [-6, 0], className: 'stn-lbl' })
      .bindPopup(`<b>สถานี ${esc(s.code)}</b><br>${esc(s.name)}${s.cap ? `<br>ความจุลำน้ำ ${esc(s.cap)} ลบ.ม./วินาที` : ''}`)
      .addTo(stations);
  }

  fetch('kpp_boundary.geojson').then((r) => r.json()).then((fc) => {
    const b = L.geoJSON(fc, { style: { color: '#0b6bcb', weight: 2, dashArray: '6 6', fill: false }, interactive: false }).addTo(map);
    b.bringToBack();
    // ถ้าผู้ใช้เลือกจุดจากตารางไปแล้ว ไม่ต้องซูมกลับ
    if (!map._popup?.isOpen()) map.fitBounds(b.getBounds(), { padding: [10, 10] });
  }).catch((e) => console.warn('boundary', e));

  const overlays = {};
  for (const k of WAVE_ORDER) overlays[`${D.waves[k].name} (${D.waves[k].period})`] = groups[k];
  overlays['สถานีวัดน้ำ'] = stations;
  L.control.layers(bases, overlays, { collapsed: window.innerWidth < 900 }).addTo(map);

  $('#legend').innerHTML = WAVE_ORDER.map((k) => D.waves[k]).map((w) =>
    `<span><i style="background:${w.color}"></i>${esc(w.name)} (${esc(w.period)})</span>`).join('') +
    '<span><i class="tri"></i>สถานีวัดน้ำ</span>';
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
