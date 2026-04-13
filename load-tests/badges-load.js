// SchoolFlow Pro — Load Tests for Badges API
// Usage: k6 run --env BASE_URL=http://localhost:8000 load-tests/badges-load.js
// Requires: ANON_KEY env var with a valid JWT from POST /api/v1/auth/login/
import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Rate, Trend, Counter, Gauge } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');
const successRate = new Rate('success');
const badgeLoadTime = new Trend('badge_load_time');
const badgeListTime = new Trend('badge_list_time');
const requestCount = new Counter('requests');
const activeUsers = new Gauge('active_users');

// Configuration
const BASE_URL = __ENV.BASE_URL || 'http://localhost:8000';
// IMPORTANT: Set a valid JWT token via env var obtained from login endpoint
// Example: k6 run -e ANON_KEY=$(curl -s -X POST http://localhost:8000/api/v1/auth/login/ ...)
const ANON_KEY = __ENV.ANON_KEY || '';

if (!ANON_KEY) {
    console.warn('WARNING: ANON_KEY not set. Load tests will likely fail with 401.');
    console.warn('Obtain a token via: POST /api/v1/auth/login/');
}

// Load test configuration
export const options = {
  stages: [
    { duration: '30s', target: 10, name: 'Ramp-up to 10 users' },
    { duration: '1m', target: 50, name: 'Ramp-up to 50 users' },
    { duration: '2m', target: 100, name: 'Ramp-up to 100 users' },
    { duration: '3m', target: 100, name: 'Hold at 100 users' },
    { duration: '1m', target: 50, name: 'Ramp-down to 50 users' },
    { duration: '30s', target: 0, name: 'Ramp-down to 0 users' },
  ],
  thresholds: {
    errors: ['rate<0.1'],
    success: ['rate>0.9'],
    badge_load_time: ['p(95)<500'],
    badge_list_time: ['p(95)<1000'],
    http_req_duration: ['p(95)<800'],
  },
};

const headers = {
  Authorization: `Bearer ${ANON_KEY}`,
  'Content-Type': 'application/json',
};

export default function () {
  activeUsers.add(1);

  // Scenario 1: Health check
  group('Health Check', () => {
    const res = http.get(`${BASE_URL}/health/`, { headers });
    check(res, {
      'status is 200': (r) => r.status === 200,
    });
    requestCount.add(1);
  });

  sleep(1);

  // Scenario 2: API v1 root
  group('API Root', () => {
    const res = http.get(`${BASE_URL}/api/v1/`, { headers });
    check(res, {
      'status is 200': (r) => r.status === 200,
    });
    successRate.add(res.status === 200);
    requestCount.add(1);
  });

  sleep(1);

  activeUsers.add(-1);
}

export function handleSummary(data) {
  return {
    'stdout': textSummary(data, { indent: ' ', enableColors: true }),
    'load-tests/summary.json': JSON.stringify(data),
  };
}

function textSummary(data, options) {
  let summary = '\n=== LOAD TEST SUMMARY ===\n\n';

  if (data.metrics.http_req_duration) {
    const metric = data.metrics.http_req_duration;
    summary += 'HTTP Request Duration:\n';
    summary += `   Min: ${metric.values.min}ms\n`;
    summary += `   Max: ${metric.values.max}ms\n`;
    summary += `   Avg: ${(metric.values.sum / metric.values.count).toFixed(2)}ms\n`;
    summary += `   P95: ${(metric.values['p(95)'] || 'N/A')}ms\n\n`;
  }

  if (data.metrics.requests) {
    const metric = data.metrics.requests;
    summary += `Total Requests: ${metric.values.count}\n`;
    summary += `Success Rate: ${((data.metrics.success?.values.rate || 0) * 100).toFixed(2)}%\n`;
    summary += `Error Rate: ${((data.metrics.errors?.values.rate || 0) * 100).toFixed(2)}%\n\n`;
  }

  return summary;
}
