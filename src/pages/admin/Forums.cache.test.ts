import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('forum mutation cache coherence', () => {
  const forums = readFileSync(resolve(process.cwd(), 'src/pages/admin/Forums.tsx'), 'utf8');
  const queryModule = readFileSync(resolve(process.cwd(), 'src/queries/admin.ts'), 'utf8');

  it('invalidates the same list cache key that the forum query uses', () => {
    expect(queryModule).toContain('queryKey: ["admin-student-forums", tenantId]');
    expect(forums.match(/queryKey: \["admin-student-forums", tenant\?\.id\]/g)).toHaveLength(2);
    expect(forums).not.toContain('queryKey: ["student-forums"]');
  });

  it('refreshes forum post counts after both save and delete', () => {
    expect(queryModule).toContain('queryKey: ["admin-forum-post-counts", tenantId]');
    expect(forums.match(/queryKey: \["admin-forum-post-counts", tenant\?\.id\]/g)).toHaveLength(2);
  });
});
