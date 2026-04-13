import { useState, useEffect, useCallback } from "react";
import { apiClient } from "@/api/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTenant } from "@/contexts/TenantContext";
import { toast } from "sonner";

// Notification preference types
export interface NotificationPreferences {
  grades: boolean;
  absences: boolean;
  messages: boolean;
  homework: boolean;
  events: boolean;
  payments: boolean;
}

const DEFAULT_PREFERENCES: NotificationPreferences = {
  grades: true,
  absences: true,
  messages: true,
  homework: true,
  events: true,
  payments: true,
};

export const usePushNotifications = () => {
  const { user } = useAuth();
  const { tenant } = useTenant();
  const [isSupported, setIsSupported] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [preferences, setPreferences] = useState<NotificationPreferences>(DEFAULT_PREFERENCES);

  useEffect(() => {
    const supported = "Notification" in window && "serviceWorker" in navigator && "PushManager" in window;
    setIsSupported(supported);

    if (supported) {
      setPermission(Notification.permission);
    }

    // Load preferences from localStorage
    const savedPrefs = localStorage.getItem("notificationPreferences");
    if (savedPrefs) {
      try {
        setPreferences({ ...DEFAULT_PREFERENCES, ...JSON.parse(savedPrefs) });
      } catch {
        // Ignore parse errors
      }
    }

    setIsLoading(false);
  }, []);

  useEffect(() => {
    const checkSubscription = async () => {
      if (!user?.id || !isSupported) return;

      try {
        const response = await apiClient.get('/notifications/subscriptions/');
        setIsSubscribed(response.data.length > 0);
      } catch (error) {
        console.error("Error checking subscription:", error);
      }
    };

    checkSubscription();
  }, [user?.id, isSupported]);

  const requestPermission = useCallback(async () => {
    if (!isSupported) {
      toast.error("Les notifications ne sont pas supportées par votre navigateur");
      return false;
    }

    try {
      const result = await Notification.requestPermission();
      setPermission(result);

      if (result === "granted") {
        toast.success("Notifications activées");
        return true;
      } else if (result === "denied") {
        toast.error("Notifications refusées. Veuillez les activer dans les paramètres de votre navigateur.");
        return false;
      }
      return false;
    } catch (error) {
      console.error("Error requesting permission:", error);
      toast.error("Erreur lors de la demande de permission");
      return false;
    }
  }, [isSupported]);

  const subscribe = useCallback(async () => {
    if (!isSupported) {
      toast.error("Les notifications ne sont pas supportées");
      return false;
    }

    if (!user?.id) {
      toast.error("Veuillez vous connecter pour activer les notifications");
      return false;
    }

    try {
      // 1. Request permission first
      if (permission !== "granted") {
        const granted = await requestPermission();
        if (!granted) return false;
      }

      // 2. Get Service Worker registration
      const registration = await navigator.serviceWorker.ready;

      // 3. Define VAPID public key (from env or fallback to default for dev)
      const vapidPublicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY || "BL90rHSaRgLs4RKADdqEOHx55lY17HvgM-3jdUFNtxRGSGXIvIj5PiFIjDa7cTaTzFym3viLzP2J2_-Sv59w0iE";

      // 4. Subscribe to Push Manager
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: vapidPublicKey,
      });

      console.log("Push Subscription received:", subscription);

      const subJSON = subscription.toJSON();

      if (!subJSON.endpoint || !subJSON.keys?.p256dh || !subJSON.keys?.auth) {
        throw new Error("Invalid subscription format from browser");
      }

      // 5. Save to Sovereign API
      await apiClient.post('/notifications/subscriptions/', {
        endpoint: subJSON.endpoint,
        p256dh: subJSON.keys.p256dh,
        auth: subJSON.keys.auth,
        platform: "web",
        is_active: true,
      });

      setIsSubscribed(true);
      toast.success("Notifications push activées");
      return true;
    } catch (error: any) {
      console.error("Error subscribing:", error);

      if (error.name === 'NotAllowedError') {
        toast.error("Permission de notification refusée");
      } else {
        toast.error("Erreur lors de l'activation des notifications");
      }
      return false;
    }
  }, [user?.id, isSupported, permission, requestPermission]);

  const unsubscribe = useCallback(async () => {
    if (!user?.id) return false;

    try {
      // Get current subscription to get endpoint
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();

      if (subscription) {
        await apiClient.delete('/notifications/subscriptions/', {
          params: { endpoint: subscription.endpoint }
        });
        await subscription.unsubscribe();
      } else {
        // Fallback: delete all subscriptions for this user
        await apiClient.delete('/notifications/subscriptions/');
      }

      setIsSubscribed(false);
      toast.success("Notifications push désactivées");
      return true;
    } catch (error) {
      console.error("Error unsubscribing:", error);
      toast.error("Erreur lors de la désactivation");
      return false;
    }
  }, [user?.id]);

  const updatePreferences = useCallback((newPreferences: Partial<NotificationPreferences>) => {
    const updated = { ...preferences, ...newPreferences };
    setPreferences(updated);
    localStorage.setItem("notificationPreferences", JSON.stringify(updated));
  }, [preferences]);

  const showNotification = useCallback((
    title: string,
    options?: NotificationOptions & { type?: keyof NotificationPreferences }
  ) => {
    if (permission !== "granted") return;

    // Check if this notification type is enabled
    if (options?.type && !preferences[options.type]) {
      return;
    }

    try {
      new Notification(title, {
        icon: "/pwa-192x192.png",
        badge: "/pwa-192x192.png",
        requireInteraction: false,
        ...options,
      });
    } catch (error) {
      console.error("Error showing notification:", error);
    }
  }, [permission, preferences]);

  const sendTestNotification = useCallback(() => {
    if (permission !== "granted") {
      toast.error("Activez d'abord les notifications");
      return;
    }

    showNotification("Test de notification", {
      body: "Les notifications fonctionnent correctement ! 🎉",
      tag: "test-notification",
    });
  }, [permission, showNotification]);

  return {
    isSupported,
    isSubscribed,
    isLoading,
    permission,
    preferences,
    subscribe,
    unsubscribe,
    requestPermission,
    showNotification,
    updatePreferences,
    sendTestNotification,
  };
};
