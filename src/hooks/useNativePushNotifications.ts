import { useEffect, useState, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
import { PushNotifications, Token, PushNotificationSchema, ActionPerformed } from '@capacitor/push-notifications';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useTenant } from '@/contexts/TenantContext';

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

      // Save token to database
      if (user?.id && currentTenant?.id) {
        try {
          // Use raw SQL through RPC or direct insert with type casting
          const platform = Capacitor.getPlatform();
          
          // First check if subscription exists
          const { data: existing } = await supabase
            .from('push_subscriptions')
            .select('id')
            .eq('user_id', user.id)
            .eq('endpoint', token.value)
            .maybeSingle();

          if (existing) {
            // Update existing subscription using any type to bypass strict typing
            await supabase
              .from('push_subscriptions')
              .update({ 
                auth: platform === 'ios' ? 'apns' : 'fcm',
                p256dh: token.value
              } as any)
              .eq('id', existing.id);
          } else {
            // Insert new subscription
            await supabase
              .from('push_subscriptions')
              .insert({
                user_id: user.id,
                tenant_id: currentTenant.id,
                endpoint: token.value,
                auth: platform === 'ios' ? 'apns' : 'fcm',
                p256dh: token.value
              } as any);
          }
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
        window.location.href = data.url;
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
        await supabase
          .from('push_subscriptions')
          .delete()
          .eq('user_id', user.id)
          .eq('endpoint', state.token);
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
