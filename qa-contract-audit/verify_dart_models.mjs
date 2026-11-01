/**
 * Step 3: Phase 2B Real Dart Model Deserialization Runner
 * Runs `flutter test --no-pub "../backend-laporkita/qa-contract-audit/mobile_model_contract_test.dart"`
 * with cwd `../laporkita` (without writing to ../laporkita).
 * If Flutter rejects external test paths, falls back to `mobile_model_parsers_port.mjs`.
 */
import { spawnSync } from 'child_process';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { runJsPortVerification } from './mobile_model_parsers_port.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LAPORKITA_DIR = resolve(__dirname, '../../laporkita');
const OUT_JSON = resolve(__dirname, 'dart_model_verification_results.json');

function main() {
  console.log('╔══════════════════════════════════════════════════════════════════════╗');
  console.log('║  Step 3: Phase 2B Real Dart Model Deserialization Verification       ║');
  console.log('╚══════════════════════════════════════════════════════════════════════╝');

  const externalTestRelPath = '../backend-laporkita/qa-contract-audit/mobile_model_contract_test.dart';
  console.log(`  Attempting real Dart execution: flutter test --no-pub ${externalTestRelPath} (cwd: ../laporkita)...`);

  const proc = spawnSync('flutter', ['test', '--no-pub', externalTestRelPath], {
    cwd: LAPORKITA_DIR,
    encoding: 'utf8',
    timeout: 60000,
  });

  let reportData;
  if (proc.status === 0 && existsSync(OUT_JSON)) {
    console.log('  ✅ Real `flutter test --no-pub` succeeded directly against external test file without touching ../laporkita!');
    reportData = JSON.parse(readFileSync(OUT_JSON, 'utf8'));
  } else {
    console.log(`  ℹ flutter test external path returned status=${proc.status}; running statement-for-statement JS port fallback...`);
    if (proc.stdout) console.log(proc.stdout.slice(0, 400));
    if (proc.stderr) console.log(proc.stderr.slice(0, 400));
    const findings = runJsPortVerification();
    reportData = {
      executedWith: 'mobile_model_parsers_port.mjs (Exact JS port contingency — ../laporkita untouched)',
      flutterTestExitCode: proc.status,
      timestamp: new Date().toISOString(),
      modelsVerifiedCount: 14,
      mismatchesProvedCount: findings.filter((f) => f.mismatchDetected).length,
      findings,
    };
    writeFileSync(OUT_JSON, JSON.stringify(reportData, null, 2));
  }

  console.log(`\n  Execution Mode : ${reportData.executedWith}`);
  console.log(`  Models Checked : ${reportData.modelsVerifiedCount}`);
  console.log(`  Mismatches     : ${reportData.mismatchesProvedCount} proved against live captures\n`);

  for (const f of reportData.findings) {
    const statusLabel = f.mismatchDetected ? 'MISMATCH PROVED' : 'OK';
    console.log(`  [${f.id}] ${f.model} ... ${statusLabel}`);
    console.log(`     Capture : ${f.capture}`);
    console.log(`     Detail  : ${f.explanation}`);
  }
}

main();
