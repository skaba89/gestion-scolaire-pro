import { usePushNotifications, NotificationPreferences } from "@/hooks/usePushNotifications";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Bell, BellOff, Smartphone, AlertCircle, GraduationCap, MessageSquare, CalendarDays, CreditCard, ClipboardCheck } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

const NOTIFICATION_TYPES: { 
  key: keyof NotificationPreferences; 
  label: string; 
  description: string; 
  icon: React.ReactNode;
  color: string;
}[] = [
  { 
    key: "grades", 
    label: "Nouvelles notes", 
    description: "Quand une note est ajoutée",
    icon: <GraduationCap className="h-5 w-5" />,
    color: "text-blue-500 bg-blue-500/10"
  },
  { 
    key: "absences", 
    label: "Alertes d'absence", 
    description: "Quand une absence est enregistrée",
    icon: <ClipboardCheck className="h-5 w-5" />,
    color: "text-red-500 bg-red-500/10"
  },
  { 
    key: "messages", 
    label: "Messages", 
    description: "Quand vous recevez un message",
    icon: <MessageSquare className="h-5 w-5" />,
    color: "text-green-500 bg-green-500/10"
  },
  { 
    key: "homework", 
    label: "Devoirs", 
    description: "Rappels de dates limites",
    icon: <Smartphone className="h-5 w-5" />,
    color: "text-purple-500 bg-purple-500/10"
  },
  { 
    key: "events", 
    label: "Événements", 
    description: "Rappels d'événements scolaires",
    icon: <CalendarDays className="h-5 w-5" />,
    color: "text-orange-500 bg-orange-500/10"
  },
  { 
    key: "payments", 
    label: "Paiements", 
    description: "Rappels de factures et paiements",
    icon: <CreditCard className="h-5 w-5" />,
    color: "text-emerald-500 bg-emerald-500/10"
  },
];

export const PushNotificationSettings = () => {
  const {
    isSupported,
    isSubscribed,
    isLoading,
    permission,
    preferences,
    subscribe,
    unsubscribe,
    updatePreferences,
    sendTestNotification,
  } = usePushNotifications();

  const handleToggle = async (enabled: boolean) => {
    if (enabled) {
      await subscribe();
    } else {
      await unsubscribe();
    }
  };

  const handlePreferenceChange = (key: keyof NotificationPreferences, value: boolean) => {
    updatePreferences({ [key]: value });
  };

  if (!isSupported) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BellOff className="h-5 w-5" />
            Notifications Push
          </CardTitle>
          <CardDescription>
            Recevez des alertes instantanées sur votre appareil
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Les notifications push ne sont pas supportées par votre navigateur.
              Essayez avec Chrome, Firefox ou Edge.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="h-5 w-5" />
          Notifications Push
        </CardTitle>
        <CardDescription>
          Recevez des alertes instantanées sur votre appareil
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {permission === "denied" && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Les notifications sont bloquées. Veuillez les autoriser dans les paramètres de votre navigateur.
            </AlertDescription>
          </Alert>
        )}

        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label className="text-base">Activer les notifications</Label>
            <p className="text-sm text-muted-foreground">
              Recevez des alertes pour les nouvelles notes, absences et messages
            </p>
          </div>
          <Switch
            checked={isSubscribed}
            onCheckedChange={handleToggle}
            disabled={isLoading || permission === "denied"}
          />
        </div>

        <div className="border-t pt-4 space-y-4">
          <h4 className="font-medium">Types de notifications</h4>
          
          <div className="grid gap-4">
            {NOTIFICATION_TYPES.map((type) => (
              <div key={type.key} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center ${type.color}`}>
                    {type.icon}
                  </div>
                  <div>
                    <p className="font-medium">{type.label}</p>
                    <p className="text-sm text-muted-foreground">{type.description}</p>
                  </div>
                </div>
                <Switch 
                  checked={preferences[type.key]}
                  onCheckedChange={(checked) => handlePreferenceChange(type.key, checked)}
                  disabled={!isSubscribed} 
                />
              </div>
            ))}
          </div>
        </div>

        {isSubscribed && (
          <Button
            variant="outline"
            className="w-full"
            onClick={sendTestNotification}
          >
            Tester les notifications
          </Button>
        )}
      </CardContent>
    </Card>
  );
};
