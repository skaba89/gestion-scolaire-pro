// PHASE 3b: K6 Load Test - Baseline (Small User Load)
// Quick test to validate system before large-scale load testing
// Run: k6 run badges-baseline.js

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Trend, Rate } from 'k6/metrics';

const BASE_URL = 'http://localhost:8000';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzY4Njc3Mzk3LCJleHAiOjIwODQwMzczOTd9.cy_NIuDqX_LcCTwokeNqXUyD4G8dNi12NfTLCo2s72M';

export const options = {
  stages: [
    { duration: '10s', target: 5, name: 'Warm up' },
    { duration: '30s', target: 10, name: 'Ramp-up' },
    { duration: '20s', target: 10, name: 'Hold' },
    { duration: '10s', target: 0, name: 'Cool down' },
  ],
  thresholds: {
    http_req_duration: ['p(95)<500', 'p(99)<1000'],
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
  metrics.errorRate.add(!check(listRes, {
    'status is 200': (r) => r.status === 200,
    'has badges': (r) => r.body.length > 0,
  }));

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
  metrics.errorRate.add(!check(singleRes, {
    'status is 200': (r) => r.status === 200,
  }));

  sleep(1);
}
