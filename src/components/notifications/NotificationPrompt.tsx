import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Bell, X } from "lucide-react";
import { usePushNotifications } from "@/hooks/usePushNotifications";

interface NotificationPromptProps {
  onDismiss?: () => void;
}

export const NotificationPrompt = ({ onDismiss }: NotificationPromptProps) => {
  const [isVisible, setIsVisible] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);
  const { isSupported, permission, isSubscribed, subscribe, isLoading } = usePushNotifications();

  useEffect(() => {
    // Check if already dismissed
    const dismissed = localStorage.getItem("notificationPromptDismissed");
    if (dismissed) {
      setIsDismissed(true);
      return;
    }

    // Show prompt only if notifications are supported and not yet granted
    if (isSupported && permission === "default" && !isSubscribed) {
      // Delay showing the prompt for a better UX
      const timer = setTimeout(() => setIsVisible(true), 3000);
      return () => clearTimeout(timer);
    }
  }, [isSupported, permission, isSubscribed]);

  const handleEnable = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const result = await subscribe();
    if (result) {
      setIsVisible(false);
      setIsDismissed(true);
      localStorage.setItem("notificationPromptDismissed", "true");
    }
  };

  const handleDismiss = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsVisible(false);
    setIsDismissed(true);
    localStorage.setItem("notificationPromptDismissed", "true");
    onDismiss?.();
  };

  const handleLater = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsVisible(false);
    // Don't permanently dismiss, just hide for this session
    sessionStorage.setItem("notificationPromptLater", "true");
  };

  if (!isVisible || isDismissed || !isSupported || permission !== "default" || isSubscribed) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-sm animate-in slide-in-from-bottom-4 fade-in duration-300">
      <Card className="border-primary/20 shadow-lg">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <Bell className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-base">Rester informé</CardTitle>
                <CardDescription className="text-xs">
                  Ne manquez aucune information importante
                </CardDescription>
              </div>
            </div>
            <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={handleDismiss}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <p className="text-sm text-muted-foreground mb-4">
            Activez les notifications pour recevoir des alertes instantanées sur les nouvelles notes, absences et messages.
          </p>
          <div className="flex gap-2">
            <Button type="button" onClick={handleEnable} disabled={isLoading} className="flex-1">
              Activer
            </Button>
            <Button type="button" variant="outline" onClick={handleLater} className="flex-1">
              Plus tard
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
