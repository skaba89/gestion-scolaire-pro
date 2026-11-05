// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useNativePushNotifications } from '../useNativePushNotifications';

const mocks = vi.hoisted(() => ({
  addListener: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => true,
    getPlatform: () => 'android',
  },
}));

vi.mock('@capacitor/push-notifications', () => ({
  PushNotifications: {
    checkPermissions: vi.fn().mockResolvedValue({ receive: 'granted' }),
    requestPermissions: vi.fn().mockResolvedValue({ receive: 'granted' }),
    register: vi.fn(),
    addListener: mocks.addListener,
    removeAllListeners: vi.fn(),
  },
}));

vi.mock('@/api/client', () => ({
  apiClient: {
    post: mocks.post,
    put: mocks.put,
    delete: vi.fn(),
  },
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));

vi.mock('@/contexts/TenantContext', () => ({
  useTenant: () => ({ currentTenant: { id: 'tenant-1' } }),
}));

describe('native push subscription API contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.addListener.mockResolvedValue({ remove: vi.fn() });
    mocks.post.mockResolvedValue({ data: {} });
  });

  it('uses POST /push-subscriptions/upsert/ with the registered device token', async () => {
    renderHook(() => useNativePushNotifications());

    await waitFor(() => {
      expect(mocks.addListener).toHaveBeenCalledWith(
        'registration',
        expect.any(Function),
      );
    });

    const registration = mocks.addListener.mock.calls.find(
      ([event]) => event === 'registration',
    )?.[1] as ((token: { value: string }) => Promise<void>) | undefined;

    expect(registration).toBeDefined();
    await act(async () => {
      await registration!({ value: 'test-fcm-token' });
    });

    expect(mocks.post).toHaveBeenCalledWith('/push-subscriptions/upsert/', {
      user_id: 'user-1',
      tenant_id: 'tenant-1',
      endpoint: 'test-fcm-token',
      auth: 'fcm',
      p256dh: 'test-fcm-token',
    });
    expect(mocks.put).not.toHaveBeenCalled();
  });
});
