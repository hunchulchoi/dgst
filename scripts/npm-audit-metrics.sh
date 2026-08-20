#!/usr/bin/env bash
set -uo pipefail

PROJECT_DIR="${DGST_NPM_AUDIT_PROJECT_DIR:-/mnt/dgst/src/dgstv2}"
PROM_DIR="${DGST_NPM_AUDIT_PROM_DIR:-/mnt/dgst/conf/lpg-stack/node-exporter-textfile}"
PROM_FILE="${PROM_DIR}/npm_audit.prom"
START_TS=$(date +%s)

log() {
  local message="$*"
  printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$message"
  logger -t dgst-npm-audit "$message" 2>/dev/null || true
}

if [[ ! -f "${PROJECT_DIR}/package-lock.json" ]]; then
  log "ERROR: package-lock.json not found: ${PROJECT_DIR}"
  exit 2
fi

if [[ ! -d "${PROM_DIR}" ]]; then
  log "ERROR: Prometheus textfile directory not found: ${PROM_DIR}"
  exit 2
fi

audit_json=$(mktemp /tmp/dgst-npm-audit.XXXXXX.json)
audit_error=$(mktemp /tmp/dgst-npm-audit.XXXXXX.err)
prom_tmp=$(mktemp "${PROM_DIR}/.npm_audit.prom.XXXXXX")

cleanup() {
  rm -f "${audit_json}" "${audit_error}" "${prom_tmp}"
}
trap cleanup EXIT

log "npm audit 시작: ${PROJECT_DIR}"
set +e
(
  cd "${PROJECT_DIR}" &&
    npm audit --omit=dev --json
) >"${audit_json}" 2>"${audit_error}"
audit_exit=$?
set -e

END_TS=$(date +%s)
DURATION=$((END_TS - START_TS))

if node - "${audit_json}" "${prom_tmp}" "${END_TS}" "${DURATION}" <<'NODE'
const fs = require('node:fs');

const [inputPath, outputPath, timestampRaw, durationRaw] = process.argv.slice(2);
const report = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
const vulnerabilities = report?.metadata?.vulnerabilities;

if (!vulnerabilities || typeof vulnerabilities !== 'object') {
  throw new Error('metadata.vulnerabilities missing');
}

const severities = ['info', 'low', 'moderate', 'high', 'critical'];
const counts = Object.fromEntries(
  severities.map((severity) => [severity, Number(vulnerabilities[severity] || 0)]),
);
const total = Number(
  vulnerabilities.total ??
    severities.reduce((sum, severity) => sum + counts[severity], 0),
);

const lines = [
  '# HELP dgst_npm_audit_scan_success 1 if npm audit returned valid JSON, 0 on collection failure',
  '# TYPE dgst_npm_audit_scan_success gauge',
  'dgst_npm_audit_scan_success 1',
  '',
  '# HELP dgst_npm_audit_last_run_timestamp Unix timestamp of the latest npm audit run',
  '# TYPE dgst_npm_audit_last_run_timestamp gauge',
  `dgst_npm_audit_last_run_timestamp ${Number(timestampRaw)}`,
  '',
  '# HELP dgst_npm_audit_duration_seconds Duration of the latest npm audit run',
  '# TYPE dgst_npm_audit_duration_seconds gauge',
  `dgst_npm_audit_duration_seconds ${Number(durationRaw)}`,
  '',
  '# HELP dgst_npm_audit_vulnerabilities Vulnerabilities reported by npm audit by severity',
  '# TYPE dgst_npm_audit_vulnerabilities gauge',
  ...severities.map(
    (severity) =>
      `dgst_npm_audit_vulnerabilities{severity="${severity}"} ${counts[severity]}`,
  ),
  '',
  '# HELP dgst_npm_audit_vulnerabilities_total Total vulnerabilities reported by npm audit',
  '# TYPE dgst_npm_audit_vulnerabilities_total gauge',
  `dgst_npm_audit_vulnerabilities_total ${total}`,
  '',
];

fs.writeFileSync(outputPath, lines.join('\n'));
NODE
then
  chmod 0644 "${prom_tmp}"
  mv -f "${prom_tmp}" "${PROM_FILE}"
  log "npm audit 완료: exit=${audit_exit}, metric=${PROM_FILE}, duration=${DURATION}s"
  exit 0
fi

cat >"${prom_tmp}" <<METRICS
# HELP dgst_npm_audit_scan_success 1 if npm audit returned valid JSON, 0 on collection failure
# TYPE dgst_npm_audit_scan_success gauge
dgst_npm_audit_scan_success 0

# HELP dgst_npm_audit_last_run_timestamp Unix timestamp of the latest npm audit run
# TYPE dgst_npm_audit_last_run_timestamp gauge
dgst_npm_audit_last_run_timestamp ${END_TS}

# HELP dgst_npm_audit_duration_seconds Duration of the latest npm audit run
# TYPE dgst_npm_audit_duration_seconds gauge
dgst_npm_audit_duration_seconds ${DURATION}
METRICS
chmod 0644 "${prom_tmp}"
mv -f "${prom_tmp}" "${PROM_FILE}"

error_summary=$(tr '\n' ' ' <"${audit_error}" | cut -c1-500)
log "ERROR: npm audit 수집 실패: exit=${audit_exit}, ${error_summary:-invalid JSON response}"
exit 2
