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
    {
      route: 'src/routes/AdminRoutes.tsx',
      layout: 'src/components/layouts/AdminLayout.tsx',
      path: '/admin/documentation',
      leaf: 'documentation',
    },
    {
      route: 'src/routes/AdminRoutes.tsx',
      layout: 'src/components/layouts/AdminLayout.tsx',
      path: '/admin/incidents',
      leaf: 'incidents',
    },
    {
      route: 'src/routes/AdminRoutes.tsx',
      layout: 'src/components/layouts/AdminLayout.tsx',
      path: '/admin/surveys',
      leaf: 'surveys',
    },
    {
      route: 'src/routes/AdminRoutes.tsx',
      layout: 'src/components/layouts/AdminLayout.tsx',
      path: '/admin/forums',
      leaf: 'forums',
    },
    {
      route: 'src/routes/AdminRoutes.tsx',
      layout: 'src/components/layouts/AdminLayout.tsx',
      path: '/admin/academic-rules',
      leaf: 'academic-rules',
    },
  ];

  it.each(cases)('$path is registered and linked in its sidebar', ({ route, layout, path, leaf }) => {
    const routes = readFileSync(resolve(process.cwd(), route), 'utf8');
    const navigation = readFileSync(resolve(process.cwd(), layout), 'utf8');
    expect(routes).toContain(`path="${leaf}"`);
    expect(navigation).toContain(`getTenantUrl("${path}")`);
  });

  it('restricts incident navigation to tenants administrators', () => {
    const adminNav = readFileSync(resolve(process.cwd(), 'src/components/layouts/AdminLayout.tsx'), 'utf8');
    expect(adminNav).toContain('getTenantUrl("/admin/incidents"), label: t("nav.incidents"), icon: Shield, permission: "tenant:manage"');
    expect(adminNav).toContain('getTenantUrl("/admin/documentation"), label: t("nav.documentation"), icon: BookOpen, permission: "guides:read"');
    expect(adminNav).toContain('getTenantUrl("/admin/surveys"), label: t("nav.surveys"), icon: ClipboardList, permission: "tenant:manage"');
    expect(adminNav).toContain('getTenantUrl("/admin/forums"), label: t("nav.forums"), icon: MessageSquare, permission: "tenant:manage"');
    expect(adminNav).toContain('getTenantUrl("/admin/academic-rules"), label: t("nav.academicRules"), icon: ClipboardList, permission: "settings:manage"');
  });
});
