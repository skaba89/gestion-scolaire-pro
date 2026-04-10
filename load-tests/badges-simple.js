import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Trend, Rate } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzY4Njc3Mzk3LCJleHAiOjIwODQwMzczOTd9.cy_NIuDqX_LcCTwokeNqXUyD4G8dNi12NfTLCo2s72M';

export const options = {
  stages: [
    { duration: '30s', target: 20 },
    { duration: '1m', target: 50 },
    { duration: '2m', target: 100 },
    { duration: '2m', target: 100 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<1000'],
    http_req_failed: ['rate<0.1'],
  },
};

export const metrics = {
  requestCount: new Counter('requests'),
  errorCount: new Counter('errors'),
  responseDuration: new Trend('response_duration'),
  errorRate: new Rate('error_rate'),
};

export default function () {
  // Test 1: List badges
  const listRes = http.get(`${BASE_URL}/rest/v1/badges_definitions?limit=50`, {
    headers: {
      Authorization: `Bearer ${ANON_KEY}`,
      'Content-Type': 'application/json',
    },
  });

  metrics.requestCount.add(1);
  metrics.responseDuration.add(listRes.timings.duration);
  
  const listSuccess = check(listRes, {
    'list status is 200': (r) => r.status === 200,
    'list has body': (r) => r.body && r.body.length > 0,
  });
  
  if (!listSuccess) {
    metrics.errorRate.add(1);
    metrics.errorCount.add(1);
  }

  sleep(1);

  // Test 2: Get single badge
  const singleRes = http.get(
    `${BASE_URL}/rest/v1/badges_definitions?limit=1&offset=${Math.floor(Math.random() * 50)}`,
    {
      headers: {
        Authorization: `Bearer ${ANON_KEY}`,
        'Content-Type': 'application/json',
      },
    }
  );

  metrics.requestCount.add(1);
  metrics.responseDuration.add(singleRes.timings.duration);
  
  const singleSuccess = check(singleRes, {
    'single status is 200': (r) => r.status === 200,
  });
  
  if (!singleSuccess) {
    metrics.errorRate.add(1);
    metrics.errorCount.add(1);
  }

  sleep(1);

  // Test 3: Filter by type
  const types = ['performance', 'achievement', 'attendance', 'participation', 'certification'];
  const selectedType = types[Math.floor(Math.random() * types.length)];
  
  const filterRes = http.get(
    `${BASE_URL}/rest/v1/badges_definitions?badge_type=eq.${selectedType}&limit=20`,
    {
      headers: {
        Authorization: `Bearer ${ANON_KEY}`,
        'Content-Type': 'application/json',
      },
    }
  );

  metrics.requestCount.add(1);
  metrics.responseDuration.add(filterRes.timings.duration);
  
  const filterSuccess = check(filterRes, {
    'filter status is 200': (r) => r.status === 200,
  });
  
  if (!filterSuccess) {
    metrics.errorRate.add(1);
    metrics.errorCount.add(1);
  }

  sleep(1);
}
