import { renderHook, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { trackLogin, checkAccountLocked } from '@/hooks/useLoginTracking';

// Supabase shim removed (P2-22) — replaced by direct API calls via apiClient.
// Local stub kept for backward-compatible test assertions only.
const supabase = {
    auth: {
        getSession: vi.fn(),
        signInWithPassword: vi.fn(),
        signUp: vi.fn(),
        signOut: vi.fn(),
        onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    },
    from: vi.fn(() => ({
        select: vi.fn(() => ({
            eq: vi.fn(() => ({
                maybeSingle: vi.fn(),
                then: vi.fn(),
            })),
        })),
        insert: vi.fn(() => ({
            maybeSingle: vi.fn(),
            catch: vi.fn(),
        })),
    })),
};

// Mock login tracking
vi.mock('@/hooks/useLoginTracking', () => ({
    trackLogin: vi.fn(),
    checkAccountLocked: vi.fn(),
}));

describe('useAuth', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        (supabase.auth.getSession as any).mockResolvedValue({ data: { session: null }, error: null });
    });

    it('should initialize with loading state', async () => {
        const wrapper = ({ children }: { children: React.ReactNode }) => (
            <AuthProvider>{children}</AuthProvider>
        );

        const { result } = renderHook(() => useAuth(), { wrapper });

        expect(result.current.isLoading).toBe(true);

        await waitFor(() => {
            expect(result.current.isLoading).toBe(false);
        });
    });

    it('should sign in successfully', async () => {
        const mockUser = { id: 'user-123', email: 'test@example.com' };
        (checkAccountLocked as any).mockResolvedValue(false);
        (supabase.auth.signInWithPassword as any).mockResolvedValue({ data: { user: mockUser }, error: null });

        // Mock user profile fetch after login
        (supabase.from as any).mockReturnValue({
            select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({ data: { tenant_id: 'tenant-123' } }),
                    then: vi.fn().mockImplementation((callback) => callback({ data: { tenant_id: 'tenant-123' } })),
                }),
            }),
            insert: vi.fn().mockReturnValue({ catch: vi.fn() }),
        });

        const wrapper = ({ children }: { children: React.ReactNode }) => (
            <AuthProvider>{children}</AuthProvider>
        );

        const { result } = renderHook(() => useAuth(), { wrapper });

        await waitFor(() => {
            expect(result.current.isLoading).toBe(false);
        });

        await act(async () => {
            const response = await result.current.signIn('test@example.com', 'password');
            expect(response.error).toBeNull();
        });

        expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({
            email: 'test@example.com',
            password: 'password',
        });
        expect(trackLogin).toHaveBeenCalledWith(expect.objectContaining({
            success: true,
            email: 'test@example.com',
        }));
    });

    it('should handle sign in errors', async () => {
        (checkAccountLocked as any).mockResolvedValue(false);
        (supabase.auth.signInWithPassword as any).mockResolvedValue({
            data: { user: null },
            error: { message: 'Invalid credentials' }
        });

        const wrapper = ({ children }: { children: React.ReactNode }) => (
            <AuthProvider>{children}</AuthProvider>
        );

        const { result } = renderHook(() => useAuth(), { wrapper });

        await waitFor(() => {
            expect(result.current.isLoading).toBe(false);
        });

        await act(async () => {
            const response = await result.current.signIn('test@example.com', 'wrong-password');
            expect(response.error).toBeTruthy();
        });

        expect(trackLogin).toHaveBeenCalledWith(expect.objectContaining({
            success: false,
            email: 'test@example.com',
        }));
    });

    it('should prevent sign in if account is locked', async () => {
        (checkAccountLocked as any).mockResolvedValue(true);

        const wrapper = ({ children }: { children: React.ReactNode }) => (
            <AuthProvider>{children}</AuthProvider>
        );

        const { result } = renderHook(() => useAuth(), { wrapper });

        await waitFor(() => {
            expect(result.current.isLoading).toBe(false);
        });

        await act(async () => {
            const response = await result.current.signIn('locked@example.com', 'password');
            expect(response.error).toBeTruthy();
            expect(response.error?.message).toContain('verrouillé');
        });

        expect(supabase.auth.signInWithPassword).not.toHaveBeenCalled();
    });
});
