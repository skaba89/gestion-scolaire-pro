/**
 * SchoolFlow Pro — E2E Global Setup
 * Waits for all services to be ready before running tests.
 */

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

async function waitForUrl(url: string, maxAttempts = 40, label = url): Promise<void> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await fetch(url);
      if (res.ok || res.status < 500) {
        console.log(`  ✓ ${label} ready`);
        return;
      }
    } catch {
      // still starting
    }
    await new Promise(r => setTimeout(r, 1500));
  }
  throw new Error(`${label} did not become ready after ${maxAttempts * 1.5}s`);
}

export default async () => {
  console.log('\n🧪 SchoolFlow Pro — E2E environment setup\n');

  // ── 1. Check required Docker containers ──────────────────────────────────
  const REQUIRED = ['schoolflow-pro-postgres-1', 'schoolflow-pro-api-1'];
  try {
    const { stdout } = await execAsync('docker ps --format "{{.Names}}"');
    const running = stdout.split('\n');
    for (const name of REQUIRED) {
      if (!running.some(n => n.includes(name.replace('schoolflow-pro-', '')))) {
        console.warn(`  ⚠️  Container '${name}' not detected — tests may fail.`);
      }
    }
  } catch {
    console.warn('  ⚠️  Cannot check Docker containers (docker not in PATH?)');
  }

  // ── 2. Wait for API ───────────────────────────────────────────────────────
  console.log('  ⏳ Waiting for API...');
  await waitForUrl('http://localhost:8000/api/v1/health/', 40, 'API (localhost:8000)');

  // ── 3. Wait for frontend (started by Playwright webServer) ───────────────
  console.log('  ⏳ Waiting for frontend dev server...');
  await waitForUrl('http://localhost:3000', 30, 'Frontend (localhost:3000)');

  console.log('\n✅ All services ready — starting tests!\n');
};
