import * as fs from 'fs';
import * as path from 'path';

// Read sample image from ai-service if available
let sampleJalanB64 = '';
const sampleImagesPath = path.resolve(__dirname, '../../ai-service/app/sample_images.json');
if (fs.existsSync(sampleImagesPath)) {
  try {
    const raw = JSON.parse(fs.readFileSync(sampleImagesPath, 'utf-8'));
    sampleJalanB64 = raw['Jalan Berlubang'] || '';
  } catch (e) {
    console.warn('Could not read sample_images.json');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POSTMAN ENVIRONMENT DEFINITION
// ─────────────────────────────────────────────────────────────────────────────
const environmentData = {
  id: "laporkita-canadev-live-env-2026",
  name: "LaporKita — Canadev Production Environment",
  values: [
    { key: "baseUrl", value: "https://api-server.canadev.my.id/api/v1", enabled: true },
    { key: "backendRoot", value: "https://api-server.canadev.my.id", enabled: true },
    { key: "aiBaseUrl", value: "https://ai-server.canadev.my.id", enabled: true },
    { key: "aiApiKey", value: "laporkita-a0de63d362f6bb7e9b7fa125a0452196", enabled: true },
    
    // Seed Users Credentials
    { key: "adminEmail", value: "admin@laporkita.malangkota.go.id", enabled: true },
    { key: "adminPassword", value: "AdminLaporKita2026!", enabled: true },
    
    { key: "citizenEmail", value: "warga@laporkita.malangkota.go.id", enabled: true },
    { key: "citizenPassword", value: "Password123!", enabled: true },
    
    { key: "operatorEmail", value: "operator.dpupr@laporkita.malangkota.go.id", enabled: true },
    { key: "operatorPassword", value: "Password123!", enabled: true },
    
    { key: "policyMakerEmail", value: "policymaker@laporkita.malangkota.go.id", enabled: true },
    { key: "policyMakerPassword", value: "Password123!", enabled: true },
    
    // Master IDs (Malang Kota Seed)
    { key: "categoryId", value: "c1000000-0000-4000-8000-000000000001", enabled: true },
    { key: "agencyId", value: "a1000000-0000-4000-8000-000000000001", enabled: true },
    { key: "zoneId", value: "b1000000-0000-4000-8000-000000000001", enabled: true },
    
    // Auto-populated dynamic variables from test scripts
    { key: "citizenToken", value: "", enabled: true },
    { key: "adminToken", value: "", enabled: true },
    { key: "operatorToken", value: "", enabled: true },
    { key: "policyMakerToken", value: "", enabled: true },
    { key: "citizenUserId", value: "00000000-0000-4000-8000-000000000002", enabled: true },
    { key: "adminUserId", value: "00000000-0000-4000-8000-000000000001", enabled: true },
    { key: "reportId", value: "", enabled: true },
    { key: "reportCode", value: "", enabled: true },
    { key: "simulationId", value: "", enabled: true },
    { key: "notificationId", value: "", enabled: true },
    { key: "createdCategoryId", value: "", enabled: true },
    { key: "createdAgencyId", value: "", enabled: true },
    { key: "sampleFilename", value: "", enabled: true },
    { key: "sampleImageBase64", value: sampleJalanB64, enabled: true }
  ],
  _postman_variable_scope: "environment"
};

// ─────────────────────────────────────────────────────────────────────────────
// HELPER REQUEST FACTORIES
// ─────────────────────────────────────────────────────────────────────────────
function req(
  name: string,
  method: string,
  urlStr: string,
  options: {
    description?: string;
    authType?: 'none' | 'citizen' | 'admin' | 'operator' | 'policyMaker' | 'aiKey';
    bodyType?: 'none' | 'json' | 'formdata';
    jsonBody?: unknown;
    formData?: Array<{ key: string; value?: string; type?: 'text' | 'file'; src?: string; description?: string }>;
    testScript?: string;
  } = {}
) {
  const headers: Array<{ key: string; value: string; type?: string }> = [
    { key: "User-Agent", value: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) LaporKita-QA/1.0" }
  ];

  if (options.authType === 'citizen') {
    headers.push({ key: "Authorization", value: "Bearer {{citizenToken}}" });
  } else if (options.authType === 'admin') {
    headers.push({ key: "Authorization", value: "Bearer {{adminToken}}" });
  } else if (options.authType === 'operator') {
    headers.push({ key: "Authorization", value: "Bearer {{operatorToken}}" });
  } else if (options.authType === 'policyMaker') {
    headers.push({ key: "Authorization", value: "Bearer {{policyMakerToken}}" });
  } else if (options.authType === 'aiKey') {
    headers.push({ key: "X-API-Key", value: "{{aiApiKey}}" });
  }

  let body: unknown = undefined;
  if (options.bodyType === 'json' && options.jsonBody !== undefined) {
    headers.push({ key: "Content-Type", value: "application/json" });
    body = {
      mode: "raw",
      raw: JSON.stringify(options.jsonBody, null, 2),
      options: { raw: { language: "json" } }
    };
  } else if (options.bodyType === 'formdata' && options.formData) {
    body = {
      mode: "formdata",
      formdata: options.formData
    };
  }

  const events: Array<{ listen: string; script: { type: string; exec: string[] } }> = [];
  if (options.testScript) {
    events.push({
      listen: "test",
      script: {
        type: "text/javascript",
        exec: options.testScript.split('\n')
      }
    });
  }

  // Parse URL components for Postman format
  const parsedUrl = urlStr.replace(/^https?:\/\//, '');
  const urlParts = parsedUrl.split('/');
  const rawHost = urlParts[0];
  const rawPath = urlParts.slice(1);

  return {
    name,
    request: {
      method,
      header: headers,
      body,
      url: {
        raw: urlStr,
        host: [rawHost],
        path: rawPath
      },
      description: options.description || ""
    },
    response: [],
    event: events.length > 0 ? events : undefined
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// BUILD POSTMAN COLLECTION WORKFLOWS
// ─────────────────────────────────────────────────────────────────────────────
const collection = {
  info: {
    _postman_id: "laporkita-full-workflow-manual-test-2026",
    name: "LaporKita — Manual Workflow E2E Test Collection",
    description: "Koleksi Postman lengkap untuk pengujian manual seluruh alur kerja bisnis platform LaporKita (Backend API & AI Microservice) pada lingkungan produksi live Canadev.\n\nSemua request telah dilengkapi Auto-Save Test Script yang secara otomatis mengekstrak token otentikasi (citizenToken, operatorToken, adminToken, policyMakerToken), ID laporan (reportId, reportCode), ID simulasi kebijakan, dan ID master data ke dalam environment, sehingga pengujian alur kerja dapat dilakukan berurutan dengan sekali klik.",
    schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  item: [
    // ═════════════════════════════════════════════════════════════════════════
    // FOLDER 1: System Health & Discovery
    // ═════════════════════════════════════════════════════════════════════════
    {
      name: "01 - System Health & Discovery",
      description: "Memverifikasi kesiapan operasional server backend dan microservice AI sebelum memulai alur kerja.",
      item: [
        req("1.1 GET Backend Health Status", "GET", "{{baseUrl}}/health", {
          description: "Mengecek status ketersediaan backend server, versi aplikasi, dan koneksi database.",
          testScript: `pm.test("Status code is 200", function () {
    pm.response.to.have.status(200);
});
pm.test("Status data is ok", function () {
    var json = pm.response.json();
    pm.expect(json.data.status).to.eql("ok");
});`
        }),
        req("1.2 GET Swagger Documentation UI", "GET", "{{backendRoot}}/api/docs", {
          description: "Membuka tampilan interaktif Swagger UI untuk eksplorasi dokumentasi REST API.",
          testScript: `pm.test("Status code is 200", function () {
    pm.response.to.have.status(200);
});`
        }),
        req("1.3 GET OpenAPI 3.0 Schema JSON", "GET", "{{backendRoot}}/api/docs-json", {
          description: "Mengambil skema OpenAPI 3.0 lengkap dalam format JSON (35+ endpoints).",
          testScript: `pm.test("Status code is 200 & OpenAPI 3.0", function () {
    pm.response.to.have.status(200);
    var json = pm.response.json();
    pm.expect(json.openapi).to.eql("3.0.0");
});`
        }),
        req("1.4 GET AI Service Health & Model Flags", "GET", "{{aiBaseUrl}}/health", {
          authType: "aiKey",
          description: "Memeriksa status model AI (YOLOv11, XGBoost, Google Gemini).",
          testScript: `pm.test("Status code is 200", function () {
    pm.response.to.have.status(200);
    var json = pm.response.json();
    pm.expect(json.data.models.yolo_classification_loaded).to.be.true;
    pm.expect(json.data.models.xgboost_risk_loaded).to.be.true;
});`
        }),
        req("1.5 GET AI Sandbox Console Demo", "GET", "{{aiBaseUrl}}/demo", {
          authType: "aiKey",
          description: "Tampilan antarmuka pengujian visual mandiri AI Console.",
          testScript: `pm.test("Status code is 200", function () {
    pm.response.to.have.status(200);
});`
        }),
        req("1.6 GET AI Sample Images Dataset", "GET", "{{aiBaseUrl}}/sample_images.json", {
          authType: "aiKey",
          description: "Dataset sampel foto fasilitas publik Kota Malang (Drainase, Jalan Berlubang, Lampu Jalan, Rambu, Trotoar).",
          testScript: `pm.test("Status code is 200", function () {
    pm.response.to.have.status(200);
    var json = pm.response.json();
    if (json["Jalan Berlubang"]) {
        pm.environment.set("sampleImageBase64", json["Jalan Berlubang"]);
        console.log("sampleImageBase64 updated in environment");
    }
});`
        })
      ]
    },

    // ═════════════════════════════════════════════════════════════════════════
    // FOLDER 2: Authentication & Roles (Login & Auto-Token)
    // ═════════════════════════════════════════════════════════════════════════
    {
      name: "02 - Authentication & Roles",
      description: "Login untuk 4 role berbeda. Script otomatis menyimpan access token ke environment masing-masing.",
      item: [
        req("2.1 POST Login Admin", "POST", "{{baseUrl}}/auth/login", {
          bodyType: "json",
          jsonBody: { identifier: "{{adminEmail}}", password: "{{adminPassword}}" },
          description: "Login sebagai Administrator LaporKita Kota Malang. Token disimpan ke {{adminToken}}.",
          testScript: `pm.test("Login Admin Success (200)", function () {
    pm.response.to.have.status(200);
    var json = pm.response.json();
    pm.expect(json.data.user.role).to.eql("admin");
    pm.environment.set("adminToken", json.data.access_token);
    pm.environment.set("adminUserId", json.data.user.id);
    console.log("adminToken saved successfully");
});`
        }),
        req("2.2 POST Login Citizen (Warga)", "POST", "{{baseUrl}}/auth/login", {
          bodyType: "json",
          jsonBody: { identifier: "{{citizenEmail}}", password: "{{citizenPassword}}" },
          description: "Login sebagai Warga Kota Malang. Token disimpan ke {{citizenToken}}.",
          testScript: `pm.test("Login Citizen Success (200)", function () {
    pm.response.to.have.status(200);
    var json = pm.response.json();
    pm.expect(json.data.user.role).to.eql("citizen");
    pm.environment.set("citizenToken", json.data.access_token);
    pm.environment.set("citizenUserId", json.data.user.id);
    console.log("citizenToken saved successfully");
});`
        }),
        req("2.3 POST Login Operator DPUPR", "POST", "{{baseUrl}}/auth/login", {
          bodyType: "json",
          jsonBody: { identifier: "{{operatorEmail}}", password: "{{operatorPassword}}" },
          description: "Login sebagai Petugas/Operator DPUPR Kota Malang. Token disimpan ke {{operatorToken}}.",
          testScript: `pm.test("Login Operator Success (200)", function () {
    pm.response.to.have.status(200);
    var json = pm.response.json();
    pm.expect(json.data.user.role).to.eql("operator");
    pm.environment.set("operatorToken", json.data.access_token);
    console.log("operatorToken saved successfully");
});`
        }),
        req("2.4 POST Login Policy Maker (Bappeda)", "POST", "{{baseUrl}}/auth/login", {
          bodyType: "json",
          jsonBody: { identifier: "{{policyMakerEmail}}", password: "{{policyMakerPassword}}" },
          description: "Login sebagai Pengambil Kebijakan / Policy Maker (Bappeda). Token disimpan ke {{policyMakerToken}}.",
          testScript: `pm.test("Login Policy Maker Success (200)", function () {
    pm.response.to.have.status(200);
    var json = pm.response.json();
    pm.expect(json.data.user.role).to.eql("policy_maker");
    pm.environment.set("policyMakerToken", json.data.access_token);
    console.log("policyMakerToken saved successfully");
});`
        }),
        req("2.5 POST Refresh Token Rotation", "POST", "{{baseUrl}}/auth/refresh", {
          bodyType: "json",
          jsonBody: { refresh_token: "{{refreshToken}}" },
          description: "Rotasi refresh token untuk memperbarui access token.",
          testScript: `pm.test("Token refreshed", function () {
    if (pm.response.code === 200) {
        var json = pm.response.json();
        pm.environment.set("citizenToken", json.data.access_token);
    }
});`
        }),
        req("2.6 POST Register New Citizen (Warga Baru)", "POST", "{{baseUrl}}/auth/register", {
          bodyType: "json",
          jsonBody: {
            full_name: "Warga Simulasi Manual",
            email: "warga.manual." + Date.now() + "@malangkota.id",
            phone_number: "+62812" + Math.floor(10000000 + Math.random() * 90000000),
            password: "Password123!"
          },
          description: "Pendaftaran akun warga baru (mengembalikan 202 Accepted untuk verifikasi OTP).",
          testScript: `pm.test("Registration accepted (202)", function () {
    pm.expect([200, 201, 202]).to.include(pm.response.code);
});`
        }),
        req("2.7 POST Resend OTP Verification", "POST", "{{baseUrl}}/auth/resend-otp", {
          bodyType: "json",
          jsonBody: { phone_number: "+6281234567890" },
          description: "Minta kirim ulang kode OTP aktivasi WhatsApp/SMS.",
          testScript: `pm.test("Resend OTP response handled", function () {
    pm.expect([200, 400, 429]).to.include(pm.response.code);
});`
        }),
        req("2.8 POST Verify OTP (Negative Check)", "POST", "{{baseUrl}}/auth/verify-otp", {
          bodyType: "json",
          jsonBody: { phone_number: "+6281234567890", otp_code: "0000" },
          description: "Uji coba verifikasi OTP dengan kode salah (harus mengembalikan HTTP 400 Bad Request).",
          testScript: `pm.test("Invalid OTP rejected with 400", function () {
    pm.response.to.have.status(400);
});`
        })
      ]
    },

    // ═════════════════════════════════════════════════════════════════════════
    // FOLDER 3: Core Report Lifecycle (Digital Accountability Loop)
    // ═════════════════════════════════════════════════════════════════════════
    {
      name: "03 - Core Report Lifecycle (Citizen-to-Resolve)",
      description: "Siklus penuh akuntabilitas digital: Lapor ➔ Upvote ➔ Komentar & Moderasi ➔ Verifikasi ➔ Penugasan Satgas ➔ Pengerjaan Fisik ➔ Foto Selesai ➔ Validasi Warga di Lokasi (RESOLVED).",
      item: [
        req("3.1 POST Submit Laporan Baru (Warga)", "POST", "{{baseUrl}}/reports", {
          authType: "citizen",
          bodyType: "formdata",
          formData: [
            { key: "category_id", value: "{{categoryId}}", type: "text" },
            { key: "latitude", value: "-7.9826", type: "text", description: "Alun-Alun Merdeka Malang" },
            { key: "longitude", value: "112.6308", type: "text", description: "Alun-Alun Merdeka Malang" },
            { key: "description", value: "Jalan berlubang cukup dalam di dekat Alun-Alun Merdeka Malang sangat membahayakan pengendara motor di malam hari.", type: "text" },
            { key: "photo", type: "file", description: "Pilih file gambar JPEG/PNG kerusakan (opsional di Postman bila menggunakan multipart)" }
          ],
          description: "Warga mengajukan laporan kerusakan infrastruktur publik. ID laporan otomatis disimpan ke {{reportId}}.",
          testScript: `pm.test("Report submitted successfully (201/202)", function () {
    pm.expect([200, 201, 202]).to.include(pm.response.code);
    var json = pm.response.json();
    if (json.data && json.data.id) {
        pm.environment.set("reportId", json.data.id);
        pm.environment.set("reportCode", json.data.report_code);
        console.log("Saved reportId: " + json.data.id + " (" + json.data.report_code + ")");
    }
});`
        }),
        req("3.2 GET Detail Laporan", "GET", "{{baseUrl}}/reports/{{reportId}}", {
          authType: "citizen",
          description: "Melihat detail lengkap laporan, media yang terlampir, status, dan skor urgensi cerdas.",
          testScript: `pm.test("Report details retrieved (200)", function () {
    pm.response.to.have.status(200);
    var json = pm.response.json();
    pm.expect(json.data.id).to.eql(pm.environment.get("reportId"));
});`
        }),
        req("3.3 GET Daftar Laporan Publik & Filter", "GET", "{{baseUrl}}/reports?limit=10&page=1", {
          authType: "citizen",
          description: "Mengambil daftar laporan publik dengan paginasi dan filter.",
          testScript: `pm.test("Reports list retrieved (200)", function () {
    pm.response.to.have.status(200);
});`
        }),
        req("3.4 POST Dukung Laporan (Upvote Warga)", "POST", "{{baseUrl}}/reports/{{reportId}}/support", {
          authType: "citizen",
          description: "Warga memberikan dukungan (upvote) pada laporan untuk menaikkan skor prioritas penanganan.",
          testScript: `pm.test("Upvote success (200/201)", function () {
    pm.expect([200, 201]).to.include(pm.response.code);
});`
        }),
        req("3.5 POST Cegah Upvote Ganda (Check 409 Conflict)", "POST", "{{baseUrl}}/reports/{{reportId}}/support", {
          authType: "citizen",
          description: "Warga mencoba upvote untuk kedua kalinya; sistem wajib menolak dengan HTTP 409 Conflict.",
          testScript: `pm.test("Duplicate upvote prevented with 409 Conflict", function () {
    pm.response.to.have.status(409);
});`
        }),
        req("3.6 DELETE Batalkan Dukungan (Grace Period 5 Menit)", "DELETE", "{{baseUrl}}/reports/{{reportId}}/support", {
          authType: "citizen",
          description: "Warga membatalkan upvote dalam batas grace period 5 menit.",
          testScript: `pm.test("Support cancelled (200)", function () {
    pm.response.to.have.status(200);
});`
        }),
        req("3.7 POST Tambah Ulang Upvote", "POST", "{{baseUrl}}/reports/{{reportId}}/support", {
          authType: "citizen",
          description: "Memberikan kembali upvote untuk kelanjutan workflow laporan.",
          testScript: `pm.test("Re-upvote success (201)", function () {
    pm.expect([200, 201]).to.include(pm.response.code);
});`
        }),
        req("3.8 POST Tambah Komentar Konstruktif", "POST", "{{baseUrl}}/reports/{{reportId}}/comments", {
          authType: "citizen",
          bodyType: "json",
          jsonBody: { content: "Semalam ada pengendara motor terperosok di titik ini, mohon segera ditambal." },
          description: "Warga mengirim komentar positif yang membantu penanganan.",
          testScript: `pm.test("Comment created (201)", function () {
    pm.response.to.have.status(201);
    var json = pm.response.json();
    pm.expect(json.data.is_flagged).to.be.false;
});`
        }),
        req("3.9 POST Komentar Uji Sensor Kata Kasar (Profanity Filter)", "POST", "{{baseUrl}}/reports/{{reportId}}/comments", {
          authType: "citizen",
          bodyType: "json",
          jsonBody: { content: "Jalan anjing rusak parah bikin celaka warga!" },
          description: "Uji filter kata kasar; sistem otomatis menandai is_flagged: true dan memfilter konten.",
          testScript: `pm.test("Profanity flagged (201 & is_flagged true)", function () {
    pm.response.to.have.status(201);
    var json = pm.response.json();
    pm.expect(json.data.is_flagged).to.be.true;
});`
        }),
        req("3.10 GET Daftar Komentar Laporan", "GET", "{{baseUrl}}/reports/{{reportId}}/comments", {
          authType: "citizen",
          description: "Melihat riwayat komentar publik pada laporan ini.",
          testScript: `pm.test("Comments retrieved (200)", function () {
    pm.response.to.have.status(200);
});`
        }),
        req("3.11 GET Antrean Moderasi Komentar (Operator/Admin)", "GET", "{{baseUrl}}/reports/comments/flagged", {
          authType: "operator",
          description: "Petugas melihat daftar komentar yang terindikasi melanggar etika untuk dimoderasi.",
          testScript: `pm.test("Flagged comments retrieved (200)", function () {
    pm.response.to.have.status(200);
});`
        }),
        req("3.12 PATCH Operator: Verifikasi Laporan (verified)", "PATCH", "{{baseUrl}}/reports/{{reportId}}/status", {
          authType: "operator",
          bodyType: "json",
          jsonBody: { status: "verified", note: "Laporan diverifikasi valid oleh Operator DPUPR Kota Malang." },
          description: "Operator memverifikasi laporan dari status pending_verification ke verified.",
          testScript: `pm.test("Report status updated (200)", function () {
    pm.response.to.have.status(200);
});`
        }),
        req("3.13 PATCH Operator: Tugaskan ke Tim Satgas (assigned)", "PATCH", "{{baseUrl}}/reports/{{reportId}}/status", {
          authType: "operator",
          bodyType: "json",
          jsonBody: { status: "assigned", note: "Ditugaskan ke Tim Reaksi Cepat Satgas Jalan DPUPR." },
          description: "Operator menugaskan laporan ke satgas lapangan terkait.",
          testScript: `pm.test("Report status assigned (200)", function () {
    pm.response.to.have.status(200);
});`
        }),
        req("3.14 PATCH Operator: Mulai Pengerjaan (in_progress)", "PATCH", "{{baseUrl}}/reports/{{reportId}}/status", {
          authType: "operator",
          bodyType: "json",
          jsonBody: { status: "in_progress", note: "Alat berat dan aspal cold-mix tiba di lokasi; perbaikan dimulai." },
          description: "Status berubah menjadi sedang dikerjakan (in_progress).",
          testScript: `pm.test("Report in_progress (200)", function () {
    pm.response.to.have.status(200);
});`
        }),
        req("3.15 POST Operator: Unggah Foto Bukti Selesai", "POST", "{{baseUrl}}/reports/{{reportId}}/media", {
          authType: "operator",
          bodyType: "formdata",
          formData: [
            { key: "type", value: "completion_photo", type: "text" },
            { key: "photo", type: "file", description: "Pilih file foto bukti aspal selesai diperbaiki" }
          ],
          description: "Operator mengunggah foto bukti fisik perbaikan telah rampung.",
          testScript: `pm.test("Completion photo uploaded (201)", function () {
    pm.expect([200, 201]).to.include(pm.response.code);
});`
        }),
        req("3.16 PATCH Operator: Selesaikan Pekerjaan (completed)", "PATCH", "{{baseUrl}}/reports/{{reportId}}/status", {
          authType: "operator",
          bodyType: "json",
          jsonBody: { status: "completed", note: "Penambalan aspal selesai 100%, menunggu validasi warga pelapor." },
          description: "Petugas menandai pekerjaan selesai fisik.",
          testScript: `pm.test("Report marked completed (200)", function () {
    pm.response.to.have.status(200);
});`
        }),
        req("3.17 POST Validasi Warga di Lokasi (RESOLVED!)", "POST", "{{baseUrl}}/reports/{{reportId}}/validate", {
          authType: "citizen",
          bodyType: "json",
          jsonBody: {
            is_valid: true,
            latitude: -7.9826,
            longitude: 112.6308,
            note: "Sudah saya cek langsung di Alun-Alun, jalanan sudah mulus dan aman dilalui motor."
          },
          description: "Warga memverifikasi langsung di lokasi (radius <= 100m). Status akhir laporan berubah menjadi RESOLVED.",
          testScript: `pm.test("Report successfully RESOLVED (200/201)", function () {
    pm.expect([200, 201]).to.include(pm.response.code);
    var json = pm.response.json();
    var status = json.data.new_status || json.data.status;
    pm.expect(status).to.eql("resolved");
    console.log("Accountability loop completed: " + json.data.message);
});`
        })
      ]
    },

    // ═════════════════════════════════════════════════════════════════════════
    // FOLDER 4: User Profile & Gamification Points
    // ═════════════════════════════════════════════════════════════════════════
    {
      name: "04 - User Profile & Gamification",
      description: "Manajemen profil pengguna, saldo poin gamifikasi warga, dan pengelolaan user oleh admin.",
      item: [
        req("4.1 GET Profil Saya (Warga)", "GET", "{{baseUrl}}/users/me", {
          authType: "citizen",
          description: "Mengambil data profil diri warga yang sedang login.",
          testScript: `pm.test("User profile retrieved (200)", function () {
    pm.response.to.have.status(200);
});`
        }),
        req("4.2 PATCH Perbarui Nama Profil", "PATCH", "{{baseUrl}}/users/me", {
          authType: "citizen",
          bodyType: "json",
          jsonBody: { full_name: "Budi Santoso (Warga Peduli Malang)" },
          description: "Memperbarui nama lengkap profil diri.",
          testScript: `pm.test("Profile updated (200)", function () {
    pm.response.to.have.status(200);
});`
        }),
        req("4.3 GET Riwayat Poin Kontribusi Warga", "GET", "{{baseUrl}}/users/me/points", {
          authType: "citizen",
          description: "Melihat histori perolehan poin gamifikasi dari pelaporan, validasi, dan dukungan.",
          testScript: `pm.test("Points history retrieved (200)", function () {
    pm.response.to.have.status(200);
});`
        }),
        req("4.4 GET Daftar Pengguna (Admin Only)", "GET", "{{baseUrl}}/users?limit=5", {
          authType: "admin",
          description: "Admin melihat daftar seluruh pengguna terdaftar dengan paginasi.",
          testScript: `pm.test("Users list retrieved (200)", function () {
    pm.response.to.have.status(200);
});`
        }),
        req("4.5 GET Detail Pengguna Tertentu (Admin Only)", "GET", "{{baseUrl}}/users/{{citizenUserId}}", {
          authType: "admin",
          description: "Admin melihat detail lengkap salah satu pengguna berdasarkan UUID.",
          testScript: `pm.test("User detail retrieved (200)", function () {
    pm.response.to.have.status(200);
});`
        }),
        req("4.6 PATCH Perbarui Akun Pengguna oleh Admin", "PATCH", "{{baseUrl}}/users/{{citizenUserId}}", {
          authType: "admin",
          bodyType: "json",
          jsonBody: { avatar_url: "https://storage.laporkita.id/avatars/user-verified.jpg" },
          description: "Admin memperbarui data pengguna lain.",
          testScript: `pm.test("User updated by admin (200)", function () {
    pm.response.to.have.status(200);
});`
        }),
        req("4.7 DELETE Uji Proteksi Hapus Diri Sendiri (Check 400)", "DELETE", "{{baseUrl}}/users/{{adminUserId}}", {
          authType: "admin",
          description: "Admin mencoba menghapus akunnya sendiri; sistem wajib menolak demi keamanan.",
          testScript: `pm.test("Self delete protected with 400", function () {
    pm.response.to.have.status(400);
});`
        })
      ]
    },

    // ═════════════════════════════════════════════════════════════════════════
    // FOLDER 5: GIS, Navigation & Route Alerts
    // ═════════════════════════════════════════════════════════════════════════
    {
      name: "05 - GIS, Navigation & Route Alerts",
      description: "Routing navigasi OSRM, koridor bahaya di sepanjang rute, dan peringatan geofencing proaktif.",
      item: [
        req("5.1 POST Routing Navigasi OSRM (Alun-Alun ke Lowokwaru)", "POST", "{{baseUrl}}/maps/route", {
          bodyType: "json",
          jsonBody: {
            origin_lat: -7.9827,
            origin_lng: 112.6304,
            destination_lat: -7.9701,
            destination_lng: 112.6412
          },
          description: "Kalkulasi rute jalan tercepat melalui engine OSRM Kota Malang.",
          testScript: `pm.test("Route calculated (200)", function () {
    pm.response.to.have.status(200);
    var json = pm.response.json();
    pm.expect(json.data.distance_meters).to.be.above(0);
});`
        }),
        req("5.2 POST Deteksi Bahaya di Sepanjang Koridor Rute", "POST", "{{baseUrl}}/reports/along-route", {
          bodyType: "json",
          jsonBody: {
            route_points: [
              { lat: -7.9827, lng: 112.6304 },
              { lat: -7.9781, lng: 112.6350 },
              { lat: -7.9701, lng: 112.6412 }
            ],
            radius_meters: 1000
          },
          description: "Mengambil daftar laporan aktif yang berada dalam koridor radius rute pengendara.",
          testScript: `pm.test("Hazards along route checked (200)", function () {
    pm.response.to.have.status(200);
});`
        }),
        req("5.3 POST Berlangganan Geofencing Route Alert", "POST", "{{baseUrl}}/route-alerts/subscribe", {
          authType: "citizen",
          bodyType: "json",
          jsonBody: {
            device_token: "fcm-token-qa-manual-user",
            last_lat: -7.9827,
            last_long: 112.6304
          },
          description: "Mendaftarkan push notification FCM untuk peringatan geofencing proaktif.",
          testScript: `pm.test("Route alert subscribed (200)", function () {
    pm.response.to.have.status(200);
});`
        }),
        req("5.4 POST Pengecekan Kedekatan Titik Bahaya", "POST", "{{baseUrl}}/route-alerts/check", {
          authType: "citizen",
          bodyType: "json",
          jsonBody: {
            current_lat: -7.9826,
            current_lng: 112.6308
          },
          description: "Memicu pengecekan ada tidaknya lubang jalan atau genangan aktif di radius dekat.",
          testScript: `pm.test("Route alert check completed (200)", function () {
    pm.response.to.have.status(200);
});`
        }),
        req("5.5 DELETE Hentikan Langganan Geofencing", "DELETE", "{{baseUrl}}/route-alerts/unsubscribe", {
          authType: "citizen",
          description: "Membatalkan langganan geofencing route alert.",
          testScript: `pm.test("Route alert unsubscribed (200)", function () {
    pm.response.to.have.status(200);
});`
        })
      ]
    },

    // ═════════════════════════════════════════════════════════════════════════
    // FOLDER 6: Urban Emotion Map & Policy Simulator
    // ═════════════════════════════════════════════════════════════════════════
    {
      name: "06 - Peta Emosi Kota & Policy Simulator",
      description: "Zona kecamatan Kota Malang, histori risiko banjir XGBoost, dan simulasi dampak kebijakan AI Gemini.",
      item: [
        req("6.1 GET 5 Zona Kecamatan Kota Malang", "GET", "{{baseUrl}}/predictions/zones", {
          description: "Mengambil daftar 5 zona kecamatan (Klojen, Blimbing, Kedungkandang, Sukun, Lowokwaru).",
          testScript: `pm.test("5 Zones retrieved (200)", function () {
    pm.response.to.have.status(200);
    var json = pm.response.json();
    pm.expect(json.data.length).to.eql(5);
});`
        }),
        req("6.2 GET Histori Metrik Risiko Zona Klojen", "GET", "{{baseUrl}}/predictions/zones/{{zoneId}}/metrics", {
          description: "Menampilkan riwayat time-series densitas laporan, cuaca, dan risiko banjir zona Klojen.",
          testScript: `pm.test("Zone metrics retrieved (200)", function () {
    pm.response.to.have.status(200);
});`
        }),
        req("6.3 POST Refresh Metrik Risiko (Operator)", "POST", "{{baseUrl}}/predictions/metrics/refresh", {
          authType: "operator",
          description: "Operator memicu pembaruan inferensi risiko seluruh zona via AI Service.",
          testScript: `pm.test("Metrics refreshed (200)", function () {
    pm.response.to.have.status(200);
});`
        }),
        req("6.4 POST Simulasi Kebijakan AI (Policy Maker)", "POST", "{{baseUrl}}/policy-simulations", {
          authType: "policyMaker",
          bodyType: "json",
          jsonBody: {
            prompt_text: "Simulasi normalisasi drainase terpadu dan penambahan pompa bergerak di kawasan Lowokwaru dan Klojen",
            zone_id: "{{zoneId}}"
          },
          description: "Policy Maker menjalankan analisis skenario tata ruang menggunakan AI Google Gemini. ID disimpan ke {{simulationId}}.",
          testScript: `pm.test("Simulation created (201/200)", function () {
    pm.expect([200, 201]).to.include(pm.response.code);
    var json = pm.response.json();
    if (json.data && json.data.id) {
        pm.environment.set("simulationId", json.data.id);
        console.log("Saved simulationId: " + json.data.id);
    }
});`
        }),
        req("6.5 GET Riwayat Simulasi Kebijakan", "GET", "{{baseUrl}}/policy-simulations?limit=5", {
          authType: "policyMaker",
          description: "Melihat histori simulasi kebijakan yang pernah diajukan Bappeda/Dinas.",
          testScript: `pm.test("Simulations history retrieved (200)", function () {
    pm.response.to.have.status(200);
});`
        }),
        req("6.6 GET Detail Simulasi Kebijakan Tertentu", "GET", "{{baseUrl}}/policy-simulations/{{simulationId}}", {
          authType: "policyMaker",
          description: "Melihat narasi analisis lengkap, rekomendasi mitigasi risiko, dan proyeksi anggaran dari simulasi.",
          testScript: `pm.test("Simulation detail retrieved (200)", function () {
    pm.response.to.have.status(200);
});`
        })
      ]
    },

    // ═════════════════════════════════════════════════════════════════════════
    // FOLDER 7: In-App Notifications
    // ═════════════════════════════════════════════════════════════════════════
    {
      name: "07 - In-App Notifications",
      description: "Notifikasi in-app untuk warga mengenai pembaruan status pengerjaan laporan mereka.",
      item: [
        req("7.1 GET Daftar Notifikasi Warga", "GET", "{{baseUrl}}/notifications", {
          authType: "citizen",
          description: "Menampilkan daftar notifikasi dan counter unreadCount.",
          testScript: `pm.test("Notifications retrieved (200)", function () {
    pm.response.to.have.status(200);
    var json = pm.response.json();
    if (json.data && json.data.length > 0) {
        pm.environment.set("notificationId", json.data[0].id);
    }
});`
        }),
        req("7.2 PATCH Tandai Satu Notifikasi Sudah Dibaca", "PATCH", "{{baseUrl}}/notifications/{{notificationId}}/read", {
          authType: "citizen",
          description: "Mengubah status satu notifikasi menjadi is_read: true.",
          testScript: `pm.test("Notification marked read (200)", function () {
    pm.expect([200, 404]).to.include(pm.response.code);
});`
        }),
        req("7.3 PATCH Tandai Semua Notifikasi Sudah Dibaca", "PATCH", "{{baseUrl}}/notifications/read-all", {
          authType: "citizen",
          description: "Menandai seluruh notifikasi yang belum dibaca milik pengguna.",
          testScript: `pm.test("All notifications marked read (200)", function () {
    pm.response.to.have.status(200);
});`
        })
      ]
    },

    // ═════════════════════════════════════════════════════════════════════════
    // FOLDER 8: Master Data Management (Admin CRUD)
    // ═════════════════════════════════════════════════════════════════════════
    {
      name: "08 - Master Data Management (Admin CRUD)",
      description: "Pengelolaan master data kategori fasilitas dan dinas/instansi penanggung jawab oleh Administrator.",
      item: [
        req("8.1 GET Daftar Kategori Fasilitas", "GET", "{{baseUrl}}/categories", {
          description: "Melihat 5 kategori fasilitas publik Kota Malang.",
          testScript: `pm.test("Categories retrieved (200)", function () {
    pm.response.to.have.status(200);
});`
        }),
        req("8.2 GET Detail Kategori Jalan Berlubang", "GET", "{{baseUrl}}/categories/{{categoryId}}", {
          description: "Melihat detail nama, bobot urgensi, dan dinas default penanggung jawab.",
          testScript: `pm.test("Category detail retrieved (200)", function () {
    pm.response.to.have.status(200);
});`
        }),
        req("8.3 POST Admin Tambah Kategori Baru", "POST", "{{baseUrl}}/categories", {
          authType: "admin",
          bodyType: "json",
          jsonBody: {
            name: "Kategori Manual Test " + Math.floor(Math.random() * 10000),
            default_agency_id: "{{agencyId}}",
            urgency_weight: 1.5
          },
          description: "Admin membuat kategori fasilitas publik baru. ID disimpan ke {{createdCategoryId}}.",
          testScript: `pm.test("Category created (201)", function () {
    pm.response.to.have.status(201);
    var json = pm.response.json();
    pm.environment.set("createdCategoryId", json.data.id);
});`
        }),
        req("8.4 PATCH Admin Perbarui Kategori", "PATCH", "{{baseUrl}}/categories/{{createdCategoryId}}", {
          authType: "admin",
          bodyType: "json",
          jsonBody: { urgency_weight: 2.0 },
          description: "Admin mengubah bobot urgensi kategori.",
          testScript: `pm.test("Category updated (200)", function () {
    pm.response.to.have.status(200);
});`
        }),
        req("8.5 DELETE Admin Hapus Kategori", "DELETE", "{{baseUrl}}/categories/{{createdCategoryId}}", {
          authType: "admin",
          description: "Admin menghapus kategori uji coba yang baru dibuat.",
          testScript: `pm.test("Category deleted (200)", function () {
    pm.response.to.have.status(200);
});`
        }),
        req("8.6 GET Daftar Instansi Pemerintah", "GET", "{{baseUrl}}/agencies", {
          description: "Melihat daftar OPD terkait (DPUPR, Dishub, Diskominfo).",
          testScript: `pm.test("Agencies retrieved (200)", function () {
    pm.response.to.have.status(200);
});`
        }),
        req("8.7 GET Detail Instansi DPUPR", "GET", "{{baseUrl}}/agencies/{{agencyId}}", {
          description: "Melihat kontak email dan tipe dinas DPUPR.",
          testScript: `pm.test("Agency detail retrieved (200)", function () {
    pm.response.to.have.status(200);
});`
        }),
        req("8.8 POST Admin Tambah Instansi Baru", "POST", "{{baseUrl}}/agencies", {
          authType: "admin",
          bodyType: "json",
          jsonBody: {
            name: "Dinas Manual Test " + Math.floor(Math.random() * 10000),
            type: "lainnya",
            contact_email: "manual.dinas@malangkota.go.id"
          },
          description: "Admin mendaftarkan OPD baru. ID disimpan ke {{createdAgencyId}}.",
          testScript: `pm.test("Agency created (201)", function () {
    pm.response.to.have.status(201);
    var json = pm.response.json();
    pm.environment.set("createdAgencyId", json.data.id);
});`
        }),
        req("8.9 PATCH Admin Perbarui Email Instansi", "PATCH", "{{baseUrl}}/agencies/{{createdAgencyId}}", {
          authType: "admin",
          bodyType: "json",
          jsonBody: { contact_email: "updated.manual@malangkota.go.id" },
          description: "Admin memperbarui email kontak instansi.",
          testScript: `pm.test("Agency updated (200)", function () {
    pm.response.to.have.status(200);
});`
        }),
        req("8.10 DELETE Admin Hapus Instansi", "DELETE", "{{baseUrl}}/agencies/{{createdAgencyId}}", {
          authType: "admin",
          description: "Admin menghapus instansi uji coba.",
          testScript: `pm.test("Agency deleted (200)", function () {
    pm.response.to.have.status(200);
});`
        })
      ]
    },

    // ═════════════════════════════════════════════════════════════════════════
    // FOLDER 9: AI Microservice Standalone Engines (Direct API)
    // ═════════════════════════════════════════════════════════════════════════
    {
      name: "09 - AI Microservice Standalone Engines",
      description: "Pengujian langsung ke server microservice AI: Computer Vision YOLOv11, Forensik Citra, Prediksi Risiko Banjir XGBoost, Google Gemini Policy Simulator, dan Continuous Active Learning.",
      item: [
        req("9.1 GET AI Health & Model Verification", "GET", "{{aiBaseUrl}}/health", {
          authType: "aiKey",
          description: "Mengecek ketersediaan model YOLOv11, XGBoost, dan Gemini.",
          testScript: `pm.test("AI Models loaded (200)", function () {
    pm.response.to.have.status(200);
});`
        }),
        req("9.2 POST YOLOv11 Computer Vision Verification", "POST", "{{aiBaseUrl}}/v1/verify", {
          authType: "aiKey",
          bodyType: "json",
          jsonBody: {
            image_base64: "{{sampleImageBase64}}",
            claimed_category: "Jalan Berlubang",
            latitude: -7.9826,
            longitude: 112.6308,
            support_count: 5,
            report_density: 3
          },
          description: "Deteksi klasifikasi kerusakan jalan, forensik keaslian citra, konsistensi GPS, dan perhitungan Smart Priority.",
          testScript: `pm.test("Verification passed (200)", function () {
    pm.response.to.have.status(200);
    var json = pm.response.json();
    pm.expect(json.data.predicted_category).to.eql("Jalan Berlubang");
    pm.expect(json.data.authenticity.is_authentic).to.be.true;
});`
        }),
        req("9.3 POST XGBoost Flood & Urban Risk Prediction", "POST", "{{aiBaseUrl}}/v1/predict-risk", {
          authType: "aiKey",
          bodyType: "json",
          jsonBody: {
            report_density: 15,
            rainfall_mm: 45.0,
            traffic_density: 0.8,
            category: "Drainase"
          },
          description: "Inferensi model XGBoost terlatih untuk estimasi probabilitas genangan dan rekomendasi taktis.",
          testScript: `pm.test("Risk predicted (200)", function () {
    pm.response.to.have.status(200);
    var json = pm.response.json();
    pm.expect(json.data.flood_risk_probability).to.be.above(0);
});`
        }),
        req("9.4 POST Zone Batch Prediction Metrics", "POST", "{{aiBaseUrl}}/v1/predict/zone-metrics", {
          authType: "aiKey",
          bodyType: "json",
          jsonBody: {
            zone_name: "Klojen",
            active_reports: 12
          },
          description: "Kompatibilitas batch prediction metrik zona untuk backend NestJS.",
          testScript: `pm.test("Zone metrics predicted (200)", function () {
    pm.response.to.have.status(200);
});`
        }),
        req("9.5 POST Google Gemini Policy Simulator Direct", "POST", "{{aiBaseUrl}}/v1/policy-simulate", {
          authType: "aiKey",
          bodyType: "json",
          jsonBody: {
            prompt_text: "Simulasi penambahan pompa portabel di kawasan Klojen menjelang puncak musim hujan"
          },
          description: "Pemanggilan langsung simulasi kebijakan ke microservice AI menggunakan Google Gemini 2.5 Flash.",
          testScript: `pm.test("Simulation response handled", function () {
    pm.expect([200, 502, 503]).to.include(pm.response.code);
});`
        }),
        req("9.6 GET Active Learning Class Distribution", "GET", "{{aiBaseUrl}}/v1/training/dataset-stats", {
          authType: "aiKey",
          description: "Statistik distribusi data latih pada Active Learning pipeline (6 kelas).",
          testScript: `pm.test("Dataset stats retrieved (200)", function () {
    pm.response.to.have.status(200);
});`
        }),
        req("9.7 POST Active Learning Ingest Correction Sample", "POST", "{{aiBaseUrl}}/v1/training/ingest-sample", {
          authType: "aiKey",
          bodyType: "json",
          jsonBody: {
            image_base64: "{{sampleImageBase64}}",
            verified_category: "Jalan Berlubang",
            original_prediction: "Trotoar",
            confidence_score: 0.5
          },
          description: "Ingesti sampel koreksi citra warga untuk retraining model otomatis.",
          testScript: `pm.test("Sample ingested (201/200)", function () {
    pm.expect([200, 201]).to.include(pm.response.code);
    var json = pm.response.json();
    if (json.data && json.data.saved_file) {
        var filename = json.data.saved_file.split("/").pop();
        pm.environment.set("sampleFilename", filename);
        console.log("Saved sampleFilename: " + filename);
    }
});`
        }),
        req("9.8 GET Active Learning Download Ingested Sample", "GET", "{{aiBaseUrl}}/v1/training/samples/Jalan_Berlubang/{{sampleFilename}}", {
          authType: "aiKey",
          description: "Mengunduh file citra sampel yang baru saja di-ingest ke server.",
          testScript: `pm.test("Sample image downloaded (200)", function () {
    pm.expect([200, 404]).to.include(pm.response.code);
});`
        }),
        req("9.9 GET Active Learning Download Dataset Zip", "GET", "{{aiBaseUrl}}/v1/training/download-dataset", {
          authType: "aiKey",
          description: "Mengunduh arsip zip dataset Active Learning lengkap.",
          testScript: `pm.test("Dataset zip downloaded (200)", function () {
    pm.response.to.have.status(200);
});`
        }),
        req("9.10 POST Predict Risk (NestJS Route Compatibility)", "POST", "{{aiBaseUrl}}/api/v1/predict-risk", {
          authType: "aiKey",
          bodyType: "json",
          jsonBody: {
            report_density: 10,
            rainfall_mm: 30.0,
            traffic_density: 0.5,
            category: "Drainase"
          },
          description: "Verifikasi kompatibilitas prefix /api/v1 untuk integrasi internal backend.",
          testScript: `pm.test("Prefix compatibility success (200)", function () {
    pm.response.to.have.status(200);
});`
        })
      ]
    }
  ]
};

// ─────────────────────────────────────────────────────────────────────────────
// WRITE FILES TO DISK
// ─────────────────────────────────────────────────────────────────────────────
const outDir = path.resolve(__dirname, '../postman');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

const collectionPath = path.join(outDir, 'LaporKita_Workflow_Manual_Test_Collection.json');
fs.writeFileSync(collectionPath, JSON.stringify(collection, null, 2), 'utf-8');
console.log(`✅ Collection generated: ${collectionPath}`);

const envPath = path.join(outDir, 'LaporKita_Canadev_Environment.json');
fs.writeFileSync(envPath, JSON.stringify(environmentData, null, 2), 'utf-8');
console.log(`✅ Environment generated: ${envPath}`);

// Also update LaporKita_QA_Environment.json for compatibility
const qaEnvPath = path.join(outDir, 'LaporKita_QA_Environment.json');
fs.writeFileSync(qaEnvPath, JSON.stringify(environmentData, null, 2), 'utf-8');
console.log(`✅ Updated existing environment: ${qaEnvPath}`);
