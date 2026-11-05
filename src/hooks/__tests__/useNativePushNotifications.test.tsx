// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useNativePushNotifications } from '../useNativePushNotifications';

const mocks = vi.hoisted(() => ({
  addListener: vi.fn(),
  remove: vi.fn(),
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
    mocks.addListener.mockResolvedValue({ remove: mocks.remove });
    mocks.post.mockResolvedValue({ data: {} });
  });

  it('uses POST /push-subscriptions/upsert/ with the registered device token', async () => {
    const { unmount } = renderHook(() => useNativePushNotifications());

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
      endpoint: 'test-fcm-token',
      auth: 'fcm',
      p256dh: 'test-fcm-token',
      platform: 'android',
    });
    expect(mocks.put).not.toHaveBeenCalled();
    unmount();
  });
  it('removes exactly the four listeners belonging to this hook on unmount', async () => {
    const { unmount } = renderHook(() => useNativePushNotifications());
    await waitFor(() => {
      expect(mocks.addListener).toHaveBeenCalledTimes(4);
    });
    unmount();
    await waitFor(() => {
      expect(mocks.remove).toHaveBeenCalledTimes(4);
    });
  });

  it('ignores stale registration callbacks after the hook unmounts', async () => {
    const { unmount } = renderHook(() => useNativePushNotifications());
    await waitFor(() => {
      expect(mocks.addListener).toHaveBeenCalledWith('registration', expect.any(Function));
    });
    const registration = mocks.addListener.mock.calls.find(
      ([event]) => event === 'registration',
    )?.[1] as ((token: { value: string }) => Promise<void>) | undefined;
    expect(registration).toBeDefined();
    unmount();
    await act(async () => {
      await registration!({ value: 'stale-fcm-token' });
    });
    expect(mocks.post).not.toHaveBeenCalled();
  });

});
