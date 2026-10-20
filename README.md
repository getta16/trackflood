# TrackFlood: สถานการณ์น้ำ จังหวัดกำแพงเพชร

เว็บแดชบอร์ดติดตามสถานการณ์น้ำจังหวัดกำแพงเพชร (ลุ่มน้ำปิง) มีแผนที่ ระดับน้ำ ฝน พื้นที่น้ำท่วมจากดาวเทียม ฝนคาดการณ์ และเขื่อนต้นน้ำ

## วิธีรัน

```bash
cp .env.example .env     # แล้วใส่ key (ไม่ใส่ก็รันได้)
npm install              # ติดตั้ง h3-js (ใช้ย่อข้อมูล GISTDA)
node server.js           # Node 20 ขึ้นไป
```

เปิด http://localhost:3000

## แหล่งข้อมูล

| ข้อมูล | แหล่ง | ต้องใช้ key |
|---|---|---|
| ระดับน้ำ telemetry, สถานะตลิ่ง, กราฟย้อนหลัง | สสน. ThaiWater `api-v3.thaiwater.net` | ไม่ต้อง |
| ฝน 24 ชม. รายสถานี | สสน. ThaiWater | ไม่ต้อง |
| เขื่อน (ภูมิพล, แม่งัด, แม่กวง, สิริกิติ์ ฯลฯ) | สสน. ThaiWater | ไม่ต้อง |
| พื้นที่น้ำท่วมจากดาวเทียม 1/3/7/30 วัน | GISTDA `/features/flood/{period}?pv_idn=62` | `GISTDA_API_KEY` |
| พื้นที่น้ำท่วมซ้ำซาก | GISTDA `/features/flood-freq?pv_idn=62` | `GISTDA_API_KEY` |
| ผักตบชวา (สิ่งกีดขวางทางน้ำ) | GISTDA `/features/water_hyacinth?bbox=...` | `GISTDA_API_KEY` |
| ภาพน้ำท่วมทั้งประเทศ (TMS, เฉพาะโหมด server) | GISTDA `/maps/flood/{period}/tms/{z}/{x}/{y}` | `GISTDA_API_KEY` |
| แผนที่ฐาน | Longdo Map (tile) หรือ OSM/Esri ถ้าไม่มี key | `LONGDO_API_KEY` |
| ฝนคาดการณ์ 10 วัน | Open-Meteo | ไม่ต้อง |
| ปริมาณน้ำไหลแม่น้ำปิง (คาดการณ์) | Open-Meteo Flood API (GloFAS) | ไม่ต้อง |
| เรดาร์ฝน | RainViewer | ไม่ต้อง |

`server.js` เป็นตัวกลาง (proxy) ที่เรียก ThaiWater และ GISTDA พร้อม cache 10–30 นาที กรองสถานีในจังหวัด (รหัส 62) และจังหวัดข้างเคียงในรัศมี `RADIUS_KM` และเก็บ GISTDA key ไว้ฝั่ง server เท่านั้น

## หมายเหตุ

- ข้อมูล GISTDA ดึงทั้งจังหวัด (pv_idn=62)
- ระดับ "ภาพรวม" เป็นเกณฑ์อย่างง่ายจากข้อมูลข้างต้น ไม่ใช่ประกาศเตือนภัยทางการ

## Deploy (GitHub Pages)

ทุกครั้งที่ push เข้า `main` GitHub Actions (`.github/workflows/pages.yml`) จะเผยแพร่โฟลเดอร์ `public/` ขึ้น GitHub Pages ให้อัตโนมัติ

บน Pages ไม่มี `server.js` หน้าเว็บจึงเรียก ThaiWater, Open-Meteo และ RainViewer ตรงจากเบราว์เซอร์

ข้อมูล GISTDA ใช้ key จึงให้ GitHub Actions ดึงล่วงหน้าทุก 3 ชั่วโมง (`scripts/fetch-gistda.js`) แล้วเก็บเป็นไฟล์ `data/gistda/*.json` ไปกับเว็บ key อยู่ใน GitHub Secret ไม่หลุดไปที่หน้าเว็บ

ตั้งค่า key: GitHub repo → Settings → Secrets and variables → Actions → New repository secret ชื่อ `GISTDA_API_KEY` (สมัคร key ที่ https://disaster.gistda.or.th/services/open-api → ไปยังหน้าจัดการ API Key) แล้วสั่ง Actions → Deploy to GitHub Pages → Run workflow

ค่าพื้นที่ (จุดศูนย์กลาง, รหัสจังหวัด, รัศมี) และ Longdo key สำหรับโหมด static ตั้งใน `public/shared.js`
