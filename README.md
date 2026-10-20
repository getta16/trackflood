# TrackFlood: สถานการณ์น้ำ จังหวัดกำแพงเพชร

เว็บแดชบอร์ดติดตามสถานการณ์น้ำจังหวัดกำแพงเพชร (ลุ่มน้ำปิง) มีแผนที่ ระดับน้ำ ฝน พื้นที่น้ำท่วมจากดาวเทียม ฝนคาดการณ์ และเขื่อนต้นน้ำ

## วิธีรัน

```bash
cp .env.example .env     # แล้วใส่ key (ไม่ใส่ก็รันได้)
node server.js           # ต้องใช้ Node 18 ขึ้นไป ไม่ต้อง npm install
```

เปิด http://localhost:3000

## แหล่งข้อมูล

| ข้อมูล | แหล่ง | ต้องใช้ key |
|---|---|---|
| ระดับน้ำ telemetry, สถานะตลิ่ง, กราฟย้อนหลัง | สสน. ThaiWater `api-v3.thaiwater.net` | ไม่ต้อง |
| ฝน 24 ชม. รายสถานี | สสน. ThaiWater | ไม่ต้อง |
| เขื่อน (ภูมิพล, แม่งัด, แม่กวง, สิริกิติ์ ฯลฯ) | สสน. ThaiWater | ไม่ต้อง |
| พื้นที่น้ำท่วมจากดาวเทียม 1/3/7/30 วัน | GISTDA API Gateway `/features/flood/{period}?pv_idn=62` | `GISTDA_API_KEY` |
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

บน Pages ไม่มี `server.js` หน้าเว็บจึงทำงานแบบ static โดยเรียก ThaiWater, Open-Meteo และ RainViewer ตรงจากเบราว์เซอร์ ส่วนชั้นน้ำท่วมจากดาวเทียม GISTDA จะปิดไว้ เพราะ key จะหลุดไปฝั่งผู้ใช้ ถ้าต้องการ GISTDA ให้รัน `server.js` บนโฮสต์ที่รัน Node ได้ (เช่น Render)

ค่าพื้นที่ (จุดศูนย์กลาง, รหัสจังหวัด, รัศมี) และ Longdo key สำหรับโหมด static ตั้งใน `public/shared.js`
