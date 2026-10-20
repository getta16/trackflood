// ค่าตั้งต้นและตัวแปลงข้อมูล ThaiWater ใช้ร่วมกันทั้ง server.js และหน้าเว็บ (โหมด static บน GitHub Pages)
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TrackFlood = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const SETTINGS = {
    // จุดศูนย์กลาง: ตัวเมืองกำแพงเพชร
    center: { lat: 16.4827, lon: 99.5226 },
    // นอกจากสถานีในจังหวัด ให้รวมสถานีจังหวัดข้างเคียงในรัศมีนี้ (กม.)
    radiusKm: 70,
    provinceCode: '62',
    province: 'กำแพงเพชร',
    // Longdo key สำหรับโหมด static (ผูกกับ domain เช่น <user>.github.io) เว้นว่างได้
    longdoKey: '',
  };

  const THAIWATER = 'https://api-v3.thaiwater.net/api/v1/thaiwater30';
  const URLS = {
    waterlevel: `${THAIWATER}/public/waterlevel_load`,
    rain: `${THAIWATER}/public/rain_24h`,
    main: `${THAIWATER}/public/thailand_main`,
    graph(stationId, days) {
      const end = new Date(Date.now() + 7 * 3600e3);
      const start = new Date(end.getTime() - days * 86400e3);
      const f = (d) => d.toISOString().slice(0, 10);
      return `${THAIWATER}/public/waterlevel_graph?station_type=tele_waterlevel&station_id=${encodeURIComponent(stationId)}&start_date=${f(start)}&end_date=${f(end)}`;
    },
  };

  // เขื่อนต้นน้ำปิง และเขื่อนหลักลุ่มเจ้าพระยาตอนบน
  const RELATED_DAMS = ['ภูมิพล', 'แม่งัดสมบูรณ์ชล', 'แม่กวงอุดมธารา', 'สิริกิติ์', 'แควน้อยบำรุงแดน', 'กิ่วลม', 'กิ่วคอหมา'];

  function distKm(lat1, lon1, lat2, lon2) {
    const r = Math.PI / 180;
    const a = Math.sin(((lat2 - lat1) * r) / 2) ** 2 +
      Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(((lon2 - lon1) * r) / 2) ** 2;
    return 6371 * 2 * Math.asin(Math.sqrt(a));
  }

  const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v));

  // คืนค่าระยะทาง/อยู่ในจังหวัดหรือไม่ หรือ null ถ้าอยู่นอกพื้นที่สนใจ
  function locate(cfg, x) {
    const s = x.station || {};
    const lat = s.tele_station_lat, lon = s.tele_station_long;
    if (lat == null || lon == null) return null;
    const d = distKm(cfg.center.lat, cfg.center.lon, lat, lon);
    const inProvince = x.geocode?.province_code === cfg.provinceCode;
    if (!inProvince && d > cfg.radiusKm) return null;
    return { lat, lon, distanceKm: +d.toFixed(1), inProvince };
  }

  function parseWaterLevels(j, cfg) {
    return (j.waterlevel_data?.data || [])
      .map((x) => {
        const loc = locate(cfg, x);
        if (!loc) return null;
        const s = x.station;
        return {
          id: s.id,
          name: s.tele_station_name?.th,
          code: s.tele_station_oldcode,
          ...loc,
          river: x.river_name,
          basin: x.basin?.basin_name?.th,
          amphoe: x.geocode?.amphoe_name?.th,
          tumbon: x.geocode?.tumbon_name?.th,
          province: x.geocode?.province_name?.th,
          agency: x.agency?.agency_shortname?.th,
          datetime: x.waterlevel_datetime,
          wlMsl: num(x.waterlevel_msl),
          wlPrev: num(x.waterlevel_msl_previous),
          bankMsl: num(s.min_bank),
          groundMsl: num(s.ground_level),
          diffBank: num(x.diff_wl_bank),
          diffBankText: x.diff_wl_bank_text,
          storagePercent: num(x.storage_percent),
          level: x.situation_level,
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.distanceKm - b.distanceKm);
  }

  function parseRain(j, cfg) {
    return (j.data || [])
      .map((x) => {
        const loc = locate(cfg, x);
        if (!loc) return null;
        return {
          id: x.station.id,
          name: x.station.tele_station_name?.th,
          ...loc,
          amphoe: x.geocode?.amphoe_name?.th,
          tumbon: x.geocode?.tumbon_name?.th,
          province: x.geocode?.province_name?.th,
          agency: x.agency?.agency_shortname?.th,
          datetime: x.rainfall_datetime,
          rain24h: num(x.rain_24h),
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.distanceKm - b.distanceKm);
  }

  function parseDams(j) {
    return (j.dam?.data?.data || [])
      .filter((x) => RELATED_DAMS.includes(x.dam?.dam_name?.th))
      .map((x) => ({
        name: x.dam.dam_name.th,
        date: x.dam_date,
        storage: x.dam_storage,
        storagePercent: x.dam_storage_percent,
        maxStorage: x.dam.max_storage,
        inflow: x.dam_inflow,
        released: x.dam_released,
        basin: x.basin?.basin_name?.th,
        province: x.geocode?.province_name?.th,
      }))
      .sort((a, b) => RELATED_DAMS.indexOf(a.name) - RELATED_DAMS.indexOf(b.name));
  }

  function parseGraph(j) {
    return (j.data?.graph_data || []).map((p) => ({ t: p.datetime, v: p.value }));
  }

  return { SETTINGS, URLS, parseWaterLevels, parseRain, parseDams, parseGraph };
});
