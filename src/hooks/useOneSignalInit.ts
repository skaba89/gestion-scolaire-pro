/**
 * useOneSignalInit — Initializes OneSignal Web Push for PWA/browser users.
 *
 * For native Capacitor apps, push notifications are handled by
 * useNativePushNotifications (Capacitor PushNotifications plugin).
 * This hook handles the web/PWA path.
 *
 * Setup:
 *  1. Set VITE_ONESIGNAL_APP_ID in your .env
 *  2. Configure the tenant's oneSignalAppId in the admin notification settings
 *  3. This hook auto-initializes on mount when running in a browser
 *
 * OneSignal Web SDK docs: https://documentation.onesignal.com/docs/web-push-quickstart
 */

import { useEffect, useRef } from "react";
import { Capacitor } from "@capacitor/core";
import { useAuth } from "@/contexts/AuthContext";

// OneSignal is loaded via CDN script tag (no npm package needed for web push)
declare global {
  interface Window {
    OneSignalDeferred?: Array<(onesignal: any) => void>;
    OneSignal?: any;
  }
}

const ONESIGNAL_APP_ID = import.meta.env.VITE_ONESIGNAL_APP_ID as string | undefined;
const ONESIGNAL_SDK_URL = "https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js";

function loadOneSignalScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.getElementById("onesignal-sdk")) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.id = "onesignal-sdk";
    script.src = ONESIGNAL_SDK_URL;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load OneSignal SDK"));
    document.head.appendChild(script);
  });
}

export const useOneSignalInit = () => {
  const { user } = useAuth();
  const initialized = useRef(false);

  useEffect(() => {
    // Skip on native Capacitor apps — handled by useNativePushNotifications
    if (Capacitor.isNativePlatform()) return;

    // Skip if no app ID configured
    if (!ONESIGNAL_APP_ID) return;

    // Skip if already initialized
    if (initialized.current) return;
    initialized.current = true;

    window.OneSignalDeferred = window.OneSignalDeferred || [];

    loadOneSignalScript()
      .then(() => {
        window.OneSignalDeferred!.push(async (OneSignal: any) => {
          try {
            await OneSignal.init({
              appId: ONESIGNAL_APP_ID,
              allowLocalhostAsSecureOrigin: import.meta.env.DEV,
              notifyButton: { enable: false }, // Use our own UI bell
              promptOptions: {
                slidedown: {
                  enabled: true,
                  autoPrompt: false, // We control when to prompt
                  timeDelay: 3,
                  pageViews: 1,
                  actionMessage:
                    "Recevez les alertes de votre école en temps réel (absences, notes, paiements).",
                  acceptButtonText: "Activer",
                  cancelButtonText: "Plus tard",
                },
              },
            });

            // Link this user's external ID so the server can target them by user ID
            if (user?.id) {
              await OneSignal.login(String(user.id));
            }
          } catch (err) {
            console.warn("[OneSignal] Init failed:", err);
          }
        });
      })
      .catch((err) => {
        console.warn("[OneSignal] SDK load failed:", err);
      });
  }, [user?.id]);

  /**
   * Call this to prompt the user for notification permission.
   * Attach to a "Enable notifications" button in the UI.
   */
  const promptForPermission = () => {
    if (Capacitor.isNativePlatform() || !ONESIGNAL_APP_ID) return;
    window.OneSignalDeferred?.push((OneSignal: any) => {
      OneSignal.Slidedown.promptPush();
    });
  };

  /**
   * Returns whether OneSignal push is enabled in this environment.
   */
  const isEnabled = !Capacitor.isNativePlatform() && Boolean(ONESIGNAL_APP_ID);

  return { promptForPermission, isEnabled };
};
