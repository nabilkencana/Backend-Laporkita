/**
 * Runtime environment loader for QA & E2E scripts.
 * Reads secrets and URLs strictly from process.env or local untracked .env files.
 * Zero hardcoded secrets in committed source.
 */
import { existsSync, readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const _currentDir = dirname(fileURLToPath(import.meta.url));

function loadDotEnvFile(filePath) {
  if (!existsSync(filePath)) return {};
  const out = {};
  const lines = readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

const beEnv = loadDotEnvFile(resolve(_currentDir, '../.env'));
const aiEnv = loadDotEnvFile(resolve(_currentDir, '../../ai-service/.env'));

export function getEnv(key, fallback = '') {
  return process.env[key] ?? beEnv[key] ?? aiEnv[key] ?? fallback;
}

export function getRequiredSecret(keys, label) {
  for (const k of keys) {
    const val = getEnv(k, '');
    if (val) return val;
  }
  throw new Error(`Missing required secret environment variable for ${label} (checked: ${keys.join(', ')})`);
}

export const QA_CONFIG = {
  baseUrl: getEnv('API_BASE_URL', 'https://api-server.canadev.my.id/api/v1'),
  aiUrl: getEnv('AI_SERVICE_URL_TEST', getEnv('AI_SERVICE_URL_LIVE', 'https://ai-server.canadev.my.id')),
  aiKey: getRequiredSecret(['AI_API_KEY', 'INTERNAL_API_KEY', 'AI_SERVICE_API_KEY'], 'AI Service X-API-Key'),
  seeds: {
    admin: {
      email: getEnv('ADMIN_EMAIL', 'admin@laporkita.malangkota.go.id'),
      password: getRequiredSecret(['ADMIN_PASSWORD'], 'Admin seed password'),
    },
    citizen: {
      email: getEnv('CITIZEN_EMAIL', 'warga@laporkita.malangkota.go.id'),
      password: getEnv('CITIZEN_PASSWORD', getEnv('SEED_USER_PASSWORD', '')),
    },
    operator: {
      email: getEnv('OPERATOR_EMAIL', 'operator.dpupr@laporkita.malangkota.go.id'),
      password: getEnv('OPERATOR_PASSWORD', getEnv('SEED_USER_PASSWORD', '')),
    },
    policyMaker: {
      email: getEnv('POLICY_MAKER_EMAIL', 'policymaker@laporkita.malangkota.go.id'),
      password: getEnv('POLICY_MAKER_PASSWORD', getEnv('SEED_USER_PASSWORD', '')),
    },
  },
};
