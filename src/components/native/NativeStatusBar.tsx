import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';
import { useTheme } from '@/contexts/ThemeContext';

export const NativeStatusBar: React.FC = () => {
  const { theme } = useTheme();

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    const updateStatusBar = async () => {
      try {
        const isDark = theme === 'dark' || 
          (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);

        await StatusBar.setStyle({ 
          style: isDark ? Style.Dark : Style.Light 
        });

        if (Capacitor.getPlatform() === 'android') {
          await StatusBar.setBackgroundColor({ 
            color: isDark ? '#1a1a2e' : '#ffffff' 
          });
        }
      } catch (error) {
        console.warn('StatusBar update failed:', error);
      }
    };

    updateStatusBar();
  }, [theme]);

  return null;
};
