import { useEffect, useState, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { StatusBar, Style } from '@capacitor/status-bar';
import { Keyboard } from '@capacitor/keyboard';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { SplashScreen } from '@capacitor/splash-screen';

export interface NativeAppState {
  isNative: boolean;
  platform: 'ios' | 'android' | 'web';
  isKeyboardVisible: boolean;
  keyboardHeight: number;
}

export const useNativeApp = () => {
  const [state, setState] = useState<NativeAppState>({
    isNative: Capacitor.isNativePlatform(),
    platform: Capacitor.getPlatform() as 'ios' | 'android' | 'web',
    isKeyboardVisible: false,
    keyboardHeight: 0
  });

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    // Hide splash screen after app is ready
    SplashScreen.hide();

    // Set up status bar
    const setupStatusBar = async () => {
      try {
        await StatusBar.setStyle({ style: Style.Dark });
        if (Capacitor.getPlatform() === 'android') {
          await StatusBar.setBackgroundColor({ color: '#1a1a2e' });
        }
      } catch (error) {
        console.warn('StatusBar not available:', error);
      }
    };

    setupStatusBar();

    // Handle keyboard events
    const showListener = Keyboard.addListener('keyboardWillShow', (info) => {
      setState(prev => ({
        ...prev,
        isKeyboardVisible: true,
        keyboardHeight: info.keyboardHeight
      }));
    });

    const hideListener = Keyboard.addListener('keyboardWillHide', () => {
      setState(prev => ({
        ...prev,
        isKeyboardVisible: false,
        keyboardHeight: 0
      }));
    });

    // Handle app state changes
    const stateListener = App.addListener('appStateChange', () => {
      // App state changed (active/inactive)
    });

    // Handle back button on Android
    const backListener = App.addListener('backButton', ({ canGoBack }) => {
      if (!canGoBack) {
        App.exitApp();
      } else {
        window.history.back();
      }
    });

    return () => {
      showListener.then(l => l.remove());
      hideListener.then(l => l.remove());
      stateListener.then(l => l.remove());
      backListener.then(l => l.remove());
    };
  }, []);

  // Haptic feedback functions
  const hapticImpact = useCallback(async (style: 'light' | 'medium' | 'heavy' = 'medium') => {
    if (!Capacitor.isNativePlatform()) return;
    
    const styleMap = {
      light: ImpactStyle.Light,
      medium: ImpactStyle.Medium,
      heavy: ImpactStyle.Heavy
    };
    
    try {
      await Haptics.impact({ style: styleMap[style] });
    } catch (error) {
      console.warn('Haptics not available:', error);
    }
  }, []);

  const hapticNotification = useCallback(async (type: 'success' | 'warning' | 'error' = 'success') => {
    if (!Capacitor.isNativePlatform()) return;
    
    const typeMap = {
      success: NotificationType.Success,
      warning: NotificationType.Warning,
      error: NotificationType.Error
    };
    
    try {
      await Haptics.notification({ type: typeMap[type] });
    } catch (error) {
      console.warn('Haptics not available:', error);
    }
  }, []);

  const hapticVibrate = useCallback(async () => {
    if (!Capacitor.isNativePlatform()) return;
    
    try {
      await Haptics.vibrate();
    } catch (error) {
      console.warn('Haptics not available:', error);
    }
  }, []);

  // Hide keyboard
  const hideKeyboard = useCallback(async () => {
    if (!Capacitor.isNativePlatform()) return;
    
    try {
      await Keyboard.hide();
    } catch (error) {
      console.warn('Keyboard not available:', error);
    }
  }, []);

  return {
    ...state,
    hapticImpact,
    hapticNotification,
    hapticVibrate,
    hideKeyboard
  };
};
