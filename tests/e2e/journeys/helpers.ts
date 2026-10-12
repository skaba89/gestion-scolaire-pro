import fs from 'node:fs';
import path from 'node:path';
import type { APIRequestContext, Page } from '@playwright/test';

export type Account = { email: string; password: string };
export type Credentials = {
  uls: { id: string; slug: string; admin: Account; teacher: Account };
  witness: { id: string; slug: string; admin: Account };
};
export type Role = 'admin' | 'teacher' | 'witness';

export const API = `${process.env.E2E_API_ORIGIN ?? 'http://localhost:8000'}/api/v1`;
export const AUTH_DIR = path.resolve('test-results/.auth-journeys');

export function credentials(): Credentials {
  const file = process.env.E2E_CREDENTIALS_FILE;
  if (!file) throw new Error('E2E_CREDENTIALS_FILE manquant (comptes créés par scripts/ci/seed_e2e.py).');
  return JSON.parse(fs.readFileSync(file, 'utf8')) as Credentials;
}

export function account(role: Role): { slug: string; account: Account } {
  const c = credentials();
  if (role === 'witness') return { slug: c.witness.slug, account: c.witness.admin };
  return { slug: c.uls.slug, account: c.uls[role] };
}

export const stateFile = (role: Role) => path.join(AUTH_DIR, `${role}.json`);

/** Jeton d'accès de la session enregistrée (localStorage du frontend). */
export function tokenOf(role: Role): string {
  const state = JSON.parse(fs.readFileSync(stateFile(role), 'utf8'));
  for (const origin of state.origins ?? []) {
    const item = (origin.localStorage ?? []).find((i: { name: string }) => i.name === 'schoolflow:access_token');
    if (item) return item.value;
  }
  throw new Error(`Aucun jeton dans la session ${role}`);
}

export function api(request: APIRequestContext, role: Role) {
  const headers = { Authorization: `Bearer ${tokenOf(role)}` };
  return {
    get: (url: string) => request.get(`${API}${url}`, { headers }),
    post: (url: string, data: unknown) => request.post(`${API}${url}`, { headers, data }),
  };
}

/** URL d'une page de l'établissement Université La Source. */
export const ulsUrl = (p: string) => `/${credentials().uls.slug}${p}`;

/** Connexion par l'interface, comme un utilisateur réel. */
export async function loginThroughUi(page: Page, role: Role): Promise<void> {
  const { slug, account: acc } = account(role);
  await page.goto(`/${slug}/login`);
  await page.locator('#email').fill(acc.email);
  await page.locator('#password').fill(acc.password);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await page.waitForURL((url) => !url.pathname.endsWith('/login'), { timeout: 30_000 });
  await page.waitForLoadState('networkidle');
}
