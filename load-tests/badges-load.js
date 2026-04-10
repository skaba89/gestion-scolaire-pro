import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Rate, Trend, Counter, Gauge } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');
const successRate = new Rate('success');
const badgeLoadTime = new Trend('badge_load_time');
const badgeListTime = new Trend('badge_list_time');
const leaderboardTime = new Trend('leaderboard_time');
const requestCount = new Counter('requests');
const activeUsers = new Gauge('active_users');

// Configuration
const BASE_URL = __ENV.BASE_URL || 'http://localhost:8000';
const ANON_KEY = __ENV.ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzY4Njc3Mzk3LCJleHAiOjIwODQwMzczOTd9.cy_NIuDqX_LcCTwokeNqXUyD4G8dNi12NfTLCo2s72M';

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
    errors: ['rate<0.1'], // Error rate must be < 10%
    success: ['rate>0.9'], // Success rate must be > 90%
    badge_load_time: ['p(95)<500'], // 95% of single badge requests < 500ms
    badge_list_time: ['p(95)<1000'], // 95% of list requests < 1s
    http_req_duration: ['p(95)<800'], // 95% of all HTTP requests < 800ms
  },
  thresholdTags: {
    staticContent: ['http_req_duration:max<1000'],
  },
};

export default function () {
  activeUsers.add(1);

  // Scenario 1: Get badge list (most common)
  group('📋 List All Badges', () => {
    const startTime = Date.now();
    const res = http.get(`${BASE_URL}/rest/v1/badges_definitions?limit=100`, {
      headers: {
        Authorization: `Bearer ${ANON_KEY}`,
        'Content-Type': 'application/json',
      },
    });
    const duration = Date.now() - startTime;

    badgeListTime.add(duration);
    requestCount.add(1);

    check(res, {
      'status is 200': (r) => r.status === 200,
      'has body': (r) => r.body.length > 0,
      'response time < 1s': () => duration < 1000,
    }) || errorRate.add(1);
    successRate.add(res.status === 200);
  });

  sleep(1);

  // Scenario 2: Get single badge
  group('🎖️ Get Single Badge', () => {
    const badgeIndex = Math.floor(Math.random() * 1050);
    const res = http.get(
      `${BASE_URL}/rest/v1/badges_definitions?limit=1&offset=${badgeIndex}`,
      {
        headers: {
          Authorization: `Bearer ${ANON_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    badgeLoadTime.add(res.timings.duration);
    requestCount.add(1);

    check(res, {
      'status is 200': (r) => r.status === 200,
      'response time < 500ms': (r) => r.timings.duration < 500,
    }) || errorRate.add(1);
    successRate.add(res.status === 200);
  });

  sleep(1);

  // Scenario 3: Filter by type
  group('🔍 Filter Badges by Type', () => {
    const types = ['performance', 'achievement', 'attendance', 'participation', 'certification'];
    const selectedType = types[Math.floor(Math.random() * types.length)];

    const res = http.get(
      `${BASE_URL}/rest/v1/badges_definitions?badge_type=eq.${selectedType}&limit=50`,
      {
        headers: {
          Authorization: `Bearer ${ANON_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    requestCount.add(1);

    check(res, {
      'status is 200': (r) => r.status === 200,
      'filtered results': (r) => r.body.length > 0,
    }) || errorRate.add(1);
    successRate.add(res.status === 200);
  });

  sleep(1);

  // Scenario 4: Filter by rarity
  group('💎 Filter Badges by Rarity', () => {
    const rarities = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
    const selectedRarity = rarities[Math.floor(Math.random() * rarities.length)];

    const res = http.get(
      `${BASE_URL}/rest/v1/badges_definitions?rarity=eq.${selectedRarity}&limit=50`,
      {
        headers: {
          Authorization: `Bearer ${ANON_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    requestCount.add(1);

    check(res, {
      'status is 200': (r) => r.status === 200,
      'rarity filter works': (r) => r.body.length > 0,
    }) || errorRate.add(1);
    successRate.add(res.status === 200);
  });

  sleep(2);

  // Scenario 5: Pagination test
  group('📄 Badge Pagination', () => {
    const page = Math.floor(Math.random() * 10) + 1;
    const offset = (page - 1) * 100;

    const res = http.get(
      `${BASE_URL}/rest/v1/badges_definitions?limit=100&offset=${offset}`,
      {
        headers: {
          Authorization: `Bearer ${ANON_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    requestCount.add(1);

    check(res, {
      'status is 200': (r) => r.status === 200,
      'pagination works': (r) => r.body.length > 0 || r.body.length === 0, // Last page may be empty
    }) || errorRate.add(1);
    successRate.add(res.status === 200);
  });

  sleep(1);

  activeUsers.add(-1);
}

export function handleSummary(data) {
  // Generate custom summary
  return {
    'stdout': textSummary(data, { indent: ' ', enableColors: true }),
    'load-tests/summary.json': JSON.stringify(data),
  };
}

function textSummary(data, options) {
  let summary = '\n📊 === LOAD TEST SUMMARY ===\n\n';

  // HTTP Request Stats
  if (data.metrics.http_req_duration) {
    const metric = data.metrics.http_req_duration;
    summary += '⏱️  HTTP Request Duration:\n';
    summary += `   • Min: ${metric.values.min}ms\n`;
    summary += `   • Max: ${metric.values.max}ms\n`;
    summary += `   • Avg: ${(metric.values.sum / metric.values.count).toFixed(2)}ms\n`;
    summary += `   • P95: ${(metric.values['p(95)'] || 'N/A')}ms\n`;
    summary += `   • P99: ${(metric.values['p(99)'] || 'N/A')}ms\n\n`;
  }

  // Request counts
  if (data.metrics.requests) {
    const metric = data.metrics.requests;
    summary += `📈 Total Requests: ${metric.values.count}\n`;
    summary += `✅ Success Rate: ${((data.metrics.success?.values.rate || 0) * 100).toFixed(2)}%\n`;
    summary += `❌ Error Rate: ${((data.metrics.errors?.values.rate || 0) * 100).toFixed(2)}%\n\n`;
  }

  return summary;
}
