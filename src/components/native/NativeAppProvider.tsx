import React, { createContext, useContext, ReactNode } from 'react';
import { useNativeApp } from '@/hooks/useNativeApp';
import { useNativePushNotifications } from '@/hooks/useNativePushNotifications';

interface NativeAppContextType {
  isNative: boolean;
  platform: 'ios' | 'android' | 'web';
  isKeyboardVisible: boolean;
  keyboardHeight: number;
  hapticImpact: (style?: 'light' | 'medium' | 'heavy') => Promise<void>;
  hapticNotification: (type?: 'success' | 'warning' | 'error') => Promise<void>;
  hapticVibrate: () => Promise<void>;
  hideKeyboard: () => Promise<void>;
  pushNotifications: {
    isSupported: boolean;
    isRegistered: boolean;
    token: string | null;
    permissionStatus: 'granted' | 'denied' | 'prompt' | null;
    requestPermission: () => Promise<boolean>;
    unregister: () => Promise<void>;
  };
}

const NativeAppContext = createContext<NativeAppContextType | null>(null);

export const useNativeAppContext = () => {
  const context = useContext(NativeAppContext);
  if (!context) {
    throw new Error('useNativeAppContext must be used within NativeAppProvider');
  }
  return context;
};

interface NativeAppProviderProps {
  children: ReactNode;
}

export const NativeAppProvider: React.FC<NativeAppProviderProps> = ({ children }) => {
  const nativeApp = useNativeApp();
  const pushNotifications = useNativePushNotifications();

  const value: NativeAppContextType = {
    isNative: nativeApp.isNative,
    platform: nativeApp.platform,
    isKeyboardVisible: nativeApp.isKeyboardVisible,
    keyboardHeight: nativeApp.keyboardHeight,
    hapticImpact: nativeApp.hapticImpact,
    hapticNotification: nativeApp.hapticNotification,
    hapticVibrate: nativeApp.hapticVibrate,
    hideKeyboard: nativeApp.hideKeyboard,
    pushNotifications: {
      isSupported: pushNotifications.isSupported,
      isRegistered: pushNotifications.isRegistered,
      token: pushNotifications.token,
      permissionStatus: pushNotifications.permissionStatus,
      requestPermission: pushNotifications.requestPermission,
      unregister: pushNotifications.unregister
    }
  };

  return (
    <NativeAppContext.Provider value={value}>
      {/* Add safe area styles for native apps */}
      <div 
        className={nativeApp.isNative ? 'native-app-container' : ''}
        style={{
          paddingBottom: nativeApp.isKeyboardVisible ? nativeApp.keyboardHeight : 0
        }}
      >
        {children}
      </div>
    </NativeAppContext.Provider>
  );
};
