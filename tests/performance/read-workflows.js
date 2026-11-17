// Run only on an authorized staging deployment populated with synthetic records.
// PTP_TOKEN is supplied through the environment, never logged.
import http from 'k6/http';
import { check, sleep } from 'k6';
const base = (__ENV.PTP_BASE_URL || '').replace(/\/$/, '');
if (!base || !__ENV.PTP_TOKEN || __ENV.PTP_STAGING !== 'yes') {
  throw new Error('Set PTP_BASE_URL, PTP_TOKEN, and PTP_STAGING=yes for an authorized staging system');
}
export const options = {
  stages: [{ duration: '1m', target: 5 }, { duration: '2m', target: 10 },
           { duration: '5m', target: 20 }, { duration: '1m', target: 0 }],
  thresholds: { http_req_failed: ['rate<0.01'], http_req_duration: ['p(95)<1500'], checks: ['rate>0.99'] },
};
const routes = ['/operations/letters?limit=50', '/realisasi-anggaran/?limit=50',
  '/pagu-anggaran/?limit=50', '/anggaran/summary', '/anggaran/monthly-report'];
export default function () {
  const route = routes[(__VU + __ITER) % routes.length];
  const response = http.get(base + '/api/v1' + route, {
    headers: { Authorization: `Bearer ${__ENV.PTP_TOKEN}` }, tags: { endpoint: route }, timeout: '15s',
  });
  check(response, { 'HTTP 200': r => r.status === 200,
    'JSON response': r => (r.headers['Content-Type'] || '').includes('application/json') });
  sleep(2 + Math.random());
}
