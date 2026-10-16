# Chiang Mai Natural Tourism Recommendation and Trip Planning System

ระบบแนะนำและวางแผนการท่องเที่ยวเชิงธรรมชาติในจังหวัดเชียงใหม่

## โครงสร้างโปรเจกต์

- `D:\chiangmai-tourism-project\backend` — Flask API และระบบแนะนำแบบ Rule-Based
- `D:\chiangmai-tourism-project\frontend` — React user interface (ยังไม่เริ่มพัฒนา)

## เริ่มใช้งาน Backend

```powershell
Set-Location D:\chiangmai-tourism-project\backend
Copy-Item .env.example .env
pip install -r requirements.txt
python app.py
```

ตรวจสอบ API ได้ที่ `http://127.0.0.1:5000/api/health`
