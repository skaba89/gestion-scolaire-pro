import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { usePermissions } from '@/hooks/usePermissions';
import { useAuth } from '@/contexts/AuthContext';
import { Permission } from '@/lib/permissions';

// Mock AuthContext
vi.mock('@/contexts/AuthContext', () => ({
    useAuth: vi.fn(),
}));

describe('usePermissions', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should return all permissions for SUPER_ADMIN', () => {
        (useAuth as any).mockReturnValue({
            roles: ['SUPER_ADMIN'],
        });

        const { result } = renderHook(() => usePermissions());

        expect(result.current.can('users:delete')).toBe(true);
        expect(result.current.can('settings:manage')).toBe(true);
        expect(result.current.canAll(['users:create', 'users:delete'])).toBe(true);
    });

    it('should return limited permissions for STUDENT', () => {
        (useAuth as any).mockReturnValue({
            roles: ['STUDENT'],
        });

        const { result } = renderHook(() => usePermissions());

        expect(result.current.can('grades:read')).toBe(true);
        expect(result.current.can('users:delete')).toBe(false); // Student cannot delete users
        expect(result.current.canAny(['grades:read', 'users:delete'])).toBe(true); // Has one of them
        expect(result.current.canAll(['grades:read', 'users:delete'])).toBe(false); // Doesn't have both
    });

    it('should handle multiple roles correctly', () => {
        // A user with both TEACHER and PARENT roles (hypothetically)
        (useAuth as any).mockReturnValue({
            roles: ['TEACHER', 'PARENT'],
        });

        const { result } = renderHook(() => usePermissions());

        // Teacher permission
        expect(result.current.can('assessments:create')).toBe(true);
        // Parent permission (e.g. invoices:read)
        expect(result.current.can('invoices:read')).toBe(true);

        // Permission neither has
        expect(result.current.can('settings:manage')).toBe(false);
    });

    it('should return correct permissions list', () => {
        (useAuth as any).mockReturnValue({
            roles: ['STUDENT'],
        });

        const { result } = renderHook(() => usePermissions());

        expect(result.current.permissions).toContain('grades:read');
        expect(result.current.permissions).not.toContain('users:delete');
    });
});
