// แถบเมนูด้านข้าง (sidebar) ใช้ร่วมกันทุกหน้า เพิ่มหน้าใหม่ที่ PAGES
(function () {
  const PAGES = [
    { href: 'index.html', icon: '🌊', label: 'สถานการณ์น้ำ จังหวัดกำแพงเพชร' },
    { href: 'flood2569.html', icon: '📋', label: 'สรุปอุทกภัยปี 2569' },
    { href: 'downloads.html', icon: '📥', label: 'ดาวน์โหลดข้อมูล' },
  ];
  const KEY = 'trackflood.sidebar';
  const mobile = () => window.matchMedia('(max-width: 900px)').matches;
  const current = location.pathname.split('/').pop() || 'index.html';

  const aside = document.createElement('aside');
  aside.className = 'sidebar';
  aside.id = 'sidebar';
  aside.innerHTML = `<div class="sb-title">TrackFlood<small>กำแพงเพชร</small></div>
    <nav>${PAGES.map((p) => `<a href="${p.href}"${p.href === current ? ' class="active" aria-current="page"' : ''}>
      <span class="ic" aria-hidden="true">${p.icon}</span>${p.label}</a>`).join('')}</nav>`;
  const backdrop = document.createElement('div');
  backdrop.className = 'sb-backdrop';
  document.body.prepend(aside, backdrop);
  document.body.classList.add('has-sidebar');

  const btn = document.createElement('button');
  btn.className = 'btn sidebar-toggle';
  btn.type = 'button';
  btn.setAttribute('aria-controls', 'sidebar');
  btn.setAttribute('aria-label', 'เปิด/ปิดเมนู');
  btn.innerHTML = '<span></span><span></span><span></span>';
  document.querySelector('.top')?.prepend(btn);

  function set(open, save) {
    document.body.classList.toggle('sidebar-open', open);
    btn.setAttribute('aria-expanded', String(open));
    if (save && !mobile()) try { localStorage.setItem(KEY, open ? 'open' : 'closed'); } catch {}
    // ให้แผนที่ Leaflet และกราฟคำนวณขนาดใหม่หลังเลื่อนเมนู
    setTimeout(() => window.dispatchEvent(new Event('resize')), 220);
  }
  let saved = null;
  try { saved = localStorage.getItem(KEY); } catch {}
  // จอใหญ่เปิดไว้เป็นค่าเริ่มต้น มือถือปิดไว้
  set(!mobile() && saved !== 'closed', false);

  btn.addEventListener('click', () => set(!document.body.classList.contains('sidebar-open'), true));
  backdrop.addEventListener('click', () => set(false, false));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && mobile()) set(false, false); });
})();
