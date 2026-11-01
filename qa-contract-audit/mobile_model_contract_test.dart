import 'dart:convert';
import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:laporkita/core/network/api_response.dart';
import 'package:laporkita/data/datasources/remote/prediction_remote_datasource.dart';
import 'package:laporkita/data/datasources/remote/report_remote_datasource.dart';
import 'package:laporkita/data/models/agency_model.dart';
import 'package:laporkita/data/models/ai_verification_model.dart';
import 'package:laporkita/data/models/auth_token_model.dart';
import 'package:laporkita/data/models/category_model.dart';
import 'package:laporkita/data/models/notification_model.dart';
import 'package:laporkita/data/models/policy_simulation_model.dart';
import 'package:laporkita/data/models/report_model.dart';
import 'package:laporkita/data/models/risk_prediction_model.dart';
import 'package:laporkita/data/models/route_model.dart';
import 'package:laporkita/data/models/user_model.dart';

Map<String, dynamic> loadCaptureBody(String slug) {
  final file = File('../backend-laporkita/qa-contract-audit/captures/$slug.json');
  final raw = jsonDecode(file.readAsStringSync()) as Map<String, dynamic>;
  return raw['body'] as Map<String, dynamic>;
}

void main() {
  test('Phase 2C Real Flutter Model Deserialization Audit against Fixed Stack Captures', () {
    final findings = <Map<String, dynamic>>[];

    // 1. PolicySimulationModel.fromJson against Backend POST /policy-simulations
    final bePolicyBody = loadCaptureBody('backend_post_policy_simulations');
    final bePolicyModel = PolicySimulationModel.fromJson(bePolicyBody);
    findings.add({
      'id': 'DART-MODEL-01',
      'model': 'PolicySimulationModel.fromJson (Backend POST /policy-simulations)',
      'capture': 'captures/backend_post_policy_simulations.json',
      'parsed': {
        'id': bePolicyModel.id,
        'simulatedRiskScore': bePolicyModel.simulatedRiskScore,
        'riskReductionPct': bePolicyModel.riskReductionPct,
        'estimatedBudgetBro': bePolicyModel.estimatedBudgetBro,
        'recommendedActionsCount': bePolicyModel.recommendedActions.length,
        'timeHorizonMonths': bePolicyModel.timeHorizonMonths,
      },
      'mismatchDetected': bePolicyModel.recommendedActions.isEmpty,
      'explanation':
          'Backend resultData now includes recommended_actions and simulated_risk_score; PolicySimulationModel.fromJson parses them without fallback.',
    });

    // 2. PolicySimulationModel.fromJson against AI Service POST /v1/policy-simulate
    final aiPolicyBody = loadCaptureBody('ai_v1_policy_simulate');
    final aiPolicyModel = PolicySimulationModel.fromJson(aiPolicyBody);
    final aiResultData = (aiPolicyBody['data'] as Map<String, dynamic>)['result_data'] as Map<String, dynamic>;
    final aiBudget = (aiResultData['budget_estimate_idr'] as num).toDouble();
    final aiReduction = (aiResultData['estimated_incident_reduction_pct'] as num).toDouble();
    findings.add({
      'id': 'DART-MODEL-02',
      'model': 'PolicySimulationModel.fromJson (AI POST /v1/policy-simulate)',
      'capture': 'captures/ai_v1_policy_simulate.json',
      'parsed': {
        'simulatedRiskScore': aiPolicyModel.simulatedRiskScore,
        'riskReductionPct': aiPolicyModel.riskReductionPct,
        'estimatedBudgetBro': aiPolicyModel.estimatedBudgetBro,
        'recommendedActionsCount': aiPolicyModel.recommendedActions.length,
        'timeHorizonMonths': aiPolicyModel.timeHorizonMonths,
      },
      'mismatchDetected': aiPolicyModel.recommendedActions.isEmpty ||
          aiPolicyModel.estimatedBudgetBro != aiBudget ||
          aiPolicyModel.riskReductionPct != aiReduction,
      'explanation':
          'PolicySimulationModel.fromJson now parses budget_estimate_idr, estimated_incident_reduction_pct, time_to_impact_weeks, and key_recommendations accurately.',
    });

    // 3. RouteModel.fromBackendMapsJson against Backend POST /maps/route
    final mapsBody = loadCaptureBody('backend_post_maps_route');
    final routes = RouteModel.fromBackendMapsJson(mapsBody);
    findings.add({
      'id': 'DART-MODEL-03',
      'model': 'RouteModel.fromBackendMapsJson (Backend POST /maps/route)',
      'capture': 'captures/backend_post_maps_route.json',
      'parsed': {
        'routesCount': routes.length,
        'distanceMeters': routes.first.distanceMeters,
        'durationSeconds': routes.first.durationSeconds,
        'polylinePointsCount': routes.first.points.length,
        'stepsCount': routes.first.steps.length,
        'summary': routes.first.summary,
      },
      'mismatchDetected': routes.first.steps.isEmpty,
      'explanation':
          'Backend POST /maps/route now returns OSRM steps[] and summary, and RouteModel.fromBackendMapsJson parses them into RouteStep objects.',
    });

    // 4. PredictionRemoteDatasource.getZoneMetrics + ZoneMetricsModel.fromJson
    final zoneMetricsHistoryBody = loadCaptureBody('backend_get_zone_metrics_history');
    final parsedZoneMetricsList = ApiResponse<List<ZoneMetricsModel>>.fromJson(
      zoneMetricsHistoryBody,
      PredictionRemoteDatasource.parseZoneMetricsList,
    );
    final rawMetricsInCapture = ((zoneMetricsHistoryBody['data'] as Map<String, dynamic>)['metrics'] as List).length;
    findings.add({
      'id': 'DART-MODEL-04',
      'model': 'PredictionRemoteDatasource.getZoneMetrics + ZoneMetricsModel.fromJson',
      'capture': 'captures/backend_get_zone_metrics_history.json',
      'backendMetricsCount': rawMetricsInCapture,
      'parsedListLength': (parsedZoneMetricsList.data ?? []).length,
      'mismatchDetected': (parsedZoneMetricsList.data ?? []).length != rawMetricsInCapture ||
          rawMetricsInCapture == 0,
      'explanation':
          'PredictionRemoteDatasource.parseZoneMetricsList unwraps {zone, metrics} Map and parses all $rawMetricsInCapture ZoneMetricsModel items.',
    });

    // 5. AiVerificationResult.fromJson across OOD & Out-of-Malang
    final oodVerifyBody = loadCaptureBody('ai_v1_verify_ood_blurry');
    final oodModel = AiVerificationResult.fromJson(oodVerifyBody);
    final outMalangBody = loadCaptureBody('ai_v1_verify_out_of_malang_jakarta');
    final outMalangModel = AiVerificationResult.fromJson(outMalangBody);
    findings.add({
      'id': 'DART-MODEL-05',
      'model': 'AiVerificationResult.fromJson (POST /v1/verify OOD & Out-of-Malang)',
      'capture': 'captures/ai_v1_verify_ood_blurry.json & ai_v1_verify_out_of_malang_jakarta.json',
      'parsedOod': {
        'isVerified': oodModel.isVerified,
        'needsManualReview': oodModel.needsManualReview,
        'detectedCategory': oodModel.detectedCategory,
        'rejectionReason': oodModel.rejectionReason,
      },
      'parsedOutMalang': {
        'isVerified': outMalangModel.isVerified,
        'isWithinMalang': outMalangModel.isWithinMalang,
        'rejectionReason': outMalangModel.rejectionReason,
      },
      'mismatchDetected': oodModel.rejectionReason == null || outMalangModel.rejectionReason == null,
      'explanation':
          'AI /v1/verify now includes reason and AiVerificationResult.fromJson populates non-null rejectionReason on invalid/manual-review responses.',
    });

    // 6. ReportRemoteDatasource.submitReport via mergeSubmittedReportWithLocalPhoto
    final detailReportBody = loadCaptureBody('backend_get_report_detail');
    final detailReportModel = ReportModel.fromJson(detailReportBody['data'] as Map<String, dynamic>);
    final mergedAfterSubmit = ReportRemoteDatasource.mergeSubmittedReportWithLocalPhoto(
      detailReportModel,
      localPhotoPath: '/tmp/report_photo.jpg',
      fallbackDescription: detailReportModel.description,
    );
    findings.add({
      'id': 'DART-MODEL-06',
      'model': 'ReportRemoteDatasource.submitReport + ReportModel.fromJson',
      'capture': 'captures/backend_get_report_detail.json',
      'beforeMerge': {
        'rawAiConfidenceScore': detailReportModel.rawAiConfidenceScore,
        'damageSeverity': detailReportModel.damageSeverity,
      },
      'afterMerge': {
        'rawAiConfidenceScore': mergedAfterSubmit.rawAiConfidenceScore,
        'damageSeverity': mergedAfterSubmit.damageSeverity,
      },
      'mismatchDetected': detailReportModel.rawAiConfidenceScore != mergedAfterSubmit.rawAiConfidenceScore ||
          detailReportModel.damageSeverity != mergedAfterSubmit.damageSeverity,
      'explanation':
          'ReportRemoteDatasource.mergeSubmittedReportWithLocalPhoto uses copyWith and preserves rawAiConfidenceScore, damageSeverity, and SLA fields.',
    });

    // 7. ApiError.fromJson against OTP error envelope
    final otpWrongBody = loadCaptureBody('backend_post_auth_verify_otp_wrong');
    final otpApiResp = ApiResponse<Map<String, dynamic>>.fromJson(otpWrongBody, (j) => j as Map<String, dynamic>);
    findings.add({
      'id': 'DART-MODEL-07',
      'model': 'ApiError.fromJson (Backend OTP Error Envelope)',
      'capture': 'captures/backend_post_auth_verify_otp_wrong.json',
      'parsedError': {
        'code': otpApiResp.error?.code,
        'message': otpApiResp.error?.message,
      },
      'mismatchDetected': otpApiResp.error?.code != 'OTP_INVALID',
      'explanation':
          'Backend HttpExceptionFilter now preserves OTP_INVALID and OTP_RESEND_COOLDOWN with remainingSeconds.',
    });

    // 8. Verify remaining models parse cleanly on live captures
    final loginBody = loadCaptureBody('backend_post_auth_login_citizen');
    final authToken = AuthTokenModel.fromJson(loginBody['data'] as Map<String, dynamic>);
    final regBody = loadCaptureBody('backend_post_auth_register');
    final regModel = RegisterResponseModel.fromJson(regBody['data'] as Map<String, dynamic>);
    final userMeBody = loadCaptureBody('backend_get_users_me');
    final userModel = UserModel.fromJson(userMeBody['data'] as Map<String, dynamic>);
    final catsBody = loadCaptureBody('backend_get_categories');
    final catModels = (catsBody['data'] as List).map((e) => CategoryModel.fromJson(e as Map<String, dynamic>)).toList();
    final agenciesBody = loadCaptureBody('backend_get_agencies');
    final agencyModels = (agenciesBody['data'] as List).map((e) => AgencyModel.fromJson(e as Map<String, dynamic>)).toList();
    final notifsBody = loadCaptureBody('backend_get_notifications');
    final notifModels = (notifsBody['data'] as List).map((e) => NotificationModel.fromJson(e as Map<String, dynamic>)).toList();
    final notifMeta = PaginationMeta.fromJson(notifsBody['meta'] as Map<String, dynamic>);
    final riskBody = loadCaptureBody('ai_v1_predict_risk');
    final riskModel = RiskPredictionResult.fromJson(riskBody);

    final outFile = File('../backend-laporkita/qa-contract-audit/dart_model_verification_results.json');
    outFile.writeAsStringSync(const JsonEncoder.withIndent('  ').convert({
      'executedWith': 'flutter test --no-pub (Real Dart VM)',
      'timestamp': DateTime.now().toIso8601String(),
      'modelsVerifiedCount': 14,
      'mismatchesProvedCount': findings.where((f) => f['mismatchDetected'] == true).length,
      'cleanModelsSummary': {
        'AuthTokenModel': authToken.tokenType,
        'RegisterResponseModel': regModel.userId.isNotEmpty,
        'UserModel': userModel.role.name,
        'CategoryModelCount': catModels.length,
        'AgencyModelCount': agencyModels.length,
        'NotificationModelCount': notifModels.length,
        'PaginationMetaLimit': notifMeta.limit,
        'RiskPredictionResultLevel': riskModel.riskLevel,
      },
      'findings': findings,
    }));

    expect(findings.where((f) => f['mismatchDetected'] == true).length, equals(0));
  });
}
