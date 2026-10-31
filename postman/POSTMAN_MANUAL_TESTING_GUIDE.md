# Panduan Pengujian Manual Postman — Platform LaporKita

Panduan ini memandu pengujian manual seluruh alur kerja (*workflow*) bisnis platform **LaporKita** (Backend API & AI Microservice) pada lingkungan produksi live Canadev menggunakan Postman.

---

## 📁 File Postman yang Tersedia

File-file berikut berada di dalam folder `postman/`:
1. **`LaporKita_Workflow_Manual_Test_Collection.json`**:
   - Berisi **72 request** yang dikelompokkan secara terstruktur ke dalam **9 folder workflow**.
   - Dilengkapi *Test Scripts* otomatis yang mengekstrak dan menyimpan token otentikasi serta ID resource ke variabel environment secara otomatis (*zero copy-paste*).
2. **`LaporKita_Canadev_Environment.json`**:
   - Environment Postman untuk target server live produksi Canadev:
     - `baseUrl`: `https://api-server.canadev.my.id/api/v1`
     - `backendRoot`: `https://api-server.canadev.my.id`
     - `aiBaseUrl`: `https://ai-server.canadev.my.id`
     - Kredensial bawaan 4 akun peran (Admin, Warga/Citizen, Operator DPUPR, Policy Maker Bappeda).

---

## 🚀 Langkah Import ke Postman

1. Buka aplikasi **Postman**.
2. Klik tombol **Import** di sudut kiri atas.
3. Seret (*drag & drop*) atau pilih kedua file berikut:
   - `postman/LaporKita_Workflow_Manual_Test_Collection.json`
   - `postman/LaporKita_Canadev_Environment.json`
4. Di pojok kanan atas Postman, pada pemilih *Environment*, pilih **`LaporKita — Canadev Production Environment`**.

---

## 🔄 Urutan Eksekusi Alur Kerja (Workflow Order)

### 1. Folder `01 - System Health & Discovery`
- **1.1 GET Backend Health Status**: Memverifikasi server API aktif (`status: ok`).
- **1.2 GET Swagger Documentation UI**: Membuka Swagger UI di `https://api-server.canadev.my.id/api/docs`.
- **1.3 GET OpenAPI 3.0 Schema JSON**: Mengambil skema OpenAPI 3.0 lengkap.
- **1.4 GET AI Service Health & Model Flags**: Memverifikasi model AI aktif (`yolo_classification_loaded: true`, `xgboost_risk_loaded: true`).
- **1.5 GET AI Sandbox Console Demo**: Membuka dashboard pengujian AI di browser/Postman.
- **1.6 GET AI Sample Images Dataset**: Mengambil dataset sampel foto (otomatis mengupdate `{{sampleImageBase64}}`).

---

### 2. Folder `02 - Authentication & Roles`
> 💡 **Fitur Otomatis**: Saat request login dieksekusi, *Test Script* Postman otomatis menyimpan token ke variabel `{{adminToken}}`, `{{citizenToken}}`, `{{operatorToken}}`, dan `{{policyMakerToken}}`.

Jalankan request berikut secara berurutan:
- **2.1 POST Login Admin** ➔ Token tersimpan di `{{adminToken}}`.
- **2.2 POST Login Citizen (Warga)** ➔ Token tersimpan di `{{citizenToken}}`.
- **2.3 POST Login Operator DPUPR** ➔ Token tersimpan di `{{operatorToken}}`.
- **2.4 POST Login Policy Maker** ➔ Token tersimpan di `{{policyMakerToken}}`.
- **2.5 POST Refresh Token Rotation** ➔ Menguji rotasi refresh token.
- **2.6 POST Register New Citizen** ➔ Uji pendaftaran warga baru (`HTTP 202 Accepted`).
- **2.7 POST Resend OTP Verification** ➔ Uji coba resend OTP & cooldown.
- **2.8 POST Verify OTP (Negative Check)** ➔ Uji proteksi kode OTP salah (`HTTP 400 Bad Request`).

---

### 3. Folder `03 - Core Report Lifecycle (Citizen-to-Resolve)`
> 💡 **Fitur Otomatis**: Request 3.1 otomatis mengekstrak ID laporan baru ke `{{reportId}}` dan kodenya ke `{{reportCode}}`. Seluruh request berikutnya (upvote, komentar, transisi status operator, validasi warga) langsung terhubung tanpa perlu menyalin ID.

1. **3.1 POST Submit Laporan Baru (Warga)**:
   - Mengirim formulir pelaporan kerusakan jalan di Alun-Alun Merdeka Malang.
   - Status awal: `pending_verification`.
2. **3.2 GET Detail Laporan**:
   - Memeriksa detail laporan, media yang terlampir, dan perhitungan `urgency_score`.
3. **3.3 GET Daftar Laporan Publik & Filter**:
   - Menampilkan daftar laporan publik.
4. **3.4 POST Dukung Laporan (Upvote Warga)**:
   - Menambah dukungan warga untuk menaikkan skor prioritas.
5. **3.5 POST Cegah Upvote Ganda**:
   - Mencoba upvote ulang; sistem menolak dengan `HTTP 409 Conflict`.
6. **3.6 DELETE Batalkan Dukungan (Grace Period 5 Menit)**:
   - Membatalkan upvote dalam batas waktu 5 menit.
7. **3.7 POST Tambah Ulang Upvote**:
   - Mengaktifkan kembali dukungan warga.
8. **3.8 POST Tambah Komentar Konstruktif**:
   - Mengirim komentar warga (`is_flagged: false`).
9. **3.9 POST Komentar Uji Sensor Kata Kasar (Profanity Filter)**:
   - Mengirim komentar bernada kasar; sistem otomatis memfilter kata dan menandai `is_flagged: true`.
10. **3.10 GET Daftar Komentar Laporan**:
    - Melihat kedua komentar pada laporan.
11. **3.11 GET Antrean Moderasi Komentar (Operator)**:
    - Petugas melihat daftar komentar yang ter-flag untuk ditinjau.
12. **3.12 PATCH Operator: Verifikasi Laporan (`verified`)**:
    - Operator memverifikasi laporan.
13. **3.13 PATCH Operator: Tugaskan ke Tim Satgas (`assigned`)**:
    - Operator menugaskan pekerjaan ke Satgas Jalan DPUPR.
14. **3.14 PATCH Operator: Mulai Pengerjaan (`in_progress`)**:
    - Status berganti menjadi sedang dikerjakan.
15. **3.15 POST Operator: Unggah Foto Bukti Selesai**:
    - Operator mengunggah foto bukti fisik perbaikan (`type: completion_photo`).
16. **3.16 PATCH Operator: Selesaikan Pekerjaan (`completed`)**:
    - Status pekerjaan ditandai selesai fisik (`completed`).
17. **3.17 POST Validasi Warga di Lokasi (`RESOLVED!`)**:
    - Warga memvalidasi hasil perbaikan di lokasi (radius ≤100m).
    - Status akhir laporan berubah menjadi **`resolved`** (Siklus Akuntabilitas Digital Selesai).

---

### 4. Folder `04 - User Profile & Gamification`
- **4.1 GET Profil Saya (Warga)**: Melihat profil warga.
- **4.2 PATCH Perbarui Nama Profil**: Mengubah nama profil warga.
- **4.3 GET Riwayat Poin Kontribusi Warga**: Melihat perolehan poin dari pelaporan dan validasi.
- **4.4 GET Daftar Pengguna (Admin Only)**: Admin melihat daftar pengguna.
- **4.5 GET Detail Pengguna Tertentu**: Admin melihat detail spesifik user warga.
- **4.6 PATCH Perbarui Akun Pengguna**: Admin memperbarui avatar/status user.
- **4.7 DELETE Uji Proteksi Hapus Diri Sendiri**: Proteksi keamanan agar admin tidak dapat menghapus akunnya sendiri (`HTTP 400 Bad Request`).

---

### 5. Folder `05 - GIS, Navigation & Route Alerts`
- **5.1 POST Routing Navigasi OSRM**: Menghitung rute tercepat Alun-Alun ke Lowokwaru (jarak ~3,4 km).
- **5.2 POST Deteksi Bahaya di Sepanjang Koridor Rute**: Mendeteksi kerusakan jalan di koridor perjalanan.
- **5.3 POST Berlangganan Geofencing Route Alert**: Mendaftarkan token FCM untuk notifikasi bahaya.
- **5.4 POST Pengecekan Kedekatan Titik Bahaya**: Cek kedekatan bahaya secara berkala.
- **5.5 DELETE Hentikan Langganan Geofencing**: Membatalkan langganan geofencing.

---

### 6. Folder `06 - Peta Emosi Kota & Policy Simulator`
- **6.1 GET 5 Zona Kecamatan Kota Malang**: Mengambil data zona (Klojen, Blimbing, Kedungkandang, Sukun, Lowokwaru).
- **6.2 GET Histori Metrik Risiko Zona Klojen**: Menampilkan data historis risiko banjir dan densitas laporan.
- **6.3 POST Refresh Metrik Risiko (Operator)**: Memicu re-kalkulasi risiko zona via AI Service.
- **6.4 POST Simulasi Kebijakan AI (Policy Maker)**:
  - Mengirim usulan kebijakan ke AI Google Gemini 2.5 Flash.
  - ID hasil simulasi otomatis disimpan ke `{{simulationId}}`.
- **6.5 GET Riwayat Simulasi Kebijakan**: Melihat daftar simulasi yang pernah dijalankan.
- **6.6 GET Detail Simulasi Kebijakan Tertentu**: Melihat narasi dampak kebijakan, proyeksi anggaran, dan rekomendasi mitigasi risiko.

---

### 7. Folder `07 - In-App Notifications`
- **7.1 GET Daftar Notifikasi Warga**: Mengambil notifikasi in-app (ID pertama disimpan ke `{{notificationId}}`).
- **7.2 PATCH Tandai Satu Notifikasi Sudah Dibaca**: Menandai satu notifikasi sebagai telah dibaca.
- **7.3 PATCH Tandai Semua Notifikasi Sudah Dibaca**: Menandai seluruh notifikasi telah dibaca.

---

### 8. Folder `08 - Master Data Management (Admin CRUD)`
- **8.1 - 8.5 Kategori Fasilitas Publik**:
  - List kategori, detail kategori, buat kategori baru (ID otomatis disimpan ke `{{createdCategoryId}}`), perbarui bobot, dan hapus kategori uji coba.
- **8.6 - 8.10 Instansi / Dinas Pemerintah (OPD)**:
  - List dinas, detail dinas DPUPR, buat instansi baru (ID otomatis disimpan ke `{{createdAgencyId}}`), perbarui email kontak, dan hapus instansi uji coba.

---

### 9. Folder `09 - AI Microservice Standalone Engines`
- **9.1 GET AI Health & Model Verification**: Mengecek status ketersediaan model AI.
- **9.2 POST YOLOv11 Computer Vision Verification**: Deteksi kerusakan jalan, forensik citra, dan smart priority.
- **9.3 POST XGBoost Flood & Urban Risk Prediction**: Prediksi risiko genangan air & rekomendasi operasional.
- **9.4 POST Zone Batch Prediction Metrics**: Inferensi batch metrik kecamatan untuk backend.
- **9.5 POST Google Gemini Policy Simulator Direct**: Simulasi kebijakan publik langsung ke microservice AI.
- **9.6 GET Active Learning Class Distribution**: Statistik 6 kelas dataset retraining.
- **9.7 POST Active Learning Ingest Correction Sample**: Ingest sampel koreksi citra warga (nama file disimpan ke `{{sampleFilename}}`).
- **9.8 GET Active Learning Download Ingested Sample**: Mengunduh citra sampel yang baru di-ingest.
- **9.9 GET Active Learning Download Dataset Zip**: Mengunduh arsip zip dataset lengkap.
- **9.10 POST Predict Risk (NestJS Route Compatibility)**: Uji kompatibilitas rute `/api/v1/predict-risk`.

---

## ⚡ Menjalankan Sekaligus via Postman Collection Runner

Selain pengujian manual satu per satu, seluruh koleksi dapat dijalankan secara otomatis:
1. Klik kanan pada koleksi **`LaporKita — Manual Workflow E2E Test Collection`**.
2. Pilih **Run Collection**.
3. Pastikan urutan folder 01 sampai 09 terpilih.
4. Klik **Run LaporKita — Manual Workflow E2E Test Collection**.
5. Postman Runner akan mengeksekusi ke-72 request secara berurutan dan menampilkan ringkasan hasil pengujian hijau (*PASS*).
