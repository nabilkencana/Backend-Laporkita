# Cross-System Contract Mismatch Audit & Complete Endpoint Testing Plan

## Context
Audit and verify end-to-end contract compatibility across all three LaporKita repositories (`./backend-laporkita`, `../ai-service`, and `../laporkita`) against the live production servers (`https://api-server.canadev.my.id/api/v1` and `https://ai-server.canadev.my.id`) without modifying any application source code. Execute complete endpoint testing (59 endpoints + browser `/demo`) saving raw JSON captures to `captures/<endpoint>.json`, replay exact Flutter datasource requests and `Model.fromJson` deserializers against those live captures to prove every cross-system mismatch with `file:line` and payload evidence, and produce a runnable contract test suite (exiting `1` when mismatches exist) plus a complete audit & per-repository fix-plan report.

---

## Approach

> **Hard Constraint**: Do NOT create, edit, or delete any application source or test file inside `./backend-laporkita/src/`, `../ai-service/`, or `../laporkita/`. Place all new audit scripts, raw payload captures, and audit reports strictly inside `./backend-laporkita/qa-contract-audit/` (retaining `./backend-laporkita/test_e2e.mjs` untouched as the 85/85 baseline).

### Step 1: Build Complete OpenAPI + Static Call-Graph Inventory (`qa-contract-audit/build_inventory.mjs`)
Create `./backend-laporkita/qa-contract-audit/build_inventory.mjs` (Node ESM) that:
1. Fetches live OpenAPI specs from `https://api-server.canadev.my.id/api/docs-json` (48 Backend operations across 35 paths) and `https://ai-server.canadev.my.id/openapi.json` (17 FastAPI operations across `/health`, `/v1/*`, `/api/v1/*`) plus probes `GET /demo` and `GET /sample_images.json` with header `User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) LaporKita-QA/1.0`.
2. Maps every operation to:
   - Required auth/role (`public`, `JwtAuthGuard`, `@Roles(...)`, or `X-API-Key`).
   - Exact Mobile Flutter caller (`file:line` in `../laporkita/lib/data/datasources/remote/*.dart` and UI screen callers in `../laporkita/lib/presentation/**`).
   - Exact Backend caller (`src/modules/ai-verification/ai-verification.service.ts:68`, `src/modules/prediction/prediction.service.ts:58`, `src/modules/policy-simulator/policy-simulator.service.ts:61`).
3. Outputs `./backend-laporkita/qa-contract-audit/endpoint_inventory.json` enumerating:
   - All 48 Backend operations + 19 AI operations (9 canonical `/v1/*` + `/health`, 8 `/api/v1/*` compat routes, `/demo`, `/sample_images.json`).
   - **Backend/AI endpoints with NO Mobile caller** (e.g., `PATCH /users/me`, `GET /users`, `GET/PATCH/DELETE /users/{id}`, `GET /categories/{id}`, `POST/PATCH/DELETE /categories*`, `GET /agencies/{id}`, `POST/PATCH/DELETE /agencies*`, `GET /reports/comments/flagged`, `POST /reports/along-route` [defined in `report_remote_datasource.dart:295` but 0 UI callers], `GET /v1/training/*`, `POST /v1/policy-simulate`).
   - **Mobile outbound calls / UI actions with NO matching or wired Backend endpoint** (e.g., `PolicySimulatorDatasource._callGeminiDirect` to `generativelanguage.googleapis.com` at `policy_simulator_datasource.dart:65`; agency UUID assignment dropped in `admin_assign_report_screen.dart:129` -> `report_remote_datasource.dart:261`; comment like button in `report_detail_screen.dart:2167`; analytics PDF/Excel export in `admin_statistics_analytics_screen.dart:272`; duplicate linking in `admin_duplicate_detection_screen.dart:580`).

### Step 2: Phase 1 Complete Endpoint Testing & Raw Payload Capture (`qa-contract-audit/run_phase1_captures.mjs`)
Create `./backend-laporkita/qa-contract-audit/run_phase1_captures.mjs` using Playwright (`import { chromium, request } from '/Users/nabilkencana/.npm/_npx/9833c18b2d85bc59/node_modules/playwright/index.mjs'`) and `sharp` (reusing the `apiCall` network-retry pattern and `sharp` image builder from `./test_e2e.mjs`) to test **100% of Backend and AI endpoints** and write every raw response envelope (`{ request: { method, url, headersMasked, bodySummary }, status, latencyMs, headers, body }`) into `./backend-laporkita/qa-contract-audit/captures/<slug>.json`:
1. **Seed Account Safety**:
   - Authenticate all 4 seed roles (`admin`, `citizen`, `operator`, `policy_maker`) via `POST /auth/login`; mask all JWTs and API keys (`tok.slice(0, 8) + '...'`) in console logs and saved JSON captures.
   - **Never mutate seed accounts**:
     - Test `PATCH /users/me` on `citizen` using an idempotent payload `{ full_name: currentCitizenFullName }` read dynamically from `GET /users/me`, plus negative extra-field validation `{ full_name: currentCitizenFullName, extra_field: 'x' }` (`400 VALIDATION_ERROR`).
     - Test `PATCH /users/{id}` and `DELETE /users/{id}` exclusively against the temporary `[QA]` user created via `POST /auth/register`.
     - Test non-reporter `> 100m` citizen validation (`POST /reports/{id}/validate`) using the authenticated `operator` token (since `report.reporter_id !== operator.id` and `POST /reports/:id/validate` at `src/modules/reports/reports.controller.ts:530` only guards `JwtAuthGuard`) with Surabaya coordinates (`-7.2575, 112.7521`), capturing the actual `403 FORBIDDEN` (`NOT_ELIGIBLE_FOR_VALIDATION`) response before `citizen` validates at Alun-Alun Malang (`-7.9826, 112.6308`) to reach `resolved`.
2. **Backend Complete Matrix (48 operations)**:
   - For every endpoint: happy path, missing token (`401`), invalid/tampered JWT (`401`), disallowed roles (`403` — e.g., `citizen` on `/users`, `POST /categories`, `POST /agencies`, `PATCH /reports/{id}/status`, `GET /reports/comments/flagged`, `POST /predictions/metrics/refresh`, `/policy-simulations*`; `operator` on `/policy-simulations*` and admin CRUD), validation errors (`400 VALIDATION_ERROR` on missing fields, wrong types, and `forbidNonWhitelisted` extra fields), malformed UUID (`400`), unknown UUID `00000000-0000-4000-8000-000000000000` (`404`).
   - Business rules & edge cases:
     - `POST /auth/register` (`202`), `POST /auth/resend-otp` (`400` 45s cooldown with array-message `VALIDATION_ERROR` trap), `POST /auth/verify-otp` wrong code `0000` (`400`), unverified login (`401 PHONE_NOT_VERIFIED`), single-use `POST /auth/refresh` rotation + reuse of old refresh token (`401 REFRESH_TOKEN_INVALID`).
     - `DELETE /users/{adminId}` self-delete guard (`400 BAD_REQUEST`).
     - Admin CRUD `[QA]` Category & `[QA]` Agency (`201 -> 200 -> 200`) + duplicate name (`409 CONFLICT`) + delete category with existing reports (`400 BAD_REQUEST` on seed category `c1000000-0000-4000-8000-000000000001`, read-safe because it rejects before deletion).
     - Report photo validation: `< 480px` image (`320x240` JPEG -> `400 BAD_REQUEST`), WebP buffer (`sharp(...).webp()` -> `400 BAD_REQUEST` magic-byte rejection despite Swagger doc), out-of-Malang BBox (`-6.2088, 106.8456` -> `400 BAD_REQUEST`), and idempotency replay (`X-Idempotency-Key` returning identical `report.id`).
     - Full report lifecycle (`#LP-...` prefixed `[QA]`): create (`202`) -> detail (`200`) -> upvote (`201`) -> duplicate upvote (`409 CONFLICT`) -> cancel upvote within 5m (`200`) -> cancel again (`404`) -> re-upvote (`201`) -> normal comment (`is_flagged: false`) -> profane comment (`is_flagged: true`, unmasked `content`) -> `GET /reports/comments/flagged` (`200`) -> invalid state skip `verified -> completed` (`409 CONFLICT`) -> `assigned` -> `in_progress` -> attempt `completed` BEFORE `completion_photo` (`400 BAD_REQUEST` `COMPLETION_PHOTO_REQUIRED`) -> `POST /reports/{id}/media` (`progress_photo` & `completion_photo`, plus citizen attempting `completion_photo` -> `403 FORBIDDEN`) -> `completed` (`200`) -> non-reporter `> 100m` validate (`403 FORBIDDEN`) -> reporter validate (`201` -> `resolved`). Also create a second `[QA]` report to test `pending_verification/verified` rejection without `note` (`400`) and Dispute flow (`is_valid: false` -> `in_progress` -> re-complete -> `resolved`) so every temporary report ends in a final state (`resolved` or `rejected`).
     - GIS, Predictions, Policy Simulator, Notifications: `POST /maps/route` (Malang valid `200`, outside-Java Bali `-8.4095, 115.1889` -> `400`), `POST /reports/along-route`, `/route-alerts/subscribe` -> `/check` -> `/unsubscribe`, `/predictions/zones`, `/predictions/zones/{zoneId}/metrics`, `/predictions/metrics/refresh`, `/policy-simulations` (`POST`, `GET`, `GET /{id}`), `/notifications` (`GET`, `PATCH /{id}/read`, `PATCH /read-all`).
3. **AI Microservice Complete Matrix (17 OpenAPI ops + `/demo` + `/sample_images.json`)**:
   - Auth checks: missing `X-API-Key` (`401`), wrong `X-API-Key` (`403`) on both `/v1/*` and `/api/v1/*`.
   - Browser check: Chromium (`{ channel: 'chrome' }`) on `GET /demo`, assert title contains `"LaporKita AI Console"`, save `qa-contract-audit/ai_demo_console.png`.
   - All 6 classes on `POST /v1/verify` and `POST /api/v1/verify`:
     - All 5 facility samples from `/sample_images.json` (`Drainase`, `Jalan Berlubang`, `Lampu Jalan`, `Rambu Lalu Lintas`, `Trotoar`).
     - 6th class OOD / Blur trigger: solid gray `640x480` RGB `(128,128,128)` JPEG (`sharpness == 0.0 < 1.5`) -> `predicted_category === "bukan_fasilitas"`, `is_valid === false`, `needs_manual_review === true` on `/v1/verify`, vs flat `/api/v1/verify` returning `confidence >= 0.85` without `is_valid`/`needs_manual_review`.
     - Non-authentic / Tampered image trigger: take `Jalan Berlubang` base64 sample decoded via `sharp` and composite a `192x192` zero-noise flat block (`rgb(30,30,30)`) or `1px` `0/255` checkerboard strip (`lap_var > 6500` / block noise CV `> 0.88`) -> `authenticity.is_authentic === false` on `/v1/verify` and `is_authentic === false` on `/api/v1/verify`.
     - Out-of-Malang BBox: Jakarta (`-6.2088, 106.8456`) -> `gps_valid === false`, `location_verification.is_location_consistent === false`; plus **Ring-Zone coordinate (`-8.15, 112.60`)** proving it passes Backend BBox (`[-8.25,-7.85]`) while failing AI Service BBox (`[-8.05,-7.90]`).
   - Remaining AI endpoints: `POST /v1/predict-risk`, `POST /api/v1/predict-risk`, `POST /v1/predict/zone-metrics`, `POST /api/v1/predict/zone-metrics`, `POST /v1/policy-simulate`, `POST /api/v1/policy-simulate`, `GET /v1/training/dataset-stats`, `GET /api/v1/training/dataset-stats`, `POST /v1/training/ingest-sample`, `POST /api/v1/training/ingest-sample`, `GET /v1/training/samples/{class_name}/{filename}`, `GET /api/v1/training/samples/{class_name}/{filename}`, `GET /v1/training/download-dataset`, `GET /api/v1/training/download-dataset`.
   - Terminal log format for every test: `[Suite] Test (METHOD /path) ... PASS|FAIL (status, ms)`.

### Step 3: Phase 2B Real Dart Model Deserialization Runner (`qa-contract-audit/verify_dart_models.mjs` + Temporary Runner)
Verify every Flutter `Model.fromJson` and envelope parser using **real Dart execution (`flutter test --no-pub`)** against the saved `./backend-laporkita/qa-contract-audit/captures/*.json` files without leaving any modified or untracked files in `../laporkita/`:
1. Have `verify_dart_models.mjs` check whether `flutter test --no-pub` from `cwd: ../laporkita` accepts an external test path (`../backend-laporkita/qa-contract-audit/mobile_model_contract_test.dart`).
   - If `flutter test` accepts the external path, run it directly without touching `../laporkita/`.
   - Contingency: if `flutter test` requires the test file to reside under `../laporkita/test/`, mirror the exact Dart `fromJson` + datasource unwrapping logic line-for-line in `./backend-laporkita/qa-contract-audit/mobile_model_parsers_port.mjs` (so `../laporkita/` is never written to under any circumstance) and state this explicitly in the output JSON and report.
2. Feed real captured JSON payloads from `captures/*.json` into all 10 model parsers + `ApiResponse` + `PaginationMeta` + datasource `fromJson` closures:
   - `PolicySimulationModel.fromJson` against **both** `captures/backend_post_policy_simulations.json` AND `captures/ai_v1_policy_simulate.json` -> assert and record silent fallbacks (`recommendedActions` empty `[]`, `simulatedRiskScore` falling back to `3.2`, `estimatedBudgetBro` falling back to `1500000000.0` on AI payload because AI sends `budget_estimate_idr` & `key_recommendations` & `estimated_incident_reduction_pct`).
   - `RouteModel.fromBackendMapsJson` against `captures/backend_post_maps_route.json` -> prove `steps` is `[]` and `summary` is `""` (breaking turn-by-turn street maneuver TTS).
   - `AiVerificationResult.fromJson` against `captures/ai_v1_verify_*.json` (all 6 classes, blurry, tampered, out-of-Malang) -> verify field mapping (`isVerified`, `needsManualReview`, `confidence`, `detectedCategory`, `urgencyScore`, `isWithinMalang`, `rejectionReason` null on `/v1/verify` because `/v1/verify` omits `reason` and puts text in `description_auto`!).
   - `PredictionRemoteDatasource.getZoneMetrics` closure + `ZoneMetricsModel.fromJson` against `captures/backend_get_zone_metrics_history.json` (`GET /predictions/zones/{zoneId}/metrics`) and `captures/backend_get_predictions_zones.json` -> prove `getZoneMetrics` returns `[]` because `data` is `{ zone, metrics }` (`Map`), not `List`!
   - `RiskPredictionResult.fromJson` against `captures/ai_v1_predict_risk.json`.
   - `ReportModel.fromJson` across **list** (`GET /reports`), **detail** (`GET /reports/{id}`), **create** (`POST /reports` + the `ReportRemoteDatasource.submitReport` manual reconstruction bug at `report_remote_datasource.dart:150-175` that drops `ai_confidence_score`, `damage_severity`, `estimated_completion_at`), and **status update** (`PATCH /reports/{id}/status`).
   - `UserModel.fromJson`, `AuthTokenModel.fromJson`, `RegisterResponseModel.fromJson`, `CategoryModel.fromJson`, `AgencyModel.fromJson`, `NotificationModel.fromJson`, and `PaginationMeta.fromJson`.

### Step 4: Runnable Cross-System Contract Reproduction Suite (`qa-contract-audit/test_cross_system_contract.mjs`)
Create the standalone, runnable cross-system contract test script `./backend-laporkita/qa-contract-audit/test_cross_system_contract.mjs` required by Output #3 that replays **exact Mobile datasource requests** and **Backend <-> AI contracts** against live production, logs `[Suite] Test (METHOD /path) ... PASS|FAIL (status, ms)`, writes structured evidence to `./backend-laporkita/qa-contract-audit/contract_mismatch_results.json`, cleans up all `[QA]` data, and **exits with code `1` whenever any contract mismatch is reproduced**:
1. **Config & Auth Contract Checks (`Phase 2D`)**:
   - Replay Mobile default `AppConfig.baseUrl` (`https://api.canadev.my.id/api/v1/health`) and `AppConfig.aiServiceUrl` (`https://ai.canadev.my.id/health`) vs live `api-server` / `ai-server` URLs.
   - Replay `AiServiceDatasource.verifyReport` using Mobile's default `AppConfig.aiApiKey` (`laporkita_sec_e62232a17817b3676927b5fefda6bad1cbe4`) against `https://ai-server.canadev.my.id/v1/verify` -> reproduces `403 FORBIDDEN`.
2. **Mobile Datasource Request Replay (`Phase 2A`)**:
   - Replay all 9 `lib/data/datasources/remote/*.dart` request shapes against `https://api-server.canadev.my.id/api/v1` and `https://ai-server.canadev.my.id`:
     - `NewReportFormScreen` offline fallback category `category_id: 'cat-sampah'` on `POST /reports` -> reproduces `400 VALIDATION_ERROR`; `claimed_category: 'Sampah & Kebersihan'` on `POST /v1/verify` -> reproduces `422`.
     - `ImageUtils.compressIfNeeded` `< 900KB` WebP bypass: send `< 900KB` `640x480` WebP file labeled `report_photo.jpg` to `POST /reports` -> reproduces `400 BAD_REQUEST` magic-byte rejection.
     - `AdminAssignReportScreen` agency assignment: send `{ status: 'assigned', assigned_agency_id: 'a1000000-0000-4000-8000-000000000001' }` to `PATCH /reports/{id}/status` -> reproduces `400 VALIDATION_ERROR` (`property assigned_agency_id should not exist`), proving Backend lacks agency-reassignment support on status transition while Mobile drops `assignedAgencyId` silently.
     - `AdminVerificationActionScreen` `'Meminta Revisi'` (`admin_verification_action_screen.dart:1957`): send `{ status: 'pending_verification', note: '[QA] Revisi' }` on a report in `pending_verification`/`verified` -> reproduces `409 CONFLICT` (which Mobile `ReportRepository` swallows as fake success).
     - `ReportDetailScreen` double-dispatch (`report_detail_screen.dart:911-913`): fire two consecutive `POST /reports/{id}/support` calls -> second returns `409 CONFLICT`.
     - `FcmService.initialize` startup call (`fcm_service.dart:84`): call `POST /route-alerts/subscribe` without Bearer token -> reproduces `401 UNAUTHORIZED`.
     - `QueryReportsDto` boolean implicit conversion trap (`query-reports.dto.ts:138-146`): compare `GET /reports?needsManualReview=false` vs `GET /reports?needsManualReview=true` on live Backend -> prove `?needsManualReview=false` filters for `needs_manual_review = true`!
     - Malang BBox split: test ring-zone coordinate `(-8.15, 112.60)` against AI `POST /v1/verify` (`gps_valid: false`, blocking Mobile `AiVerificationScreen`) vs Backend `POST /reports` (`202 Accepted`).
3. **Backend <-> AI Contract Checks (`Phase 2C`)**:
   - Submit a `[QA]` report with a blurry `640x480` solid-gray JPEG (`sharpness == 0.0`) to Backend `POST /reports`, wait 3s for BullMQ `ReportVerificationProcessor`, then fetch `GET /reports/{id}` -> prove Backend auto-transitions the blurry/OOD report to `status: 'verified'` (`needs_manual_review: false`) instead of keeping `pending_verification` + `needs_manual_review: true` (and advance that `[QA]` report through `completed -> resolved` during cleanup!).
   - Compare Backend `POST /policy-simulations` response (`result_data` static `35` / `450000000`, missing `recommended_actions`, ~9–11s latency vs hardcoded `10000`ms Axios timeout in `policy-simulator.service.ts:73`) against AI Service `POST /v1/policy-simulate` structured output (`key_recommendations`, `budget_estimate_idr`, `estimated_incident_reduction_pct`, `target_department`).
4. **Model Deserialization Assertions (`Phase 2B`)**:
   - Invoke Step 3's model parser checks on the live captures and fail the contract test for every silent default fallback or dropped dataset (`getZoneMetrics` returning `[]`, `PolicySimulationModel.recommendedActions` returning `[]`, `RouteModel.steps` returning `[]`, `AiVerificationResult.rejectionReason` returning `null` on OOD/out-of-Malang `/v1/verify`, `submitReport` dropping AI score fields).

### Step 5: Assemble Evidence-Backed Audit Report & Per-Repo Fix Plan (`qa-contract-audit/CROSS_SYSTEM_AUDIT_REPORT.md`)
Generate `./backend-laporkita/qa-contract-audit/CROSS_SYSTEM_AUDIT_REPORT.md` containing all 5 required deliverables grounded strictly in the live execution outputs from Steps 1–4:
1. **Endpoint Coverage Matrix**: Complete `67/67` operations table (`48` Backend + `19` AI including `/demo` & `/sample_images.json`) showing HTTP status, latency, test result, Mobile caller (`file:line` or `NONE`), and Backend service caller (`file:line` or `NONE`), plus explicit tables of unwired Backend endpoints and Mobile calls lacking Backend endpoints.
2. **Cross-System Mismatch Matrix**: Every verified mismatch (`MM-01` through `MM-15+`) with columns `ID | Severity (CRITICAL/HIGH/MEDIUM/LOW) | Location (Mobile/Backend/AI, file:line) | Actual vs Expected Payload | User Impact | Reproduction Test ID in test_cross_system_contract.mjs`.
3. **Runnable Contract Test Documentation**: Exact command (`node qa-contract-audit/test_cross_system_contract.mjs`), exit code behavior (`1` while mismatches exist, `0` once fixed), and `captures/*.json` index.
4. **Actionable Fix Plan Per Repository (`laporkita`, `backend-laporkita`, `ai-service`)**:
   - Exact file, symbol, and code change per finding.
   - Risk analysis against existing passing suites (`./test_e2e.mjs` 85/85, `npm test` 123/123 in `backend-laporkita`, `flutter test` in `laporkita` including `test/core/config/app_config_test.dart:11` prefix assertion `laporkita_sec_`, and `pytest` in `ai-service`).
   - Dependency-safe execution order (`ai-service` -> `backend-laporkita` -> `laporkita`) and exact regression tests to add per repo.
5. **Final Demo Readiness Verdict (`GO / NO-GO`)**: Evidence-based verdict naming the exact top blockers for a live competition demo without `--dart-define` workarounds.

---

## Critical files & anchors

- `../laporkita/lib/core/config/app_config.dart:12-39` — Hardcoded default `baseUrl`, `aiServiceUrl`, and `aiApiKey` diverging from live `api-server` / `ai-server` production endpoints and `INTERNAL_API_KEY` (paired with `../laporkita/test/core/config/app_config_test.dart:10-12`).
- `../laporkita/lib/data/datasources/remote/prediction_remote_datasource.dart:41-53` & `../laporkita/lib/data/models/policy_simulation_model.dart:31-106` — `getZoneMetrics` `List`-only check dropping `{ zone, metrics }` response, and `PolicySimulationModel.fromJson` key mismatches against both Backend and AI Service payloads.
- `src/modules/ai-verification/report-verification.processor.ts:58-72` & `../ai-service/app/routers/verification.py:265-307` — Flat `/api/v1/verify` response and BullMQ processor auto-approving blurry/OOD (`bukan_fasilitas`) and tampered (`is_authentic: false`) reports.
- `src/modules/policy-simulator/policy-simulator.service.ts:50-117` — Direct Gemini text call with `10000`ms timeout and hardcoded `resultData` bypassing AI Service `POST /v1/policy-simulate`.
- `src/modules/reports/reports.service.ts:163-586` & `src/common/filters/http-exception.filter.ts:99-119` — Exact state-machine `400` vs `409` rules, non-reporter `> 100m` `403 FORBIDDEN` validation rule, and array-`message` `VALIDATION_ERROR` override on OTP endpoints.

---

## Verification

1. **Inventory & Phase 1 Complete Endpoint Capture Run**:
   ```bash
   node qa-contract-audit/build_inventory.mjs
   node qa-contract-audit/run_phase1_captures.mjs
   ```
   - Expect `67/67` operations exercised (`48/48` Backend OpenAPI + `17/17` AI OpenAPI + `/demo` + `/sample_images.json`), `qa-contract-audit/ai_demo_console.png` saved, raw payloads written to `qa-contract-audit/captures/*.json`, all `[QA]` temporary users/categories/agencies deleted, and all `[QA]` reports in final state (`resolved` or `rejected`).
2. **Phase 2 Dart Model & Cross-System Contract Mismatch Run**:
   ```bash
   node qa-contract-audit/verify_dart_models.mjs
   node qa-contract-audit/test_cross_system_contract.mjs
   ```
   - Expect `test_cross_system_contract.mjs` to reproduce each live contract mismatch with `[Suite] Test (METHOD /path) ... FAIL (status, ms)` evidence, write `qa-contract-audit/contract_mismatch_results.json`, clean up all `[QA]` data, and exit with status code `1` (proving active mismatch detection).
3. **Zero-Mutation & Baseline Preservation Check**:
   ```bash
   git -C "../laporkita" status --short
   git -C "../ai-service" status --short
   git status --short src/
   ```
   - Expect empty output on all three commands (confirming zero edits to `laporkita`, `ai-service`, and `backend-laporkita/src/`).

---

## Assumptions & contingencies

- **Dart Model Execution Without Touching `../laporkita`**: `verify_dart_models.mjs` attempts `flutter test --no-pub "../backend-laporkita/qa-contract-audit/mobile_model_contract_test.dart"` with `cwd: "../laporkita"`. If Flutter's test runner rejects test files outside `../laporkita/test/`, `verify_dart_models.mjs` automatically executes `qa-contract-audit/mobile_model_parsers_port.mjs` (an exact statement-for-statement JS port of `ApiResponse.fromJson`, `PaginationMeta.fromJson`, datasource closures, and all 10 `Model.fromJson` factories) so `../laporkita` remains 100% unmodified.
- **Rate Limits (`ThrottlerGuard`)**: Backend enforces `100 req / 60s` globally per IP and `10 req / 60s` on `POST /api/v1/reports` (`src/modules/reports/reports.controller.ts:155`). `run_phase1_captures.mjs` and `test_cross_system_contract.mjs` pace requests (`>= 650ms` spacing when approaching 90 requests/min and max 8 `POST /reports` calls per 60s window, honoring `Retry-After` if `429` occurs) so rate limiting never masks real contract behavior.
- **Gemini Upstream Latency**: Live Gemini 2.5 Flash calls take `9–12s`. Playwright API contexts use `timeout: 60000`ms, and if Backend `POST /policy-simulations` hits its internal `10000`ms Axios timeout (`policy-simulator.service.ts:73`) and falls back to `mockSimulatePolicy`, the script records that exact fallback in `captures/backend_post_policy_simulations.json` as direct live evidence of the timeout mismatch.
