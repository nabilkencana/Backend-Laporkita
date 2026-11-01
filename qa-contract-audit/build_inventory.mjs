/**
 * Step 1: Build Complete OpenAPI + Static Call-Graph Inventory
 * Fetches live OpenAPI specs from Backend (48 operations) and AI Service (17 OpenAPI operations + /demo + /sample_images.json = 19 operations)
 * Maps every operation to required auth/role, Mobile callers (datasource + UI screens), and Backend callers.
 * Outputs: qa-contract-audit/endpoint_inventory.json
 */
import { mkdirSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
mkdirSync(__dirname, { recursive: true });

const BACKEND_OPENAPI_URL = 'https://api-server.canadev.my.id/api/docs-json';
const AI_OPENAPI_URL = 'https://ai-server.canadev.my.id/openapi.json';
const AI_BASE_URL = 'https://ai-server.canadev.my.id';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) LaporKita-QA/1.0';

async function fetchJson(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

async function probeUrl(url) {
  const t0 = Date.now();
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  const latencyMs = Date.now() - t0;
  return {
    status: res.status,
    contentType: res.headers.get('content-type') || '',
    latencyMs,
  };
}

// Static Call-Graph Mapping for Backend Operations (normalized path without /api/v1 prefix)
const BACKEND_CALL_GRAPH = {
  'GET /health': {
    auth: 'public (@Public)',
    backendController: 'src/app.controller.ts:10',
    mobileDatasourceCaller: 'NONE',
    mobileUiCallers: ['NONE (admin_dashboard_screen.dart:490-539 renders hardcoded [200 OK] modal instead of calling /health)'],
    backendServiceCaller: 'NONE',
  },
  'POST /auth/register': {
    auth: 'public (@Public)',
    backendController: 'src/modules/auth/auth.controller.ts:44',
    mobileDatasourceCaller: 'lib/data/datasources/remote/auth_remote_datasource.dart:23 (AuthRemoteDatasource.register)',
    mobileUiCallers: [
      'lib/presentation/auth/bloc/auth_bloc.dart:99 (_onRegisterRequested)',
      'lib/presentation/citizen/profile/sign_up_screen.dart:46',
    ],
    backendServiceCaller: 'NONE',
  },
  'POST /auth/verify-otp': {
    auth: 'public (@Public)',
    backendController: 'src/modules/auth/auth.controller.ts:95',
    mobileDatasourceCaller: 'lib/data/datasources/remote/auth_remote_datasource.dart:45 (AuthRemoteDatasource.verifyOtp)',
    mobileUiCallers: [
      'lib/presentation/auth/bloc/auth_bloc.dart:123 (_onVerifyOtpRequested)',
      'lib/presentation/citizen/profile/otp_screen.dart:78',
    ],
    backendServiceCaller: 'NONE',
  },
  'POST /auth/resend-otp': {
    auth: 'public (@Public, 45s DB cooldown)',
    backendController: 'src/modules/auth/auth.controller.ts:154',
    mobileDatasourceCaller: 'lib/data/datasources/remote/auth_remote_datasource.dart:65 (AuthRemoteDatasource.resendOtp)',
    mobileUiCallers: [
      'lib/presentation/auth/bloc/auth_bloc.dart:152 (_onResendOtpRequested)',
      'lib/presentation/citizen/profile/otp_screen.dart:88',
    ],
    backendServiceCaller: 'NONE',
  },
  'POST /auth/login': {
    auth: 'public (@Public)',
    backendController: 'src/modules/auth/auth.controller.ts:207',
    mobileDatasourceCaller: 'lib/data/datasources/remote/auth_remote_datasource.dart:83 (AuthRemoteDatasource.login)',
    mobileUiCallers: [
      'lib/presentation/auth/bloc/auth_bloc.dart:168 (_onLoginRequested)',
      'lib/presentation/citizen/profile/login_screen.dart:33',
    ],
    backendServiceCaller: 'NONE',
  },
  'POST /auth/refresh': {
    auth: 'public (@Public, single-use refresh_token)',
    backendController: 'src/modules/auth/auth.controller.ts:255',
    mobileDatasourceCaller: 'lib/core/network/dio_client.dart:220 (DioClient._tryRefreshAndRetry) & lib/data/datasources/remote/auth_remote_datasource.dart:101 (AuthRemoteDatasource.refreshToken)',
    mobileUiCallers: ['lib/core/network/dio_client.dart:134 (automatic 401 interceptor)'],
    backendServiceCaller: 'NONE',
  },
  'GET /users/me': {
    auth: 'JwtAuthGuard (any authenticated role)',
    backendController: 'src/modules/users/users.controller.ts:52',
    mobileDatasourceCaller: 'lib/data/datasources/remote/auth_remote_datasource.dart:113 (AuthRemoteDatasource.getMe)',
    mobileUiCallers: [
      'lib/presentation/auth/bloc/auth_bloc.dart:38 (_onCheckRequested)',
      'lib/presentation/citizen/home/splash_screen.dart:97',
    ],
    backendServiceCaller: 'NONE',
  },
  'PATCH /users/me': {
    auth: 'JwtAuthGuard (any authenticated role)',
    backendController: 'src/modules/users/users.controller.ts:74',
    mobileDatasourceCaller: 'NONE',
    mobileUiCallers: ['NONE (citizen_profile_tab.dart, operator_profile_screen.dart, admin_profile_screen.dart are read-only)'],
    backendServiceCaller: 'NONE',
  },
  'GET /users/me/points': {
    auth: 'JwtAuthGuard (any authenticated role)',
    backendController: 'src/modules/users/users.controller.ts:154',
    mobileDatasourceCaller: 'lib/data/datasources/remote/auth_remote_datasource.dart:125 (AuthRemoteDatasource.getMyPoints)',
    mobileUiCallers: ['NONE (defined in AuthRemoteDatasource.getMyPoints / AuthRepository.getMyPoints at auth_repository.dart:54, 0 UI screen callers)'],
    backendServiceCaller: 'NONE',
  },
  'GET /users': {
    auth: 'JwtAuthGuard + RolesGuard (@Roles: admin)',
    backendController: 'src/modules/users/users.controller.ts:186',
    mobileDatasourceCaller: 'NONE',
    mobileUiCallers: ['NONE (admin_dashboard_screen.dart:320-380 renders 5 hardcoded static users in _showUserManagementModal)'],
    backendServiceCaller: 'NONE',
  },
  'GET /users/{id}': {
    auth: 'JwtAuthGuard + RolesGuard (@Roles: admin)',
    backendController: 'src/modules/users/users.controller.ts:221',
    mobileDatasourceCaller: 'NONE',
    mobileUiCallers: ['NONE'],
    backendServiceCaller: 'NONE',
  },
  'PATCH /users/{id}': {
    auth: 'JwtAuthGuard + RolesGuard (@Roles: admin)',
    backendController: 'src/modules/users/users.controller.ts:261',
    mobileDatasourceCaller: 'NONE',
    mobileUiCallers: ['NONE'],
    backendServiceCaller: 'NONE',
  },
  'DELETE /users/{id}': {
    auth: 'JwtAuthGuard + RolesGuard (@Roles: admin)',
    backendController: 'src/modules/users/users.controller.ts:299',
    mobileDatasourceCaller: 'NONE',
    mobileUiCallers: ['NONE'],
    backendServiceCaller: 'NONE',
  },
  'GET /categories': {
    auth: 'public (@Public)',
    backendController: 'src/modules/categories/categories.controller.ts:36',
    mobileDatasourceCaller: 'lib/data/datasources/remote/category_remote_datasource.dart:12 (CategoryRemoteDatasource.getCategories)',
    mobileUiCallers: [
      'lib/presentation/reports/bloc/report_bloc.dart:226 (CategoryBloc)',
      'lib/presentation/citizen/camera/new_report_form_screen.dart:273',
      'lib/presentation/command_center/dashboard/admin_dashboard_screen.dart:88',
      'lib/presentation/command_center/report_management/admin_reports_screen.dart:132',
    ],
    backendServiceCaller: 'NONE',
  },
  'GET /categories/{id}': {
    auth: 'public (@Public)',
    backendController: 'src/modules/categories/categories.controller.ts:56',
    mobileDatasourceCaller: 'NONE',
    mobileUiCallers: ['NONE'],
    backendServiceCaller: 'NONE',
  },
  'POST /categories': {
    auth: 'JwtAuthGuard + RolesGuard (@Roles: admin)',
    backendController: 'src/modules/categories/categories.controller.ts:87',
    mobileDatasourceCaller: 'NONE',
    mobileUiCallers: ['NONE'],
    backendServiceCaller: 'NONE',
  },
  'PATCH /categories/{id}': {
    auth: 'JwtAuthGuard + RolesGuard (@Roles: admin)',
    backendController: 'src/modules/categories/categories.controller.ts:127',
    mobileDatasourceCaller: 'NONE',
    mobileUiCallers: ['NONE'],
    backendServiceCaller: 'NONE',
  },
  'DELETE /categories/{id}': {
    auth: 'JwtAuthGuard + RolesGuard (@Roles: admin)',
    backendController: 'src/modules/categories/categories.controller.ts:165',
    mobileDatasourceCaller: 'NONE',
    mobileUiCallers: ['NONE'],
    backendServiceCaller: 'NONE',
  },
  'GET /agencies': {
    auth: 'public (@Public)',
    backendController: 'src/modules/agencies/agencies.controller.ts:34',
    mobileDatasourceCaller: 'lib/data/datasources/remote/agency_remote_datasource.dart:14 (AgencyRemoteDatasource.getAgencies)',
    mobileUiCallers: [
      'lib/presentation/command_center/report_management/admin_assign_report_screen.dart:64',
    ],
    backendServiceCaller: 'NONE',
  },
  'GET /agencies/{id}': {
    auth: 'public (@Public)',
    backendController: 'src/modules/agencies/agencies.controller.ts:54',
    mobileDatasourceCaller: 'NONE',
    mobileUiCallers: ['NONE'],
    backendServiceCaller: 'NONE',
  },
  'POST /agencies': {
    auth: 'JwtAuthGuard + RolesGuard (@Roles: admin)',
    backendController: 'src/modules/agencies/agencies.controller.ts:85',
    mobileDatasourceCaller: 'NONE',
    mobileUiCallers: ['NONE'],
    backendServiceCaller: 'NONE',
  },
  'PATCH /agencies/{id}': {
    auth: 'JwtAuthGuard + RolesGuard (@Roles: admin)',
    backendController: 'src/modules/agencies/agencies.controller.ts:125',
    mobileDatasourceCaller: 'NONE',
    mobileUiCallers: ['NONE'],
    backendServiceCaller: 'NONE',
  },
  'DELETE /agencies/{id}': {
    auth: 'JwtAuthGuard + RolesGuard (@Roles: admin)',
    backendController: 'src/modules/agencies/agencies.controller.ts:163',
    mobileDatasourceCaller: 'NONE',
    mobileUiCallers: ['NONE'],
    backendServiceCaller: 'NONE',
  },
  'POST /reports': {
    auth: 'JwtAuthGuard (any authenticated role, @Throttle 10/60s)',
    backendController: 'src/modules/reports/reports.controller.ts:154',
    mobileDatasourceCaller: 'lib/data/datasources/remote/report_remote_datasource.dart:74 (ReportRemoteDatasource.submitReport)',
    mobileUiCallers: [
      'lib/presentation/reports/bloc/report_bloc.dart:120 (_onSubmitRequested)',
      'lib/presentation/citizen/camera/new_report_form_screen.dart:316',
    ],
    backendServiceCaller: 'Enqueues BullMQ job verify-report -> src/modules/ai-verification/report-verification.processor.ts:27',
  },
  'GET /reports': {
    auth: 'public (@Public)',
    backendController: 'src/modules/reports/reports.controller.ts:212',
    mobileDatasourceCaller: 'lib/data/datasources/remote/report_remote_datasource.dart:15 (ReportRemoteDatasource.getReports)',
    mobileUiCallers: [
      'lib/presentation/reports/bloc/report_bloc.dart:36 (_onLoadRequested)',
      'lib/presentation/citizen/home/tabs/citizen_dashboard_tab.dart:40',
      'lib/presentation/citizen/map/map_tab_screen.dart:38',
      'lib/presentation/citizen/camera/ai_verification_screen.dart:132',
      'lib/presentation/command_center/dashboard/admin_dashboard_screen.dart:87',
      'lib/presentation/command_center/dashboard/government_dashboard_screen.dart:52',
      'lib/presentation/command_center/dashboard/operator_dashboard_screen.dart:48',
      'lib/presentation/command_center/report_management/admin_reports_screen.dart:128',
    ],
    backendServiceCaller: 'NONE',
  },
  'POST /reports/along-route': {
    auth: 'public (@Public)',
    backendController: 'src/modules/reports/reports.controller.ts:253',
    mobileDatasourceCaller: 'lib/data/datasources/remote/report_remote_datasource.dart:295 (ReportRemoteDatasource.getReportsAlongRoute — UNUSED in UI)',
    mobileUiCallers: ['NONE (route_picker_screen.dart filters first page of GET /reports locally instead)'],
    backendServiceCaller: 'NONE',
  },
  'GET /reports/comments/flagged': {
    auth: 'JwtAuthGuard + RolesGuard (@Roles: operator, admin)',
    backendController: 'src/modules/reports/reports.controller.ts:479',
    mobileDatasourceCaller: 'NONE',
    mobileUiCallers: ['NONE'],
    backendServiceCaller: 'NONE',
  },
  'GET /reports/{id}': {
    auth: 'public (@Public)',
    backendController: 'src/modules/reports/reports.controller.ts:281',
    mobileDatasourceCaller: 'lib/data/datasources/remote/report_remote_datasource.dart:66 (ReportRemoteDatasource.getReportById)',
    mobileUiCallers: [
      'lib/presentation/reports/bloc/report_bloc.dart:98 (_onDetailRequested)',
      'lib/presentation/citizen/report_detail/report_detail_screen.dart:94',
      'lib/presentation/citizen/tracking/tracking_progress_screen.dart:147',
      'lib/presentation/command_center/dashboard/operator_report_detail_screen.dart:68',
      'lib/presentation/command_center/report_management/admin_report_detail_screen.dart:50',
    ],
    backendServiceCaller: 'NONE',
  },
  'PATCH /reports/{id}/status': {
    auth: 'JwtAuthGuard + RolesGuard (@Roles: operator, admin)',
    backendController: 'src/modules/reports/reports.controller.ts:323',
    mobileDatasourceCaller: 'lib/data/datasources/remote/report_remote_datasource.dart:250 (ReportRemoteDatasource.updateReportStatus)',
    mobileUiCallers: [
      'lib/presentation/reports/bloc/report_bloc.dart:187 (_onUpdateStatusRequested)',
      'lib/presentation/citizen/report_detail/report_detail_screen.dart:1273',
      'lib/presentation/command_center/report_management/admin_verification_action_screen.dart:1607, 1842, 1957',
      'lib/presentation/command_center/report_management/admin_assign_report_screen.dart:125',
      'lib/presentation/command_center/report_management/admin_duplicate_detection_screen.dart:580',
      'lib/presentation/command_center/dashboard/operator_report_detail_screen.dart:194',
      'lib/presentation/command_center/dashboard/operator_foto_sebelum_screen.dart:90',
      'lib/presentation/command_center/dashboard/operator_update_progress_screen.dart:175',
      'lib/presentation/command_center/dashboard/operator_foto_sesudah_screen.dart:132',
    ],
    backendServiceCaller: 'NONE',
  },
  'POST /reports/{id}/support': {
    auth: 'JwtAuthGuard (any authenticated role, @Throttle 30/60s)',
    backendController: 'src/modules/reports/reports.controller.ts:346',
    mobileDatasourceCaller: 'lib/data/datasources/remote/report_remote_datasource.dart:182 (ReportRemoteDatasource.supportReport)',
    mobileUiCallers: [
      'lib/presentation/reports/bloc/report_bloc.dart:152 (_onSupportRequested)',
      'lib/presentation/citizen/report_detail/report_detail_screen.dart:911-913 (double-dispatched!)',
    ],
    backendServiceCaller: 'NONE',
  },
  'DELETE /reports/{id}/support': {
    auth: 'JwtAuthGuard (any authenticated role, 5m grace period)',
    backendController: 'src/modules/reports/reports.controller.ts:386',
    mobileDatasourceCaller: 'lib/data/datasources/remote/report_remote_datasource.dart:191 (ReportRemoteDatasource.cancelSupport)',
    mobileUiCallers: [
      'lib/presentation/citizen/report_detail/report_detail_screen.dart:902 (via ReportRepository.cancelSupport)',
    ],
    backendServiceCaller: 'NONE',
  },
  'POST /reports/{id}/comments': {
    auth: 'JwtAuthGuard (any authenticated role, @Throttle 20/60s)',
    backendController: 'src/modules/reports/reports.controller.ts:423',
    mobileDatasourceCaller: 'lib/data/datasources/remote/report_remote_datasource.dart:218 (ReportRemoteDatasource.addComment)',
    mobileUiCallers: [
      'lib/presentation/citizen/report_detail/report_detail_screen.dart:167',
      'lib/presentation/command_center/report_management/admin_report_detail_screen.dart:1498',
      'lib/presentation/command_center/dashboard/operator_update_progress_screen.dart:186',
    ],
    backendServiceCaller: 'NONE',
  },
  'GET /reports/{id}/comments': {
    auth: 'public (@Public)',
    backendController: 'src/modules/reports/reports.controller.ts:456',
    mobileDatasourceCaller: 'lib/data/datasources/remote/report_remote_datasource.dart:199 (ReportRemoteDatasource.getComments)',
    mobileUiCallers: [
      'lib/presentation/citizen/report_detail/report_detail_screen.dart:131',
      'lib/presentation/command_center/report_management/admin_report_detail_screen.dart:89',
    ],
    backendServiceCaller: 'NONE',
  },
  'POST /reports/{id}/validate': {
    auth: 'JwtAuthGuard (any authenticated role; non-reporter requires <=100m GPS)',
    backendController: 'src/modules/reports/reports.controller.ts:530',
    mobileDatasourceCaller: 'lib/data/datasources/remote/report_remote_datasource.dart:230 (ReportRemoteDatasource.validateReport)',
    mobileUiCallers: [
      'lib/presentation/citizen/validation/beri_validasi_screen.dart:172',
    ],
    backendServiceCaller: 'NONE',
  },
  'POST /reports/{id}/media': {
    auth: 'JwtAuthGuard (role/reporter checked per MediaType)',
    backendController: 'src/modules/reports/reports.controller.ts:612',
    mobileDatasourceCaller: 'lib/data/datasources/remote/report_remote_datasource.dart:274 (ReportRemoteDatasource.uploadReportMedia)',
    mobileUiCallers: [
      'lib/presentation/citizen/report_detail/report_detail_screen.dart:1377',
      'lib/presentation/citizen/validation/beri_validasi_screen.dart:146',
      'lib/presentation/command_center/dashboard/operator_update_progress_screen.dart:197',
      'lib/presentation/command_center/dashboard/operator_foto_sesudah_screen.dart:123',
    ],
    backendServiceCaller: 'NONE',
  },
  'POST /maps/route': {
    auth: 'public (@Public)',
    backendController: 'src/modules/maps/maps.controller.ts:64',
    mobileDatasourceCaller: 'lib/data/datasources/remote/routing_remote_datasource.dart:98 (RoutingRemoteDatasource._fetchRoutes)',
    mobileUiCallers: [
      'lib/presentation/citizen/navigation/route_picker_screen.dart:255',
    ],
    backendServiceCaller: 'Proxies to OSRM /route/v1/driving in src/modules/maps/maps.service.ts:144',
  },
  'GET /notifications': {
    auth: 'JwtAuthGuard (any authenticated role)',
    backendController: 'src/modules/notifications/notifications.controller.ts:68',
    mobileDatasourceCaller: 'lib/data/datasources/remote/notification_remote_datasource.dart:20 (NotificationRemoteDatasource.getNotifications)',
    mobileUiCallers: [
      'lib/presentation/citizen/home/tabs/citizen_notifikasi_tab.dart:89 (Note: operator_notifikasi_screen.dart & admin_notification_screen.dart do NOT call GET /notifications)',
    ],
    backendServiceCaller: 'NONE',
  },
  'PATCH /notifications/{id}/read': {
    auth: 'JwtAuthGuard (owner only)',
    backendController: 'src/modules/notifications/notifications.controller.ts:104',
    mobileDatasourceCaller: 'lib/data/datasources/remote/notification_remote_datasource.dart:53 (NotificationRemoteDatasource.markAsRead)',
    mobileUiCallers: [
      'lib/presentation/citizen/home/tabs/citizen_notifikasi_tab.dart:158',
    ],
    backendServiceCaller: 'NONE',
  },
  'PATCH /notifications/read-all': {
    auth: 'JwtAuthGuard (any authenticated role)',
    backendController: 'src/modules/notifications/notifications.controller.ts:127',
    mobileDatasourceCaller: 'lib/data/datasources/remote/notification_remote_datasource.dart:62 (NotificationRemoteDatasource.markAllAsRead)',
    mobileUiCallers: [
      'lib/presentation/citizen/home/tabs/citizen_notifikasi_tab.dart:210',
    ],
    backendServiceCaller: 'NONE',
  },
  'POST /route-alerts/subscribe': {
    auth: 'JwtAuthGuard (any authenticated role)',
    backendController: 'src/modules/notifications/route-alert.controller.ts:43',
    mobileDatasourceCaller: 'lib/data/datasources/remote/notification_remote_datasource.dart:71 (NotificationRemoteDatasource.subscribeRouteAlert)',
    mobileUiCallers: [
      'lib/core/services/fcm_service.dart:84 (called on app startup even before login -> 401)',
      'lib/presentation/citizen/home/tabs/citizen_notifikasi_tab.dart:245',
    ],
    backendServiceCaller: 'NONE',
  },
  'DELETE /route-alerts/unsubscribe': {
    auth: 'JwtAuthGuard (any authenticated role)',
    backendController: 'src/modules/notifications/route-alert.controller.ts:66',
    mobileDatasourceCaller: 'lib/data/datasources/remote/notification_remote_datasource.dart:88 (NotificationRemoteDatasource.unsubscribeRouteAlert)',
    mobileUiCallers: ['NONE (defined in NotificationRepository.unsubscribeRouteAlert at notification_repository.dart:318, 0 UI callers)'],
    backendServiceCaller: 'NONE',
  },
  'POST /route-alerts/check': {
    auth: 'JwtAuthGuard (any authenticated role)',
    backendController: 'src/modules/notifications/route-alert.controller.ts:95',
    mobileDatasourceCaller: 'lib/data/datasources/remote/notification_remote_datasource.dart:96 (NotificationRemoteDatasource.checkProximityAlert)',
    mobileUiCallers: ['NONE (defined in NotificationRepository.checkProximityAlert at notification_repository.dart:327, 0 UI callers)'],
    backendServiceCaller: 'NONE',
  },
  'GET /predictions/zones': {
    auth: 'public (@Public)',
    backendController: 'src/modules/prediction/prediction.controller.ts:69',
    mobileDatasourceCaller: 'lib/data/datasources/remote/prediction_remote_datasource.dart:13 (PredictionRemoteDatasource.getZones)',
    mobileUiCallers: [
      'lib/presentation/citizen/home/tabs/citizen_dashboard_tab.dart:91',
      'lib/presentation/command_center/policy_simulator/policy_simulator_screen.dart:89',
    ],
    backendServiceCaller: 'NONE',
  },
  'GET /predictions/zones/{zoneId}/metrics': {
    auth: 'public (@Public)',
    backendController: 'src/modules/prediction/prediction.controller.ts:119',
    mobileDatasourceCaller: 'lib/data/datasources/remote/prediction_remote_datasource.dart:36 (PredictionRemoteDatasource.getZoneMetrics — BROKEN: expects List, Backend returns {zone, metrics} Map)',
    mobileUiCallers: ['NONE (defined in PredictionRepository.getZoneMetrics at prediction_repository.dart:16, 0 UI callers)'],
    backendServiceCaller: 'NONE',
  },
  'POST /predictions/metrics/refresh': {
    auth: 'JwtAuthGuard + RolesGuard (@Roles: operator, policy_maker, admin)',
    backendController: 'src/modules/prediction/prediction.controller.ts:165',
    mobileDatasourceCaller: 'lib/data/datasources/remote/prediction_remote_datasource.dart:54 (PredictionRemoteDatasource.refreshMetrics)',
    mobileUiCallers: ['NONE (defined in PredictionRepository.refreshMetrics at prediction_repository.dart:21, 0 UI callers)'],
    backendServiceCaller: 'Calls AI POST /api/v1/predict/zone-metrics in src/modules/prediction/prediction.service.ts:58',
  },
  'POST /policy-simulations': {
    auth: 'JwtAuthGuard + RolesGuard (@Roles: policy_maker, admin)',
    backendController: 'src/modules/policy-simulator/policy-simulator.controller.ts:81',
    mobileDatasourceCaller: 'lib/data/datasources/remote/policy_simulator_datasource.dart:24 (PolicySimulatorDatasource.createSimulation)',
    mobileUiCallers: [
      'lib/presentation/command_center/policy_simulator/policy_simulator_screen.dart:107',
    ],
    backendServiceCaller: 'Calls Google Gemini REST API directly in src/modules/policy-simulator/policy-simulator.service.ts:61 (bypasses AI Service)',
  },
  'GET /policy-simulations': {
    auth: 'JwtAuthGuard + RolesGuard (@Roles: policy_maker, admin)',
    backendController: 'src/modules/policy-simulator/policy-simulator.controller.ts:116',
    mobileDatasourceCaller: 'lib/data/datasources/remote/policy_simulator_datasource.dart:195 (PolicySimulatorDatasource.getSimulations)',
    mobileUiCallers: ['NONE (defined in PolicySimulatorRepository.getSimulations at policy_simulator_repository.dart:23, 0 UI callers)'],
    backendServiceCaller: 'NONE',
  },
  'GET /policy-simulations/{id}': {
    auth: 'JwtAuthGuard + RolesGuard (@Roles: policy_maker, admin)',
    backendController: 'src/modules/policy-simulator/policy-simulator.controller.ts:154',
    mobileDatasourceCaller: 'lib/data/datasources/remote/policy_simulator_datasource.dart:224 (PolicySimulatorDatasource.getSimulationById)',
    mobileUiCallers: ['NONE (defined in PolicySimulatorRepository.getSimulationById at policy_simulator_repository.dart:31, 0 UI callers)'],
    backendServiceCaller: 'NONE',
  },
};

// Static Call-Graph Mapping for AI Service Operations
const AI_CALL_GRAPH = {
  'GET /health': {
    auth: 'public (no X-API-Key required)',
    aiHandler: 'app/main.py:122 (health_check)',
    responseEnvelope: 'APIResponse[HealthData] ({ success, data, error })',
    mobileDatasourceCaller: 'lib/data/datasources/remote/ai_service_datasource.dart:40 (AiServiceDatasource.isHealthy)',
    mobileUiCallers: ['NONE (defined in AiServiceDatasource.isHealthy, 0 UI callers)'],
    backendServiceCaller: 'NONE',
  },
  'GET /demo': {
    auth: 'public (HTML page)',
    aiHandler: 'app/main.py:194 (demo_console)',
    responseEnvelope: 'HTML (LaporKita AI Console)',
    mobileDatasourceCaller: 'NONE',
    mobileUiCallers: ['NONE'],
    backendServiceCaller: 'NONE',
  },
  'GET /sample_images.json': {
    auth: 'public (Static JSON)',
    aiHandler: 'app/main.py:201 (sample_images)',
    responseEnvelope: 'Raw JSON dictionary of 5 facility class base64 samples',
    mobileDatasourceCaller: 'NONE',
    mobileUiCallers: ['NONE'],
    backendServiceCaller: 'NONE',
  },
  'POST /v1/verify': {
    auth: 'X-API-Key / Bearer / ?key= (verify_api_key)',
    aiHandler: 'app/routers/verification.py:209 (verify_report)',
    responseEnvelope: 'APIResponse[VerifyReportData] ({ success, data: { is_valid, needs_manual_review, predicted_category, ai_confidence_score, ... }, error })',
    mobileDatasourceCaller: 'lib/data/datasources/remote/ai_service_datasource.dart:51 (AiServiceDatasource.verifyReport — BLOCKED in prod by wrong default AppConfig.aiApiKey -> 403)',
    mobileUiCallers: [
      'lib/presentation/citizen/camera/ai_verification_screen.dart:77',
    ],
    backendServiceCaller: 'NONE (Backend calls /api/v1/verify instead)',
  },
  'POST /api/v1/verify': {
    auth: 'X-API-Key / Bearer / ?key= (verify_api_key)',
    aiHandler: 'app/routers/verification.py:265 (verify_report_nestjs_compat)',
    responseEnvelope: 'FLAT VerifyReportNestJSData ({ confidence, category, is_valid_gps, is_valid_timestamp, damage_severity, reason, is_authentic, verified_address, is_mock } — omits is_valid & needs_manual_review!)',
    mobileDatasourceCaller: 'NONE',
    mobileUiCallers: ['NONE'],
    backendServiceCaller: 'src/modules/ai-verification/ai-verification.service.ts:68 (AIVerificationService.verifyReport)',
  },
  'POST /v1/predict-risk': {
    auth: 'X-API-Key / Bearer / ?key= (verify_api_key)',
    aiHandler: 'app/routers/prediction.py:19 (predict_risk)',
    responseEnvelope: 'APIResponse[PredictRiskData]',
    mobileDatasourceCaller: 'lib/data/datasources/remote/ai_service_datasource.dart:91 (AiServiceDatasource.predictRisk — BLOCKED in prod by wrong default AppConfig.aiApiKey -> 403)',
    mobileUiCallers: [
      'lib/presentation/citizen/home/tabs/citizen_dashboard_tab.dart:70',
    ],
    backendServiceCaller: 'NONE',
  },
  'POST /api/v1/predict-risk': {
    auth: 'X-API-Key / Bearer / ?key= (verify_api_key)',
    aiHandler: 'app/routers/prediction.py:19 (predict_risk)',
    responseEnvelope: 'APIResponse[PredictRiskData]',
    mobileDatasourceCaller: 'NONE',
    mobileUiCallers: ['NONE'],
    backendServiceCaller: 'NONE',
  },
  'POST /v1/predict/zone-metrics': {
    auth: 'X-API-Key / Bearer / ?key= (verify_api_key)',
    aiHandler: 'app/routers/prediction.py:92 (predict_zone_metrics)',
    responseEnvelope: 'FLAT PredictZoneMetricsData',
    mobileDatasourceCaller: 'NONE',
    mobileUiCallers: ['NONE'],
    backendServiceCaller: 'NONE (Backend calls /api/v1/predict/zone-metrics)',
  },
  'POST /api/v1/predict/zone-metrics': {
    auth: 'X-API-Key / Bearer / ?key= (verify_api_key)',
    aiHandler: 'app/routers/prediction.py:92 (predict_zone_metrics)',
    responseEnvelope: 'FLAT PredictZoneMetricsData',
    mobileDatasourceCaller: 'NONE',
    mobileUiCallers: ['NONE'],
    backendServiceCaller: 'src/modules/prediction/prediction.service.ts:58 (PredictionService.predictZoneMetrics)',
  },
  'POST /v1/policy-simulate': {
    auth: 'X-API-Key / Bearer / ?key= (verify_api_key)',
    aiHandler: 'app/routers/policy_simulator.py:11 (simulate_policy)',
    responseEnvelope: 'APIResponse[PolicySimulateData] ({ estimated_incident_reduction_pct, budget_estimate_idr, key_recommendations, ... })',
    mobileDatasourceCaller: 'NONE',
    mobileUiCallers: ['NONE'],
    backendServiceCaller: 'NONE (Backend PolicySimulatorService bypasses AI Service and calls Gemini directly at src/modules/policy-simulator/policy-simulator.service.ts:61)',
  },
  'POST /api/v1/policy-simulate': {
    auth: 'X-API-Key / Bearer / ?key= (verify_api_key)',
    aiHandler: 'app/routers/policy_simulator.py:11 (simulate_policy)',
    responseEnvelope: 'APIResponse[PolicySimulateData]',
    mobileDatasourceCaller: 'NONE',
    mobileUiCallers: ['NONE'],
    backendServiceCaller: 'NONE',
  },
  'POST /v1/training/ingest-sample': {
    auth: 'X-API-Key / Bearer / ?key= (verify_api_key)',
    aiHandler: 'app/routers/active_learning.py:16 (ingest_verified_sample)',
    responseEnvelope: 'APIResponse (201 Created)',
    mobileDatasourceCaller: 'NONE',
    mobileUiCallers: ['NONE'],
    backendServiceCaller: 'NONE',
  },
  'POST /api/v1/training/ingest-sample': {
    auth: 'X-API-Key / Bearer / ?key= (verify_api_key)',
    aiHandler: 'app/routers/active_learning.py:16 (ingest_verified_sample)',
    responseEnvelope: 'APIResponse (201 Created)',
    mobileDatasourceCaller: 'NONE',
    mobileUiCallers: ['NONE'],
    backendServiceCaller: 'NONE',
  },
  'GET /v1/training/dataset-stats': {
    auth: 'X-API-Key / Bearer / ?key= (verify_api_key)',
    aiHandler: 'app/routers/active_learning.py:55 (get_dataset_stats)',
    responseEnvelope: 'APIResponse',
    mobileDatasourceCaller: 'NONE',
    mobileUiCallers: ['NONE'],
    backendServiceCaller: 'NONE',
  },
  'GET /api/v1/training/dataset-stats': {
    auth: 'X-API-Key / Bearer / ?key= (verify_api_key)',
    aiHandler: 'app/routers/active_learning.py:55 (get_dataset_stats)',
    responseEnvelope: 'APIResponse',
    mobileDatasourceCaller: 'NONE',
    mobileUiCallers: ['NONE'],
    backendServiceCaller: 'NONE',
  },
  'GET /v1/training/download-dataset': {
    auth: 'X-API-Key / Bearer / ?key= (verify_api_key)',
    aiHandler: 'app/routers/active_learning.py:67 (download_dataset)',
    responseEnvelope: 'StreamingResponse (application/zip)',
    mobileDatasourceCaller: 'NONE',
    mobileUiCallers: ['NONE'],
    backendServiceCaller: 'NONE',
  },
  'GET /api/v1/training/download-dataset': {
    auth: 'X-API-Key / Bearer / ?key= (verify_api_key)',
    aiHandler: 'app/routers/active_learning.py:67 (download_dataset)',
    responseEnvelope: 'StreamingResponse (application/zip)',
    mobileDatasourceCaller: 'NONE',
    mobileUiCallers: ['NONE'],
    backendServiceCaller: 'NONE',
  },
  'GET /v1/training/samples/{class_name}/{filename}': {
    auth: 'X-API-Key / Bearer / ?key= (verify_api_key)',
    aiHandler: 'app/routers/active_learning.py:92 (get_sample_image)',
    responseEnvelope: 'FileResponse (image/jpeg)',
    mobileDatasourceCaller: 'NONE',
    mobileUiCallers: ['NONE'],
    backendServiceCaller: 'NONE',
  },
  'GET /api/v1/training/samples/{class_name}/{filename}': {
    auth: 'X-API-Key / Bearer / ?key= (verify_api_key)',
    aiHandler: 'app/routers/active_learning.py:92 (get_sample_image)',
    responseEnvelope: 'FileResponse (image/jpeg)',
    mobileDatasourceCaller: 'NONE',
    mobileUiCallers: ['NONE'],
    backendServiceCaller: 'NONE',
  },
};

const MOBILE_CALLS_WITHOUT_BACKEND_ENDPOINT = [
  {
    id: 'UNWIRED-MOB-01',
    mobileLocation: 'lib/data/datasources/remote/policy_simulator_datasource.dart:58-65 (PolicySimulatorDatasource._callGeminiDirect)',
    uiTrigger: 'lib/presentation/command_center/policy_simulator/policy_simulator_screen.dart:107',
    outboundTarget: 'POST https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${AppConfig.geminiApiKey}',
    issue: 'When Backend POST /policy-simulations fails (or for non-policy_maker/admin roles), Mobile calls Google Gemini API directly from client device, or falls back to local hardcoded heuristics when GEMINI_API_KEY is empty.',
  },
  {
    id: 'UNWIRED-MOB-02',
    mobileLocation: 'lib/presentation/command_center/report_management/admin_assign_report_screen.dart:125-133 -> lib/data/datasources/remote/report_remote_datasource.dart:250-271',
    uiTrigger: 'AdminAssignReportScreen._submitAssignment',
    outboundTarget: 'PATCH /api/v1/reports/{id}/status',
    issue: 'UI passes agency display name (opdName) instead of UUID in assignedAgencyId; ReportRemoteDatasource.updateReportStatus ignores assignedAgencyId completely, and Backend TransitionStatusDto rejects assigned_agency_id with 400 VALIDATION_ERROR (property assigned_agency_id should not exist).',
  },
  {
    id: 'UNWIRED-MOB-03',
    mobileLocation: 'lib/presentation/citizen/camera/report_confirmation_screen.dart:27-37 -> report_success_screen.dart:111-113',
    uiTrigger: 'ReportConfirmationScreen ("Mendukung laporan yang sudah ada")',
    outboundTarget: 'NONE (Expected: POST /api/v1/reports/{id}/support)',
    issue: 'Selecting option 0 to support an existing duplicate report navigates directly to /report-success (isSupportOnly: true) without making any HTTP call to POST /reports/{id}/support.',
  },
  {
    id: 'UNWIRED-MOB-04',
    mobileLocation: 'lib/presentation/citizen/report_detail/report_detail_screen.dart:35, 2167-2170',
    uiTrigger: 'ReportDetailScreen comment like button (_likedComments)',
    outboundTarget: 'NONE (No comment like endpoint in Backend)',
    issue: 'Comment like toggle mutates local in-memory Set<String> _likedComments only; Backend has no comment like endpoint.',
  },
  {
    id: 'UNWIRED-MOB-05',
    mobileLocation: 'lib/presentation/command_center/analytics/admin_statistics_analytics_screen.dart:272-292',
    uiTrigger: 'AdminStatisticsAnalyticsScreen._handleDownloadReport ("Unduh Laporan")',
    outboundTarget: 'NONE (No PDF/Excel export endpoint or file generator)',
    issue: 'Shows fake SnackBar "Laporan Statistik & Analitik berhasil diunduh (Format PDF / Excel)." without network request or file creation.',
  },
  {
    id: 'UNWIRED-MOB-06',
    mobileLocation: 'lib/presentation/command_center/report_management/admin_duplicate_detection_screen.dart:563-607',
    uiTrigger: 'AdminDuplicateDetectionScreen._handleDuplicate ("Tandai Duplikat")',
    outboundTarget: 'PATCH /api/v1/reports/{id}/status (status: "rejected")',
    issue: 'Rejects duplicate report with a static note; Backend has no duplicate_of_id foreign key or merge-and-increment-support endpoint.',
  },
  {
    id: 'UNWIRED-MOB-07',
    mobileLocation: 'lib/presentation/command_center/dashboard/operator_update_progress_screen.dart:164-190 & operator_foto_sebelum_screen.dart:96',
    uiTrigger: 'OperatorUpdateProgressScreen / OperatorFotoSebelumScreen progress slider',
    outboundTarget: 'FlutterSecureStorage (laporkita_progress_overrides_v1) + [PROGRESS: XX%] text tag in status note/comment',
    issue: 'Backend Reports schema has no progress_percentage column; Mobile embeds [PROGRESS: XX%] in free-text notes/comments and caches in local storage.',
  },
  {
    id: 'UNWIRED-MOB-08',
    mobileLocation: 'lib/presentation/command_center/dashboard/admin_dashboard_screen.dart:320-415, 490-539',
    uiTrigger: 'AdminDashboardScreen User Management, Agencies, and Audit Log modals',
    outboundTarget: 'NONE (Expected: GET /users, GET /agencies, GET /health)',
    issue: 'Renders hardcoded fake users, hardcoded agencies, and fake [200 OK] terminal logs instead of calling Backend endpoints.',
  },
  {
    id: 'UNWIRED-MOB-09',
    mobileLocation: 'lib/presentation/command_center/notifications/admin_notification_screen.dart:85 & dashboard/operator_notifikasi_screen.dart:31',
    uiTrigger: 'AdminNotificationScreen & OperatorNotifikasiScreen',
    outboundTarget: 'GET /api/v1/reports?limit=50 (Expected: GET /api/v1/notifications)',
    issue: 'Admin and Operator notification screens synthesize notifications client-side from GET /reports and store read state in ephemeral memory instead of calling GET /notifications and PATCH /notifications/{id}/read.',
  },
  {
    id: 'UNWIRED-MOB-10',
    mobileLocation: 'lib/presentation/command_center/analytics/government_summary_screen.dart:152-219',
    uiTrigger: 'GovernmentSummaryScreen._showRiskPredictionModal ("Lihat Prediksi")',
    outboundTarget: 'NONE (Expected: GET /api/v1/predictions/zones)',
    issue: 'Displays 5 hardcoded kecamatan XGBoost scores without calling PredictionRepository.',
  },
];

async function main() {
  console.log('Fetching live OpenAPI specs from Backend and AI Service...');
  const [backendSpec, aiSpec, demoProbe, sampleImagesProbe] = await Promise.all([
    fetchJson(BACKEND_OPENAPI_URL),
    fetchJson(AI_OPENAPI_URL),
    probeUrl(`${AI_BASE_URL}/demo`),
    probeUrl(`${AI_BASE_URL}/sample_images.json`),
  ]);

  const backendOperations = [];
  for (const [rawPath, pathItem] of Object.entries(backendSpec.paths || {})) {
    const normalizedPath = rawPath.replace(/^\/api\/v1/, '') || '/';
    for (const method of ['get', 'post', 'put', 'patch', 'delete']) {
      if (!pathItem[method]) continue;
      const op = pathItem[method];
      const key = `${method.toUpperCase()} ${normalizedPath}`;
      const callInfo = BACKEND_CALL_GRAPH[key] || {
        auth: 'UNKNOWN',
        backendController: 'UNKNOWN',
        mobileDatasourceCaller: 'NONE',
        mobileUiCallers: ['NONE'],
        backendServiceCaller: 'NONE',
      };
      backendOperations.push({
        service: 'backend-laporkita',
        method: method.toUpperCase(),
        openApiPath: rawPath,
        normalizedPath,
        key,
        operationId: op.operationId || null,
        summary: op.summary || '',
        tags: op.tags || [],
        ...callInfo,
      });
    }
  }

  const aiOperations = [];
  for (const [rawPath, pathItem] of Object.entries(aiSpec.paths || {})) {
    for (const method of ['get', 'post', 'put', 'patch', 'delete']) {
      if (!pathItem[method]) continue;
      const op = pathItem[method];
      const key = `${method.toUpperCase()} ${rawPath}`;
      const callInfo = AI_CALL_GRAPH[key] || {
        auth: 'UNKNOWN',
        aiHandler: 'UNKNOWN',
        responseEnvelope: 'UNKNOWN',
        mobileDatasourceCaller: 'NONE',
        mobileUiCallers: ['NONE'],
        backendServiceCaller: 'NONE',
      };
      aiOperations.push({
        service: 'ai-service',
        method: method.toUpperCase(),
        openApiPath: rawPath,
        key,
        operationId: op.operationId || null,
        summary: op.summary || '',
        tags: op.tags || [],
        inOpenApi: true,
        ...callInfo,
      });
    }
  }

  // Add non-OpenAPI mounted static/HTML routes (/demo and /sample_images.json)
  for (const extraKey of ['GET /demo', 'GET /sample_images.json']) {
    const [, rawPath] = extraKey.split(' ');
    const callInfo = AI_CALL_GRAPH[extraKey];
    const probe = rawPath === '/demo' ? demoProbe : sampleImagesProbe;
    aiOperations.push({
      service: 'ai-service',
      method: 'GET',
      openApiPath: rawPath,
      key: extraKey,
      operationId: rawPath === '/demo' ? 'demo_console' : 'sample_images',
      summary: rawPath === '/demo' ? 'Interactive HTML AI Console' : 'Static 5-class sample base64 JSON',
      tags: ['Demo & Static'],
      inOpenApi: false,
      probeStatus: probe.status,
      probeContentType: probe.contentType,
      probeLatencyMs: probe.latencyMs,
      ...callInfo,
    });
  }

  const backendNoMobileDatasourceCaller = backendOperations
    .filter((op) => op.mobileDatasourceCaller === 'NONE')
    .map((op) => ({ key: op.key, openApiPath: op.openApiPath, auth: op.auth, backendController: op.backendController }));

  const backendDatasourceButNoUiCaller = backendOperations
    .filter(
      (op) =>
        op.mobileDatasourceCaller !== 'NONE' &&
        op.mobileUiCallers.length === 1 &&
        op.mobileUiCallers[0].startsWith('NONE'),
    )
    .map((op) => ({
      key: op.key,
      openApiPath: op.openApiPath,
      mobileDatasourceCaller: op.mobileDatasourceCaller,
      note: op.mobileUiCallers[0],
    }));

  const aiNoCallerAtAll = aiOperations
    .filter((op) => op.mobileDatasourceCaller === 'NONE' && op.backendServiceCaller.startsWith('NONE'))
    .map((op) => ({ key: op.key, auth: op.auth, aiHandler: op.aiHandler }));

  const inventory = {
    generatedAt: new Date().toISOString(),
    sources: {
      backendOpenApiUrl: BACKEND_OPENAPI_URL,
      aiOpenApiUrl: AI_OPENAPI_URL,
      backendPathsCount: Object.keys(backendSpec.paths || {}).length,
      backendOperationsCount: backendOperations.length,
      aiOpenApiOperationsCount: aiOperations.filter((o) => o.inOpenApi).length,
      aiTotalOperationsCount: aiOperations.length,
      totalOperationsCount: backendOperations.length + aiOperations.length,
    },
    backendOperations,
    aiOperations,
    unwiredAnalysis: {
      backendEndpointsWithNoMobileDatasource: backendNoMobileDatasourceCaller,
      backendEndpointsInDatasourceButZeroUiCallers: backendDatasourceButNoUiCaller,
      aiEndpointsWithNoMobileOrBackendCaller: aiNoCallerAtAll,
      mobileOutboundCallsOrUiActionsWithNoWiredBackendEndpoint: MOBILE_CALLS_WITHOUT_BACKEND_ENDPOINT,
    },
  };

  const outPath = resolve(__dirname, 'endpoint_inventory.json');
  writeFileSync(outPath, JSON.stringify(inventory, null, 2));
  console.log(`✅ Wrote ${outPath}`);
  console.log(`   Backend operations : ${backendOperations.length} across ${Object.keys(backendSpec.paths || {}).length} paths`);
  console.log(`   AI Service ops     : ${aiOperations.length} (${aiOperations.filter((o) => o.inOpenApi).length} OpenAPI + 2 static/HTML)`);
  console.log(`   Total operations   : ${inventory.sources.totalOperationsCount}`);
  console.log(`   Backend ops w/o Mobile datasource : ${backendNoMobileDatasourceCaller.length}`);
  console.log(`   Backend ops in datasource w/o UI  : ${backendDatasourceButNoUiCaller.length}`);
  console.log(`   AI ops w/o Mobile/Backend caller  : ${aiNoCallerAtAll.length}`);
}

main().catch((err) => {
  console.error('Error building inventory:', err);
  process.exit(1);
});
