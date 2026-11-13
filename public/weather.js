// แผนที่อากาศ Ventusky (iframe) + เส้นขอบเขตจังหวัดวาดทับด้วย SVG
// Ventusky ใช้ Web Mercator แบบเดียวกับแผนที่ทั่วไป จึงคำนวณตำแหน่งพิกเซลจากศูนย์กลาง/ซูมเดียวกันได้
// เส้นจะตรงก็ต่อเมื่อแผนที่ใน iframe ไม่ถูกเลื่อน จึงล็อกแผนที่ไว้เป็นค่าเริ่มต้น (ปลดล็อกได้ แต่เส้นขอบเขตจะซ่อน)
(function () {
  // ศูนย์กลางจังหวัด (เลื่อนลงใต้เล็กน้อยให้พ้นแถบเวลาด้านล่าง) ซูม 8 = ทั้งจังหวัดเต็มกรอบพอดี
  const VIEW = { lat: 16.3, lon: 99.53, zoom: 8 };
  // ซูมของ Ventusky ใหญ่กว่า Web Mercator มาตรฐาน 1 ระดับ (เทียบจากตำแหน่งเมืองบนแผนที่) จึงใช้ 512
  const TILE = 512;

  const wrap = document.getElementById('vt-wrap');
  const frame = document.getElementById('vt-frame');
  const svg = document.getElementById('vt-boundary');
  const layerSel = document.getElementById('vt-layer');
  const dateInp = document.getElementById('vt-date');
  const lockBtn = document.getElementById('vt-lock');

  // วันนี้ตามเวลาไทย (YYYY-MM-DD) เป็นค่าเริ่มต้น
  const today = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
  if (dateInp) dateInp.value = today;
  // ดูพยากรณ์ล่วงหน้าได้ไม่เกิน 14 วัน
  const MAX_AHEAD = 14;
  const lastDay = new Date(Date.parse(today) + MAX_AHEAD * 864e5).toISOString().slice(0, 10);

  // t=YYYYMMDD/HHMM เป็นเวลา UTC: วันอื่นที่ไม่ใช่วันนี้ (ย้อนหลังหรือล่วงหน้า) เริ่มที่ 07:00 น. ไทย (00 UTC) แล้วกด Play ไล่ทั้งวันได้
  function frameSrc() {
    let src = `https://embed.ventusky.com/?p=${VIEW.lat};${VIEW.lon};${VIEW.zoom}&l=${encodeURIComponent(layerSel.value)}`;
    const d = dateInp && dateInp.value;
    if (d && d !== today) src += `&t=${d.replace(/-/g, '')}/0000`;
    return src;
  }
  const reload = () => { frame.src = frameSrc(); };
  // โหลดแผนที่ก่อนอย่างอื่น ถ้าปุ่มใดหาไม่เจอ (เช่นเบราว์เซอร์ยังจำ HTML เก่า) แผนที่ก็ยังขึ้น
  reload();
  const on = (el, ev, fn) => { if (el) el.addEventListener(ev, fn); };

  // พิกัดโลก (พิกเซลที่ซูม z) ตามสูตร Web Mercator
  function project(lon, lat, z) {
    const s = TILE * 2 ** z;
    const sin = Math.sin((lat * Math.PI) / 180);
    return [((lon + 180) / 360) * s, (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * s];
  }

  // ชั้นขอบเขตที่วาดทับ (วาดตามลำดับ ชั้นท้ายอยู่บนสุด) id ตรงกับ checkbox data-layer ใน weather.html
  const OVERLAYS = [
    { id: 'tambon', url: 'tambon32.geojson', cls: 'tambon' },
    { id: 'khlung', url: 'basin_khlung.geojson', cls: 'khlung' },
    { id: 'suanmak', url: 'basin_suanmak.geojson', cls: 'suanmak' },
    { id: 'province', url: 'kpp_boundary.geojson', cls: 'province' },
  ];
  const ringsOf = (fc) => fc.features.flatMap((f) => {
    const g = f.geometry || {};
    return g.type === 'Polygon' ? g.coordinates : g.type === 'MultiPolygon' ? g.coordinates.flat() : [];
  });

  function draw() {
    const w = wrap.clientWidth, h = wrap.clientHeight;
    if (!w || !h) return;
    const [cx, cy] = project(VIEW.lon, VIEW.lat, VIEW.zoom);
    const toD = (rings) => rings.map((ring) => ring.map(([lon, lat], i) => {
      const [x, y] = project(lon, lat, VIEW.zoom);
      return `${i ? 'L' : 'M'}${(x - cx + w / 2).toFixed(1)} ${(y - cy + h / 2).toFixed(1)}`;
    }).join('') + 'Z').join('');
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    svg.innerHTML = OVERLAYS.filter((o) => o.rings && o.on).map((o) => {
      const d = o.d || (o.d = toD(o.rings));
      return `<g class="${o.cls}"><path d="${d}" class="halo"/><path d="${d}" class="line"/></g>`;
    }).join('');
  }
  // ขนาดกรอบเปลี่ยน = คำนวณ path ใหม่
  const redraw = () => { OVERLAYS.forEach((o) => { o.d = null; }); draw(); };

  on(layerSel, 'change', reload);
  if (dateInp) dateInp.max = lastDay;
  on(dateInp, 'change', reload);
  // Chrome เปิดปฏิทินเฉพาะเมื่อกดไอคอน ให้กดตรงไหนของช่องก็เปิดปฏิทินได้
  on(dateInp, 'click', () => { try { dateInp.showPicker(); } catch {} });
  // ปุ่มวันก่อนหน้า/ถัดไป
  function shiftDay(n) {
    const d = new Date((dateInp.value || today) + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + n);
    const v = d.toISOString().slice(0, 10);
    if (v > lastDay) return;
    dateInp.value = v;
    reload();
  }
  on(document.getElementById('vt-prev'), 'click', () => shiftDay(-1));
  on(document.getElementById('vt-next'), 'click', () => shiftDay(1));
  // ปลดล็อก = เลื่อน/ซูมได้ (ซ่อนเส้นขอบเขต) · ล็อกกลับ = โหลด iframe ใหม่ให้กลับตำแหน่งเดิม เส้นจะได้ตรง
  on(lockBtn, 'click', () => {
    const locked = wrap.classList.toggle('unlocked') === false;
    lockBtn.setAttribute('aria-pressed', String(locked));
    lockBtn.textContent = locked ? 'ปลดล็อกแผนที่' : 'ล็อกและแสดงขอบเขต';
    if (locked) reload();
  });
  window.addEventListener('resize', redraw);
  if ('ResizeObserver' in window) new ResizeObserver(redraw).observe(wrap);


  for (const o of OVERLAYS) {
    const cb = document.querySelector(`input[data-layer="${o.id}"]`);
    o.on = cb ? cb.checked : true;
    if (cb) cb.addEventListener('change', () => { o.on = cb.checked; draw(); });
    fetch(o.url).then((r) => r.json()).then((fc) => { o.rings = ringsOf(fc); draw(); })
      .catch(() => { if (cb) cb.closest('label').classList.add('failed'); });
  }
})();
