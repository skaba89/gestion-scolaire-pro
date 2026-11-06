import { useEffect, useState, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
import { PushNotifications, Token, PushNotificationSchema, ActionPerformed } from '@capacitor/push-notifications';
import { apiClient } from '@/api/client';
import { useAuth } from '@/contexts/AuthContext';
import { useTenant } from '@/contexts/TenantContext';

// SECURITY: Prevent open redirect attacks by validating URLs before navigation
function isSafeRedirect(url: string): boolean {
  if (!url) return false;
  // Only allow relative URLs or same-origin URLs
  if (url.startsWith('/') && !url.startsWith('//')) return true;
  try {
    const parsed = new URL(url, window.location.origin);
    return parsed.origin === window.location.origin;
  } catch {
    return false;
  }
}

export interface NativePushState {
  isSupported: boolean;
  isRegistered: boolean;
  token: string | null;
  permissionStatus: 'granted' | 'denied' | 'prompt' | null;
}

export const useNativePushNotifications = () => {
  const { user } = useAuth();
  const { currentTenant } = useTenant();
  const [state, setState] = useState<NativePushState>({
    isSupported: Capacitor.isNativePlatform(),
    isRegistered: false,
    token: null,
    permissionStatus: null
  });

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    const checkPermissions = async () => {
      try {
        const result = await PushNotifications.checkPermissions();
        setState(prev => ({
          ...prev,
          permissionStatus: result.receive as 'granted' | 'denied' | 'prompt'
        }));
      } catch (error) {
        console.warn('Push notifications not available:', error);
      }
    };

    checkPermissions();
  }, []);

  const requestPermission = useCallback(async () => {
    if (!Capacitor.isNativePlatform()) return false;

    try {
      const result = await PushNotifications.requestPermissions();
      const granted = result.receive === 'granted';
      
      setState(prev => ({
        ...prev,
        permissionStatus: result.receive as 'granted' | 'denied' | 'prompt'
      }));

      if (granted) {
        await PushNotifications.register();
      }

      return granted;
    } catch (error) {
      console.error('Error requesting push permissions:', error);
      return false;
    }
  }, []);

  // Every render/session owns only the listeners it registered. Disposing
  // those handles prevents duplicate callbacks and stale-tenant API calls.
  const registerListeners = useCallback(async (isActive: () => boolean) => {
    if (!Capacitor.isNativePlatform()) return () => {};
    const handles: Array<{ remove: () => Promise<void> }> = [];
    const dispose = () => {
      void Promise.all(handles.map(handle => handle.remove())).catch(error => {
        console.warn('Unable to remove native push listener:', error);
      });
    };

    try {
      handles.push(await PushNotifications.addListener('registration', async (token: Token) => {
        if (!isActive()) return;
        setState(prev => ({ ...prev, isRegistered: true, token: token.value }));
        if (user?.id && currentTenant?.id) {
          try {
            const platform = Capacitor.getPlatform();
            const auth = platform === 'ios' ? 'apns' : 'fcm';
            await apiClient.post('/push-subscriptions/upsert/', {
              endpoint: token.value,
              auth,
              p256dh: token.value,
              platform,
            });
            if (!isActive()) return;
            try {
              await apiClient.post('/push-subscriptions/onesignal-link/', {
                user_id: user.id,
                tenant_id: currentTenant.id,
                fcm_token: token.value,
              });
            } catch {
              // Non-fatal: OneSignal linking is best-effort.
            }
          } catch (error) {
            console.error('Error saving push token:', error);
          }
        }
      }));

      handles.push(await PushNotifications.addListener('registrationError', (error) => {
        if (!isActive()) return;
        console.error('Push registration error:', error);
        setState(prev => ({ ...prev, isRegistered: false, token: null }));
      }));

      handles.push(await PushNotifications.addListener('pushNotificationReceived', (_notification: PushNotificationSchema) => {
        if (!isActive()) return;
        // Handle foreground notification.
      }));

      handles.push(await PushNotifications.addListener('pushNotificationActionPerformed', (notification: ActionPerformed) => {
        if (!isActive()) return;
        const data = notification.notification.data;
        if (data?.url) {
          if (isSafeRedirect(data.url)) {
            window.location.href = data.url;
          } else {
            console.warn('Blocked unsafe redirect:', data.url);
          }
        }
      }));
    } catch (error) {
      dispose();
      throw error;
    }
    return dispose;
  }, [user?.id, currentTenant?.id]);

  useEffect(() => {
    let active = true;
    let dispose: (() => void) | undefined;
    void registerListeners(() => active).then(cleanup => {
      if (active) dispose = cleanup;
      else cleanup(); // Async registrations may finish after unmount.
    }).catch(error => {
      console.warn('Unable to register native push listeners:', error);
    });
    return () => {
      active = false;
      dispose?.();
    };
  }, [registerListeners]);

  const unregister = useCallback(async () => {
    if (!Capacitor.isNativePlatform()) return;

    try {
      // Keep this hook's listeners active. Explicit unsubscribe removes the
      // device token from the backend, but the same mounted hook must be able
      // to register again after the user grants permission later.
      // Listener disposal remains owned by the effect cleanup on unmount.
      
      if (user?.id && state.token) {
        await apiClient.delete("/push-subscriptions/", {
          params: {
            endpoint: state.token,
          },
        });
      }

      setState(prev => ({
        ...prev,
        isRegistered: false,
        token: null
      }));
    } catch (error) {
      console.error('Error unregistering push notifications:', error);
    }
  }, [user?.id, state.token]);

  return {
    ...state,
    requestPermission,
    unregister
  };
};
