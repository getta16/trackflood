// แผนที่อากาศ Ventusky (iframe) + เส้นขอบเขตจังหวัดวาดทับด้วย SVG
// Ventusky ใช้ Web Mercator แบบเดียวกับแผนที่ทั่วไป จึงคำนวณตำแหน่งพิกเซลจากศูนย์กลาง/ซูมเดียวกันได้
// เส้นจะตรงก็ต่อเมื่อแผนที่ใน iframe ไม่ถูกเลื่อน จึงล็อกการโต้ตอบไว้เป็นค่าเริ่มต้น
(function () {
  const VIEW = { lat: 16.47, lon: 99.47, zoom: 7 };
  // ซูมของ Ventusky ใหญ่กว่า Web Mercator มาตรฐาน 1 ระดับ (เทียบจากตำแหน่งเมืองบนแผนที่) จึงใช้ 512
  const TILE = 512;

  const wrap = document.getElementById('vt-wrap');
  const frame = document.getElementById('vt-frame');
  const svg = document.getElementById('vt-boundary');
  const layerSel = document.getElementById('vt-layer');
  const lockBtn = document.getElementById('vt-lock');

  function frameSrc(layer) {
    return `https://embed.ventusky.com/?p=${VIEW.lat};${VIEW.lon};${VIEW.zoom}&l=${encodeURIComponent(layer)}`;
  }

  // พิกัดโลก (พิกเซลที่ซูม z) ตามสูตร Web Mercator
  function project(lon, lat, z) {
    const s = TILE * 2 ** z;
    const sin = Math.sin((lat * Math.PI) / 180);
    return [((lon + 180) / 360) * s, (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * s];
  }

  let rings = [];
  function draw() {
    const w = wrap.clientWidth, h = wrap.clientHeight;
    if (!w || !h || !rings.length) return;
    const [cx, cy] = project(VIEW.lon, VIEW.lat, VIEW.zoom);
    const d = rings.map((ring) => ring.map(([lon, lat], i) => {
      const [x, y] = project(lon, lat, VIEW.zoom);
      return `${i ? 'L' : 'M'}${(x - cx + w / 2).toFixed(1)} ${(y - cy + h / 2).toFixed(1)}`;
    }).join('') + 'Z').join('');
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    svg.innerHTML = `<path d="${d}" class="halo"/><path d="${d}" class="line"/>`;
  }

  function setLocked(locked) {
    wrap.classList.toggle('unlocked', !locked);
    lockBtn.setAttribute('aria-pressed', String(locked));
    lockBtn.textContent = locked ? 'ปลดล็อกแผนที่' : 'ล็อกและแสดงขอบเขต';
    // ล็อกกลับ = โหลด iframe ใหม่ให้กลับไปที่ตำแหน่งเดิม เส้นขอบเขตจะได้ตรง
    if (locked) frame.src = frameSrc(layerSel.value);
  }

  layerSel.addEventListener('change', () => { frame.src = frameSrc(layerSel.value); });
  lockBtn.addEventListener('click', () => setLocked(wrap.classList.contains('unlocked')));
  window.addEventListener('resize', draw);
  if ('ResizeObserver' in window) new ResizeObserver(draw).observe(wrap);

  frame.src = frameSrc(layerSel.value);

  fetch('kpp_boundary.geojson').then((r) => r.json()).then((fc) => {
    for (const f of fc.features) {
      const g = f.geometry;
      const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
      for (const p of polys) rings.push(...p);
    }
    draw();
  }).catch(() => {
    document.getElementById('vt-hint').textContent = 'โหลดขอบเขตจังหวัดไม่สำเร็จ';
  });
})();
