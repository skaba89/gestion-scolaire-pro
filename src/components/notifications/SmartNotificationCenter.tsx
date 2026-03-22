import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { apiClient } from "@/api/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTenant } from "@/contexts/TenantContext";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Bell,
  BellRing,
  Check,
  CheckCheck,
  Trash2,
  Settings,
  BookOpen,
  CreditCard,
  Calendar,
  MessageSquare,
  GraduationCap,
  UserCheck,
  AlertTriangle,
  X,
  Filter
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";

interface Notification {
  id: string;
  title: string;
  message: string;
  type: string;
  is_read: boolean;
  created_at: string;
  data?: Record<string, any>;
}

const NOTIFICATION_ICONS: Record<string, React.ElementType> = {
  grade: GraduationCap,
  absence: UserCheck,
  message: MessageSquare,
  homework: BookOpen,
  payment: CreditCard,
  event: Calendar,
  alert: AlertTriangle,
  default: Bell
};

const NOTIFICATION_COLORS: Record<string, string> = {
  grade: "text-purple-500 bg-purple-500/10",
  absence: "text-orange-500 bg-orange-500/10",
  message: "text-blue-500 bg-blue-500/10",
  homework: "text-green-500 bg-green-500/10",
  payment: "text-amber-500 bg-amber-500/10",
  event: "text-pink-500 bg-pink-500/10",
  alert: "text-red-500 bg-red-500/10",
  default: "text-primary bg-primary/10"
};

export function SmartNotificationCenter() {
  const { user } = useAuth();
  const { tenant } = useTenant();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const {
    isSupported,
    isSubscribed,
    permission,
    preferences,
    subscribe,
    unsubscribe,
    updatePreferences,
    showNotification: showBrowserNotification
  } = usePushNotifications();

  const { data: notifications = [], isLoading } = useQuery({
    queryKey: ["smart-notifications", user?.id, tenant?.id],
    queryFn: async () => {
      const response = await apiClient.get("/notifications");
      return response.data;
    },
    enabled: !!user?.id && !!tenant?.id,
  });

  // Real-time notifications will be handled via polling or sovereign push in the future

  const markAsReadMutation = useMutation({
    mutationFn: async (notificationId: string) => {
      await apiClient.patch(`/notifications/${notificationId}`, { is_read: true });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["smart-notifications"] });
    },
  });

  const markAllAsReadMutation = useMutation({
    mutationFn: async () => {
      await apiClient.post("/notifications/mark-all-read");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["smart-notifications"] });
      toast.success("Toutes les notifications marquées comme lues");
    },
  });

  const deleteNotificationMutation = useMutation({
    mutationFn: async (notificationId: string) => {
      await apiClient.delete(`/notifications/${notificationId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["smart-notifications"] });
    },
  });

  const unreadCount = notifications.filter(n => !n.is_read).length;

  const filteredNotifications = activeFilter
    ? notifications.filter(n => n.type === activeFilter)
    : notifications;

  const unreadNotifications = filteredNotifications.filter(n => !n.is_read);
  const readNotifications = filteredNotifications.filter(n => n.is_read);

  const notificationTypes = [...new Set(notifications.map(n => n.type))];

  const getIcon = (type: string) => {
    const Icon = NOTIFICATION_ICONS[type] || NOTIFICATION_ICONS.default;
    return Icon;
  };

  const getColor = (type: string) => {
    return NOTIFICATION_COLORS[type] || NOTIFICATION_COLORS.default;
  };

  const NotificationItem = ({ notification }: { notification: Notification }) => {
    const Icon = getIcon(notification.type);
    const colorClass = getColor(notification.type);

    return (
      <motion.div
        layout
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, x: -100 }}
        className={cn(
          "flex items-start gap-3 p-3 rounded-lg transition-colors group cursor-pointer",
          notification.is_read
            ? "bg-background hover:bg-muted/50"
            : "bg-primary/5 hover:bg-primary/10"
        )}
        onClick={() => !notification.is_read && markAsReadMutation.mutate(notification.id)}
      >
        <div className={cn("p-2 rounded-lg flex-shrink-0", colorClass)}>
          <Icon className="w-4 h-4" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className={cn(
              "text-sm truncate",
              !notification.is_read && "font-semibold"
            )}>
              {notification.title}
            </p>
            {!notification.is_read && (
              <span className="w-2 h-2 rounded-full bg-primary flex-shrink-0" />
            )}
          </div>
          <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
            {notification.message}
          </p>
          <p className="text-xs text-muted-foreground/70 mt-1">
            {formatDistanceToNow(new Date(notification.created_at), {
              addSuffix: true,
              locale: fr
            })}
          </p>
        </div>

        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
          onClick={(e) => {
            e.stopPropagation();
            deleteNotificationMutation.mutate(notification.id);
          }}
        >
          <X className="w-4 h-4" />
        </Button>
      </motion.div>
    );
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          {unreadCount > 0 ? (
            <motion.div
              initial={{ scale: 0.5 }}
              animate={{ scale: 1 }}
              className="relative"
            >
              <BellRing className="w-5 h-5" />
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="absolute -top-1 -right-1 w-5 h-5 bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full flex items-center justify-center"
              >
                {unreadCount > 99 ? "99+" : unreadCount}
              </motion.span>
            </motion.div>
          ) : (
            <Bell className="w-5 h-5" />
          )}
        </Button>
      </SheetTrigger>

      <SheetContent className="w-full sm:max-w-md p-0 flex flex-col">
        <SheetHeader className="p-4 border-b">
          <div className="flex items-center justify-between">
            <SheetTitle className="flex items-center gap-2">
              <Bell className="w-5 h-5" />
              Notifications
              {unreadCount > 0 && (
                <Badge variant="destructive" className="ml-2">
                  {unreadCount}
                </Badge>
              )}
            </SheetTitle>
            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => markAllAsReadMutation.mutate()}
                  className="text-xs"
                >
                  <CheckCheck className="w-4 h-4 mr-1" />
                  Tout lire
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowSettings(!showSettings)}
              >
                <Settings className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </SheetHeader>

        {showSettings ? (
          <div className="p-4 space-y-6">
            <div className="space-y-4">
              <h3 className="font-medium">Notifications push</h3>

              {!isSupported ? (
                <p className="text-sm text-muted-foreground">
                  Les notifications push ne sont pas supportées par votre navigateur.
                </p>
              ) : permission === "denied" ? (
                <p className="text-sm text-destructive">
                  Les notifications sont bloquées. Activez-les dans les paramètres de votre navigateur.
                </p>
              ) : (
                <div className="flex items-center justify-between">
                  <Label htmlFor="push-toggle" className="flex items-center gap-2">
                    <BellRing className="w-4 h-4" />
                    Activer les notifications push
                  </Label>
                  <Switch
                    id="push-toggle"
                    checked={isSubscribed}
                    onCheckedChange={(checked) => checked ? subscribe() : unsubscribe()}
                  />
                </div>
              )}
            </div>

            <div className="space-y-4">
              <h3 className="font-medium">Préférences par type</h3>

              {[
                { key: "grades", label: "Notes", icon: GraduationCap },
                { key: "absences", label: "Absences", icon: UserCheck },
                { key: "messages", label: "Messages", icon: MessageSquare },
                { key: "homework", label: "Devoirs", icon: BookOpen },
                { key: "events", label: "Événements", icon: Calendar },
                { key: "payments", label: "Paiements", icon: CreditCard },
              ].map(({ key, label, icon: Icon }) => (
                <div key={key} className="flex items-center justify-between">
                  <Label htmlFor={`pref-${key}`} className="flex items-center gap-2">
                    <Icon className="w-4 h-4" />
                    {label}
                  </Label>
                  <Switch
                    id={`pref-${key}`}
                    checked={preferences[key as keyof typeof preferences]}
                    onCheckedChange={(checked) => updatePreferences({ [key]: checked })}
                  />
                </div>
              ))}
            </div>

            <Button
              variant="outline"
              className="w-full"
              onClick={() => setShowSettings(false)}
            >
              Retour aux notifications
            </Button>
          </div>
        ) : (
          <>
            {/* Filter chips */}
            {notificationTypes.length > 1 && (
              <div className="px-4 py-2 border-b flex gap-2 overflow-x-auto">
                <Button
                  variant={activeFilter === null ? "default" : "outline"}
                  size="sm"
                  className="flex-shrink-0"
                  onClick={() => setActiveFilter(null)}
                >
                  Tout
                </Button>
                {notificationTypes.map((type) => {
                  const Icon = getIcon(type);
                  return (
                    <Button
                      key={type}
                      variant={activeFilter === type ? "default" : "outline"}
                      size="sm"
                      className="flex-shrink-0 capitalize"
                      onClick={() => setActiveFilter(type)}
                    >
                      <Icon className="w-3 h-3 mr-1" />
                      {type}
                    </Button>
                  );
                })}
              </div>
            )}

            <ScrollArea className="flex-1">
              <Tabs defaultValue="unread" className="w-full">
                <TabsList className="w-full grid grid-cols-2 mx-4 mt-2" style={{ width: "calc(100% - 2rem)" }}>
                  <TabsTrigger value="unread" className="gap-1">
                    Non lues
                    {unreadNotifications.length > 0 && (
                      <Badge variant="secondary" className="ml-1">
                        {unreadNotifications.length}
                      </Badge>
                    )}
                  </TabsTrigger>
                  <TabsTrigger value="all">Toutes</TabsTrigger>
                </TabsList>

                <TabsContent value="unread" className="p-4 space-y-2 mt-0">
                  <AnimatePresence mode="popLayout">
                    {unreadNotifications.length === 0 ? (
                      <div className="text-center py-12">
                        <Check className="w-12 h-12 text-success/50 mx-auto mb-4" />
                        <p className="text-muted-foreground">Tout est à jour !</p>
                        <p className="text-xs text-muted-foreground/70">
                          Aucune notification non lue
                        </p>
                      </div>
                    ) : (
                      unreadNotifications.map((notif) => (
                        <NotificationItem key={notif.id} notification={notif} />
                      ))
                    )}
                  </AnimatePresence>
                </TabsContent>

                <TabsContent value="all" className="p-4 space-y-2 mt-0">
                  <AnimatePresence mode="popLayout">
                    {filteredNotifications.length === 0 ? (
                      <div className="text-center py-12">
                        <Bell className="w-12 h-12 text-muted-foreground/50 mx-auto mb-4" />
                        <p className="text-muted-foreground">Aucune notification</p>
                      </div>
                    ) : (
                      filteredNotifications.map((notif) => (
                        <NotificationItem key={notif.id} notification={notif} />
                      ))
                    )}
                  </AnimatePresence>
                </TabsContent>
              </Tabs>
            </ScrollArea>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}