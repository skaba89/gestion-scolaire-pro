import React, { ReactNode } from 'react';
import { Capacitor } from '@capacitor/core';
import { cn } from '@/lib/utils';

interface SafeAreaWrapperProps {
  children: ReactNode;
  className?: string;
  top?: boolean;
  bottom?: boolean;
  left?: boolean;
  right?: boolean;
}

export const SafeAreaWrapper: React.FC<SafeAreaWrapperProps> = ({
  children,
  className,
  top = true,
  bottom = true,
  left = true,
  right = true
}) => {
  const isNative = Capacitor.isNativePlatform();

  if (!isNative) {
    return <div className={className}>{children}</div>;
  }

  return (
    <div
      className={cn(
        'safe-area-wrapper',
        top && 'pt-safe-top',
        bottom && 'pb-safe-bottom',
        left && 'pl-safe-left',
        right && 'pr-safe-right',
        className
      )}
      style={{
        paddingTop: top ? 'env(safe-area-inset-top)' : undefined,
        paddingBottom: bottom ? 'env(safe-area-inset-bottom)' : undefined,
        paddingLeft: left ? 'env(safe-area-inset-left)' : undefined,
        paddingRight: right ? 'env(safe-area-inset-right)' : undefined
      }}
    >
      {children}
    </div>
  );
};
