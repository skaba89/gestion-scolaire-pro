import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Navigation contracts: do not ship working parent/teacher pages without
 * a discoverable link in their role-specific sidebar.
 */
describe('appointment routes are reachable through role navigation', () => {
  const cases = [
    {
      route: 'src/routes/ParentRoutes.tsx',
      layout: 'src/components/layouts/ParentLayout.tsx',
      path: '/parent/appointments',
      leaf: 'appointments',
    },
    {
      route: 'src/routes/TeacherRoutes.tsx',
      layout: 'src/components/layouts/TeacherLayout.tsx',
      path: '/teacher/appointment-slots',
      leaf: 'appointment-slots',
    },
  ];

  it.each(cases)('$path is registered and linked in its sidebar', ({ route, layout, path, leaf }) => {
    const routes = readFileSync(resolve(process.cwd(), route), 'utf8');
    const navigation = readFileSync(resolve(process.cwd(), layout), 'utf8');
    expect(routes).toContain(`path="${leaf}"`);
    expect(navigation).toContain(`getTenantUrl("${path}")`);
  });
});
