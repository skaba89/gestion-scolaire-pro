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

  const registerListeners = useCallback(async () => {
    if (!Capacitor.isNativePlatform()) return;

    // On success, we should be able to receive notifications
    await PushNotifications.addListener('registration', async (token: Token) => {
      console.log('Push registration success, token:', token.value);
      setState(prev => ({
        ...prev,
        isRegistered: true,
        token: token.value
      }));

      // Save token to backend
      if (user?.id && currentTenant?.id) {
        try {
          const platform = Capacitor.getPlatform();
          const auth = platform === 'ios' ? 'apns' : 'fcm';

          // Use PUT (upsert) to create or update the subscription
          await apiClient.put("/push-subscriptions/upsert/", {
            user_id: user.id,
            tenant_id: currentTenant.id,
            endpoint: token.value,
            auth,
            p256dh: token.value,
          });
        } catch (error) {
          console.error('Error saving push token:', error);
        }
      }
    });

    await PushNotifications.addListener('registrationError', (error) => {
      console.error('Push registration error:', error);
      setState(prev => ({
        ...prev,
        isRegistered: false,
        token: null
      }));
    });

    await PushNotifications.addListener('pushNotificationReceived', (notification: PushNotificationSchema) => {
      console.log('Push notification received:', notification);
      // Handle foreground notification
    });

    await PushNotifications.addListener('pushNotificationActionPerformed', (notification: ActionPerformed) => {
      console.log('Push notification action performed:', notification);
      // Handle notification tap
      const data = notification.notification.data;
      if (data?.url) {
        if (isSafeRedirect(data.url)) {
          window.location.href = data.url;
        } else {
          console.warn('Blocked unsafe redirect:', data.url);
        }
      }
    });
  }, [user?.id, currentTenant?.id]);

  useEffect(() => {
    registerListeners();
  }, [registerListeners]);

  const unregister = useCallback(async () => {
    if (!Capacitor.isNativePlatform()) return;

    try {
      await PushNotifications.removeAllListeners();
      
      if (user?.id && state.token) {
        await apiClient.delete("/push-subscriptions/", {
          params: {
            user_id: user.id,
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
