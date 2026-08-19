import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const hooks = readFileSync('src/hooks.server.js', 'utf8');
const dashboard = readFileSync('monitoring/grafana/dashboards/dgst-overview.json', 'utf8');
const alertRules = readFileSync('monitoring/grafana/provisioning/alerting/rules.yml', 'utf8');

describe('HTTP slow response thresholds', () => {
  it('logs responses from 500ms as warnings and responses from 2s as errors', () => {
    expect(hooks).toContain('const HTTP_SLOW_WARN_THRESHOLD_MS = 500;');
    expect(hooks).toContain('const HTTP_SLOW_CRITICAL_THRESHOLD_MS = 2000;');
    expect(hooks).toMatch(
      /executionTime >= HTTP_SLOW_CRITICAL_THRESHOLD_MS[\s\S]*?logger\.error\([\s\S]*?slow_tier: 'critical'/
    );
    expect(hooks).toMatch(
      /executionTime >= HTTP_SLOW_WARN_THRESHOLD_MS[\s\S]*?logger\.warn\([\s\S]*?slow_tier: 'warn'/
    );
  });

  it('shows the same thresholds in Grafana', () => {
    expect(dashboard).toContain('"legendFormat": "slow ≥500ms"');
    expect(dashboard).toContain('"legendFormat": "slow ≥2s"');
    expect(dashboard).not.toContain('"legendFormat": "slow >100ms"');
    expect(alertRules).toMatch(
      /uid: dgst-p95-slow[\s\S]*?labels:\s+severity: critical\s+service: dgst/
    );
    expect(alertRules).toMatch(
      /uid: dgst-slow-critical[\s\S]*?labels:\s+severity: critical\s+service: dgst/
    );
  });
});
