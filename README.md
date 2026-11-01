# MomentCheck

## ติดตั้งด้วย Code.gs ไฟล์เดียว

เปิด `Code.gs` ที่รากโฟลเดอร์ แล้วคัดลอกทั้งหมดไปวางแทนโค้ดใน Apps Script ของบัญชี `satit@hongson.ac.th`

ไฟล์นี้รวม `doGet`, backend, ข้อสอบจริงทั้ง 3 ข้อ, ตัวตรวจรหัสครู และหน้า HTML/CSS/JavaScript แล้ว ไม่ต้องสร้างไฟล์ HTML เพิ่ม รหัสครูแก้ได้ที่ `TEACHER_SECRET_CODE` ตอนต้นไฟล์

ใช้โค้ดแอปใน `Code.gs` เพียงไฟล์เดียว เพื่อไม่ให้ชนกับ Content.gs/Secrets.gs/Code.gs เก่าที่ซ้ำกัน ส่วน `appsscript.json` ของระบบไม่ต้องลบ

หลังบันทึก เลือก **Deploy → Manage deployments → Edit → New version → Deploy** เพื่อให้ลิงก์เว็บใช้โค้ดที่มี `doGet` ชุดใหม่

ต้นฉบับสำหรับประกอบไฟล์อยู่ใน `apps-script/` และ `web/`; สร้างไฟล์รวมอีกครั้งได้ด้วย `python scripts/bundle_apps_script.py`

เจ้าของฐานข้อมูล Google Sheets และโฟลเดอร์ Google Drive คือ **satit@hongson.ac.th** ใช้ไฟล์โรงเรียนที่ผู้สอนให้มาโดยไม่ย้ายข้อมูลไปบัญชีส่วนตัว

[เปิดเว็บโรงเรียน](https://script.google.com/a/macros/hongson.ac.th/s/AKfycbx7siPkwiUpfv21R6tc80sx6qTkvuU_Z9vhSu0102Vd6btC2jghlopmPGmPU2F8ABAU/exec)

## การใช้งาน

- นักเรียนกรอกชื่อ ห้อง และเลขที่ แล้วกดเริ่มทำแบบทดสอบ เมื่อครูเปิดกิจกรรมจะได้รับคำถามทั้ง 3 ข้อ เวลารวม 180 วินาที
- ครูกดไอคอนรูปโล่ แล้วใส่ Secret code เพื่อเปิด dashboard การเข้าร่วมและการส่งคำตอบ
- ข้อสอบใช้ข้อความและตัวเลือกจากชุด `KH3_DOCUMENTS_V9_3Q_3MIN` ไม่ต้องนำเข้า JSON ผ่านหน้าเว็บ
- แยกยอดกระดาษจากคำตอบเว็บ ใช้รหัสตัวเลือกเดิมแม้สลับลำดับ และส่งออกผลไปยังโฟลเดอร์ Drive ที่กำหนด

## บัญชีและ deployment

- บัญชีโรงเรียน: `satit@hongson.ac.th`
- `deployment-account.json` ระบุบัญชีเจ้าของฐานข้อมูลและบัญชีสำหรับ production
- `scripts/deploy.py` ตรวจบัญชีก่อนอัปโหลด และหยุดหากยังล็อกอินเป็น Gmail ส่วนตัว
- โปรเจกต์ที่สร้างผ่าน Gmail ก่อนหน้านี้เป็นโปรเจกต์เก่า ไม่ใช่ deployment โรงเรียนที่ผู้สอนส่งมา และยังไม่ได้ลบหรือย้ายโปรเจกต์นั้น
- `index.html`, `web/app.js` และ `OPEN_CLASSROOM.url` ผูกกับลิงก์โรงเรียนแล้ว
- ลิงก์โรงเรียนขอให้ลงชื่อเข้าใช้ Google เมื่อเปิดโดยไม่มีบัญชี จึงยังไม่ได้ตรวจหน้าแบบทดสอบ/dashboard หลังการลงชื่อเข้าใช้จาก session นี้

## ไฟล์สำคัญ

- `index.html`: หน้าเว็บรวม CSS และ JavaScript เปิดจากเครื่องแล้วส่งต่อไปลิงก์โรงเรียน
- `web/`: ต้นฉบับหน้าจอ
- `apps-script/`: ต้นฉบับ backend สำหรับ Google Apps Script
- `apps-script/Content.gs`: ข้อสอบ เฉลย และแท็กเฉพาะฝั่งเซิร์ฟเวอร์ ห้ามเผยแพร่ในเว็บสาธารณะ
- `apps-script/Secrets.gs`: ตัวตรวจรหัสครูเฉพาะเซิร์ฟเวอร์
- `.private/teacher-access.txt`: รหัสครูสำหรับ Secrets.gs ชุดนี้ ไม่เผยแพร่
- `scripts/build.py`: ประกอบ index.html
- `scripts/adopt_deployment.py`: ผูก URL ที่ผู้สอนระบุ โดยไม่เขียนทับ backend ต่างโปรเจกต์

การแก้ค่าบัญชีรอบนี้ไม่ย้ายข้อมูล ไม่เปลี่ยนสิทธิ์ไฟล์ และไม่อัปโหลดทับ deployment โรงเรียน
