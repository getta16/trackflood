// หน้าดาวน์โหลดข้อมูล
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const size = (b) => (b >= 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1e3))} KB`);

// ไฟล์ GISTDA สร้างโดย scripts/build-downloads.js ใน GitHub Actions
async function loadGistda() {
  const box = $('#downloads');
  let idx;
  try {
    const r = await fetch('data/gistda/downloads/index.json');
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    idx = await r.json();
  } catch {
    box.innerHTML = '<p class="hint">ยังไม่มีไฟล์ดาวน์โหลด (ต้องตั้ง GISTDA_API_KEY แล้วให้ GitHub Actions สร้างไฟล์)</p>';
    return;
  }
  const d = (s) => (s ? new Date(s).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' }) : '-');
  box.innerHTML = idx.items.map((it) => `
    <div class="dl-item">
      <h3>${esc(it.title || 'พื้นที่น้ำท่วม ' + it.label)}</h3>
      <div class="meta">${it.count.toLocaleString('th-TH')} แปลง · ${it.rai.toLocaleString('th-TH')} ไร่ · ${it.years ? `ข้อมูลปี ${esc(it.years)}` : `ภาพดาวเทียม ${d(it.from)} – ${d(it.to)}`}</div>
      <div class="dl-btns">${it.files.map((f) => `
        <a class="btn dl" href="data/gistda/downloads/${encodeURIComponent(f.file)}" download>${esc(f.format)}<small>${size(f.bytes)}</small></a>`).join('')}
      </div>
    </div>`).join('') || '<p class="hint">ไม่มีข้อมูลพื้นที่น้ำท่วมในช่วงนี้</p>';
  box.insertAdjacentHTML('beforeend', `<p class="hint" style="grid-column:1/-1;margin:0">สร้างไฟล์เมื่อ ${new Date(idx.updated).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })} · อัปเดตทุก 3 ชั่วโมง</p>`);
}

// จุดประสบอุทกภัยปี 2569 สร้างไฟล์ในเบราว์เซอร์จาก flood2569-data.js
function build2569() {
  const D = window.FLOOD2569;
  const source = `${D.source.agency} (รายงาน ${D.source.reports} ฉบับ ${D.source.period})`;
  const pointProps = (p) => ({
    id: p.id, name: p.name, kind: p.kind, tambon: p.tambon, amphoe: p.amphoe, river: p.river,
    wave: D.waves[p.event].name, first: p.first, last: p.last, max_depth: p.maxd, cause: p.cause,
    status: p.status, note: p.note, source,
  });
  const feature = (props, lon, lat) => ({ type: 'Feature', properties: props, geometry: { type: 'Point', coordinates: [lon, lat] } });
  const geojson = (features) => JSON.stringify({ type: 'FeatureCollection', features }, null, 1);
  const csv = (rows) => '﻿' + rows.map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
  const table = (list) => [[...Object.keys(list[0]), 'lat', 'lon'], ...list.map((x) => [...Object.values(x.props), x.lat, x.lon])];

  const points = D.points.map((p) => ({ props: pointProps(p), lat: p.lat, lon: p.lon }));
  const stations = D.stations.map((s) => ({ props: { code: s.code, name: s.name, capacity_cms: s.cap, source }, lat: s.lat, lon: s.lon }));
  const items = [
    {
      title: 'จุดประสบอุทกภัย 2569', meta: `${points.length} จุด · 3 ระลอก`, name: 'kamphaengphet_flood_points_2569',
      files: [
        ['GeoJSON', 'geojson', 'application/geo+json', geojson(points.map((x) => feature(x.props, x.lon, x.lat)))],
        ['CSV', 'csv', 'text/csv', csv(table(points))],
      ],
    },
    {
      title: 'สถานีวัดน้ำที่อ้างถึงในรายงาน', meta: `${stations.length} สถานี`, name: 'kamphaengphet_stations_2569',
      files: [
        ['GeoJSON', 'geojson', 'application/geo+json', geojson(stations.map((x) => feature(x.props, x.lon, x.lat)))],
        ['CSV', 'csv', 'text/csv', csv(table(stations))],
      ],
    },
  ];
  $('#dl-2569').innerHTML = items.map((it) => `
    <div class="dl-item">
      <h3>${esc(it.title)}</h3>
      <div class="meta">${esc(it.meta)}</div>
      <div class="dl-btns">${it.files.map(([format, ext, type, text]) => {
        const blob = new Blob([text], { type });
        return `<a class="btn dl" href="${URL.createObjectURL(blob)}" download="${it.name}.${ext}">${format}<small>${size(blob.size)}</small></a>`;
      }).join('')}</div>
    </div>`).join('');
}

build2569();
loadGistda();
