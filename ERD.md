# Entity Relationship Design (ERD)
## LaporKita — Database Schema Design

**Database:** PostgreSQL (via Supabase) | **ORM:** Prisma

---

## 1. Diagram Relasi (Overview)

```
Users ───┬───< Reports >───┬─── Categories
         │                 │
         │                 ├───< ReportStatusHistory
         │                 ├───< ReportSupports >─── Users
         │                 ├───< ReportComments >─── Users
         │                 ├───< ReportMedia
         │                 └───< CitizenValidations >─── Users
         │
         ├───< ContributionPoints
         ├───< Notifications
         └───< UserAgencies >─── Agencies

Zones ───< ZoneMetrics
PolicySimulations ─── Users (policy_maker)
Agencies ───< Reports (assigned_agency)
```

---

## 2. Definisi Entitas

### 2.1 `users`
| Kolom | Tipe | Keterangan |
|---|---|---|
| id | UUID (PK) | |
| full_name | VARCHAR | |
| email | VARCHAR (unique) | |
| phone_number | VARCHAR (unique) | |
| password_hash | VARCHAR | nullable jika login via OTP/OAuth |
| role | ENUM(`citizen`,`operator`,`policy_maker`,`admin`) | |
| agency_id | UUID (FK → agencies.id) | nullable, hanya untuk role operator/policy_maker |
| contribution_points | INT | default 0, denormalized dari `contribution_points` untuk performa baca cepat |
| avatar_url | VARCHAR | nullable |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

### 2.2 `agencies`
| Kolom | Tipe | Keterangan |
|---|---|---|
| id | UUID (PK) | |
| name | VARCHAR | mis. "DPUPR Kota Malang" |
| type | ENUM(`dpupr`,`dishub`,`diskominfo`,`lainnya`) | |
| contact_email | VARCHAR | |
| created_at | TIMESTAMP | |

### 2.3 `categories`
| Kolom | Tipe | Keterangan |
|---|---|---|
| id | UUID (PK) | |
| name | VARCHAR | Jalan Berlubang, Lampu Jalan, Rambu Lalu Lintas, Trotoar, Drainase |
| icon_url | VARCHAR | |
| default_agency_id | UUID (FK → agencies.id) | routing otomatis laporan ke instansi terkait |
| urgency_weight | FLOAT | bobot default untuk Smart Priority Engine |

### 2.4 `reports`
| Kolom | Tipe | Keterangan |
|---|---|---|
| id | UUID (PK) | |
| report_code | VARCHAR (unique) | format `#LP-2026-002487` |
| reporter_id | UUID (FK → users.id) | |
| category_id | UUID (FK → categories.id) | |
| assigned_agency_id | UUID (FK → agencies.id) | nullable |
| assigned_officer_id | UUID (FK → users.id) | nullable |
| description | TEXT | auto-generated oleh AI, dapat diedit |
| latitude | DECIMAL | |
| longitude | DECIMAL | |
| address_text | VARCHAR | hasil reverse geocoding |
| status | ENUM(`pending_verification`,`verified`,`rejected`,`assigned`,`in_progress`,`completed`,`resolved`,`disputed`) | |
| ai_confidence_score | FLOAT | hasil klasifikasi AI (0–1) |
| urgency_score | FLOAT | hasil Smart Priority Engine |
| support_count | INT | denormalized counter |
| view_count | INT | denormalized counter |
| estimated_completion_at | TIMESTAMP | nullable |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

### 2.5 `report_media`
| Kolom | Tipe | Keterangan |
|---|---|---|
| id | UUID (PK) | |
| report_id | UUID (FK → reports.id) | |
| type | ENUM(`initial_photo`,`progress_photo`,`completion_photo`) | |
| url | VARCHAR | |
| uploaded_by | UUID (FK → users.id) | |
| created_at | TIMESTAMP | |

### 2.6 `report_status_history`
| Kolom | Tipe | Keterangan |
|---|---|---|
| id | UUID (PK) | |
| report_id | UUID (FK → reports.id) | |
| status | ENUM (sama seperti `reports.status`) | |
| note | TEXT | nullable, catatan petugas |
| changed_by | UUID (FK → users.id) | nullable (system jika otomatis oleh AI) |
| created_at | TIMESTAMP | → menjadi basis tampilan timeline |

### 2.7 `report_supports` (Dukungan / Upvote)
| Kolom | Tipe | Keterangan |
|---|---|---|
| id | UUID (PK) | |
| report_id | UUID (FK → reports.id) | |
| user_id | UUID (FK → users.id) | |
| created_at | TIMESTAMP | |

*Unique constraint: (`report_id`, `user_id`) — satu user hanya bisa mendukung sekali per laporan.*

### 2.8 `report_comments`
| Kolom | Tipe | Keterangan |
|---|---|---|
| id | UUID (PK) | |
| report_id | UUID (FK → reports.id) | |
| user_id | UUID (FK → users.id) | |
| content | TEXT | |
| created_at | TIMESTAMP | |

### 2.9 `citizen_validations`
| Kolom | Tipe | Keterangan |
|---|---|---|
| id | UUID (PK) | |
| report_id | UUID (FK → reports.id) | |
| user_id | UUID (FK → users.id) | |
| is_valid | BOOLEAN | true = sesuai kondisi lapangan, false = dispute |
| note | TEXT | nullable |
| created_at | TIMESTAMP | |

### 2.10 `contribution_points_log`
| Kolom | Tipe | Keterangan |
|---|---|---|
| id | UUID (PK) | |
| user_id | UUID (FK → users.id) | |
| points | INT | bisa negatif (mis. laporan spam) |
| reason | ENUM(`report_submitted`,`report_verified`,`validation_given`,`support_given`) | |
| reference_report_id | UUID (FK → reports.id) | nullable |
| created_at | TIMESTAMP | |

### 2.11 `zones` (Urban Emotion Map)
| Kolom | Tipe | Keterangan |
|---|---|---|
| id | UUID (PK) | |
| name | VARCHAR | mis. "Klojen Utara" |
| geo_boundary | GEOMETRY(Polygon) | PostGIS |
| stress_level | ENUM(`low`,`medium`,`high`) | dihitung dari agregasi laporan |
| updated_at | TIMESTAMP | |

### 2.12 `zone_metrics` (histori metrik untuk prediksi)
| Kolom | Tipe | Keterangan |
|---|---|---|
| id | UUID (PK) | |
| zone_id | UUID (FK → zones.id) | |
| report_density | INT | |
| weather_context | JSONB | data dari API cuaca eksternal |
| traffic_density | FLOAT | nullable |
| flood_risk_probability | FLOAT | hasil model XGBoost |
| recorded_at | TIMESTAMP | |

### 2.13 `policy_simulations`
| Kolom | Tipe | Keterangan |
|---|---|---|
| id | UUID (PK) | |
| requested_by | UUID (FK → users.id) | |
| prompt_text | TEXT | input policy maker |
| zone_id | UUID (FK → zones.id) | nullable |
| result_narrative | TEXT | output Gemini |
| result_data | JSONB | proyeksi angka/grafik |
| created_at | TIMESTAMP | |

### 2.14 `route_alert_subscriptions`
| Kolom | Tipe | Keterangan |
|---|---|---|
| id | UUID (PK) | |
| user_id | UUID (FK → users.id) | |
| device_token | VARCHAR | untuk push notification (FCM) |
| last_lat | DECIMAL | nullable |
| last_long | DECIMAL | nullable |
| updated_at | TIMESTAMP | |

### 2.15 `notifications`
| Kolom | Tipe | Keterangan |
|---|---|---|
| id | UUID (PK) | |
| user_id | UUID (FK → users.id) | |
| type | ENUM(`route_alert`,`status_update`,`support_received`,`system`) | |
| title | VARCHAR | |
| body | TEXT | |
| reference_report_id | UUID (FK → reports.id) | nullable |
| is_read | BOOLEAN | default false |
| created_at | TIMESTAMP | |

---

## 3. Relasi Utama (Ringkasan)

| Relasi | Kardinalitas |
|---|---|
| users → reports | 1-to-many (sebagai pelapor) |
| reports → report_media | 1-to-many |
| reports → report_status_history | 1-to-many |
| reports → report_supports | 1-to-many (many-to-many via junction dengan users) |
| reports → report_comments | 1-to-many |
| reports → citizen_validations | 1-to-many |
| categories → reports | 1-to-many |
| agencies → reports | 1-to-many (assigned_agency) |
| zones → zone_metrics | 1-to-many |
| users → contribution_points_log | 1-to-many |
| users → policy_simulations | 1-to-many (sebagai requester) |

---

## 4. Indexing Strategy (rekomendasi)
- `reports`: index pada (`status`), (`category_id`), (`latitude`,`longitude`) — gunakan PostGIS/GIST index untuk query spasial (peta & bbox filter).
- `report_status_history`: index pada (`report_id`, `created_at`) untuk render timeline cepat.
- `report_supports`: unique index (`report_id`,`user_id`).
- `notifications`: index pada (`user_id`,`is_read`).

---

## 5. Catatan Denormalisasi
Kolom `support_count` dan `view_count` pada `reports` didenormalisasi (di-cache) untuk menghindari query agregasi berat setiap kali daftar laporan ditampilkan di Beranda/Peta. Update dilakukan via trigger atau service layer setiap ada insert ke `report_supports`.