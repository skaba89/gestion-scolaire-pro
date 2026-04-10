import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TenantProvider, useTenant } from '@/contexts/TenantContext';
import { useAuth } from '@/contexts/AuthContext';
// Mock dependencies
vi.mock('@/contexts/AuthContext', () => ({
    useAuth: vi.fn(),
}));

describe('useTenant', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should return null when no tenant is selected', async () => {
        (useAuth as any).mockReturnValue({
            profile: null,
            isLoading: false,
            tenant: null,
            isSuperAdmin: () => false,
        });

        const wrapper = ({ children }: { children: React.ReactNode }) => (
            <TenantProvider>{children}</TenantProvider>
        );

        const { result } = renderHook(() => useTenant(), { wrapper });

        await waitFor(() => {
            expect(result.current.isLoading).toBe(false);
        });

        expect(result.current.tenant).toBeNull();
    });

    it('should return tenant from auth context if available', async () => {
        const mockTenant = { id: 'tenant-123', name: 'Test School', slug: 'test-school' };
        (useAuth as any).mockReturnValue({
            profile: { tenant_id: 'tenant-123' },
            isLoading: false,
            tenant: mockTenant,
            isSuperAdmin: () => false,
        });

        const wrapper = ({ children }: { children: React.ReactNode }) => (
            <TenantProvider>{children}</TenantProvider>
        );

        const { result } = renderHook(() => useTenant(), { wrapper });

        await waitFor(() => {
            expect(result.current.isLoading).toBe(false);
        });

        expect(result.current.tenant).toEqual(mockTenant);
    });
});
