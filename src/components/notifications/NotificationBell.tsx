import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/api/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Bell, Check, MessageSquare, FileText, AlertCircle, Calendar, CheckCircle2, Trash2, Settings, Volume2, VolumeX, Filter } from "lucide-react";
import { formatDistanceToNow, isToday, isYesterday, isThisWeek } from "date-fns";
import { fr } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

interface Notification {
  id: string;
  title: string;
  message: string | null;
  type: string | null;
  is_read: boolean;
  link: string | null;
  created_at: string;
}

const getNotificationIcon = (type: string | null) => {
  switch (type) {
    case "grade":
      return <FileText className="w-4 h-4" />;
    case "message":
      return <MessageSquare className="w-4 h-4" />;
    case "event":
      return <Calendar className="w-4 h-4" />;
    case "alert":
      return <AlertCircle className="w-4 h-4" />;
    default:
      return <Bell className="w-4 h-4" />;
  }
};

const getNotificationColor = (type: string | null) => {
  switch (type) {
    case "grade":
      return "bg-success/10 text-success";
    case "message":
      return "bg-info/10 text-info";
    case "event":
      return "bg-primary/10 text-primary";
    case "alert":
      return "bg-warning/10 text-warning";
    default:
      return "bg-muted text-muted-foreground";
  }
};

const groupNotificationsByDate = (notifications: Notification[]) => {
  const groups: { [key: string]: Notification[] } = {
    today: [],
    yesterday: [],
    thisWeek: [],
    older: [],
  };

  notifications.forEach((notification) => {
    const date = new Date(notification.created_at);
    if (isToday(date)) {
      groups.today.push(notification);
    } else if (isYesterday(date)) {
      groups.yesterday.push(notification);
    } else if (isThisWeek(date)) {
      groups.thisWeek.push(notification);
    } else {
      groups.older.push(notification);
    }
  });

  return groups;
};

export const NotificationBell = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("all");
  const [soundEnabled, setSoundEnabled] = useState(() => {
    return localStorage.getItem("notification_sound") !== "false";
  });
  const [showSettings, setShowSettings] = useState(false);

  const { data: notifications = [] } = useQuery({
    queryKey: ["notifications", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const response = await apiClient.get('/notifications/', {
        params: { limit: 50 }
      });
      return response.data as Notification[];
    },
    enabled: !!user?.id,
    refetchInterval: 60000, // Reduced polling interval to avoid spam
  });

  const markAsReadMutation = useMutation({
    mutationFn: async (notificationId: string) => {
      await apiClient.patch(`/notifications/${notificationId}`, { is_read: true });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  const markAllAsReadMutation = useMutation({
    mutationFn: async () => {
      if (!user?.id) return;
      await apiClient.post('/notifications/mark-all-read');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      toast.success("Toutes les notifications marquées comme lues");
    },
  });

  const deleteNotificationMutation = useMutation({
    mutationFn: async (notificationId: string) => {
      await apiClient.delete(`/notifications/${notificationId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      toast.success("Notification supprimée");
    },
  });

  const deleteAllReadMutation = useMutation({
    mutationFn: async () => {
      if (!user?.id) return;
      await apiClient.delete('/notifications/clear-read');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      toast.success("Notifications lues supprimées");
    },
  });

  const toggleSound = () => {
    const newValue = !soundEnabled;
    setSoundEnabled(newValue);
    localStorage.setItem("notification_sound", String(newValue));
    toast.success(newValue ? "Son activé" : "Son désactivé");
  };

  const filteredNotifications = notifications.filter((n) => {
    if (activeTab === "all") return true;
    if (activeTab === "unread") return !n.is_read;
    return n.type === activeTab;
  });

  const groupedNotifications = groupNotificationsByDate(filteredNotifications);
  const unreadCount = notifications.filter((n) => !n.is_read).length;

  const handleNotificationClick = (notification: Notification) => {
    if (!notification.is_read) {
      markAsReadMutation.mutate(notification.id);
    }
    if (notification.link) {
      window.location.href = notification.link;
    }
    setIsOpen(false);
  };

  const renderNotificationGroup = (title: string, items: Notification[]) => {
    if (items.length === 0) return null;
    return (
      <div key={title}>
        <div className="px-4 py-2 text-xs font-medium text-muted-foreground bg-muted/50 sticky top-0">
          {title}
        </div>
        {items.map((notification) => (
          <div
            key={notification.id}
            className={cn(
              "relative group",
              !notification.is_read && "bg-primary/5"
            )}
          >
            <button
              onClick={() => handleNotificationClick(notification)}
              className="w-full text-left p-4 hover:bg-muted/50 transition-colors"
            >
              <div className="flex gap-3">
                <div className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0",
                  getNotificationColor(notification.type)
                )}>
                  {getNotificationIcon(notification.type)}
                </div>
                <div className="flex-1 min-w-0 pr-8">
                  <div className="flex items-start justify-between gap-2">
                    <p className={cn(
                      "text-sm line-clamp-1",
                      !notification.is_read && "font-semibold"
                    )}>
                      {notification.title}
                    </p>
                    {!notification.is_read && (
                      <div className="w-2 h-2 rounded-full bg-primary flex-shrink-0 mt-1.5" />
                    )}
                  </div>
                  {notification.message && (
                    <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                      {notification.message}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">
                    {formatDistanceToNow(new Date(notification.created_at), {
                      addSuffix: true,
                      locale: fr,
                    })}
                  </p>
                </div>
              </div>
            </button>
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-2 right-2 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={(e) => {
                e.stopPropagation();
                deleteNotificationMutation.mutate(notification.id);
              }}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        ))}
      </div>
    );
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="w-5 h-5" />
          {unreadCount > 0 && (
            <Badge
              className="absolute -top-1 -right-1 w-5 h-5 p-0 flex items-center justify-center text-xs"
              variant="destructive"
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-96 p-0" align="end">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h4 className="font-semibold">Notifications</h4>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={toggleSound}
              title={soundEnabled ? "Désactiver le son" : "Activer le son"}
            >
              {soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setShowSettings(!showSettings)}
            >
              <Settings className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {showSettings ? (
          <div className="p-4 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm">Son de notification</span>
              <Switch checked={soundEnabled} onCheckedChange={toggleSound} />
            </div>
            <div className="pt-2 border-t space-y-2">
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => markAllAsReadMutation.mutate()}
                disabled={markAllAsReadMutation.isPending || unreadCount === 0}
              >
                <CheckCircle2 className="w-4 h-4 mr-2" />
                Tout marquer comme lu
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="w-full text-destructive hover:text-destructive"
                onClick={() => deleteAllReadMutation.mutate()}
                disabled={deleteAllReadMutation.isPending}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Supprimer les notifications lues
              </Button>
            </div>
          </div>
        ) : (
          <>
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="w-full rounded-none border-b bg-transparent p-0 h-auto">
                <TabsTrigger
                  value="all"
                  className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent py-2"
                >
                  Tout
                </TabsTrigger>
                <TabsTrigger
                  value="unread"
                  className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent py-2"
                >
                  Non lues
                  {unreadCount > 0 && (
                    <Badge variant="secondary" className="ml-1 h-5 px-1.5">
                      {unreadCount}
                    </Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger
                  value="grade"
                  className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent py-2"
                >
                  Notes
                </TabsTrigger>
                <TabsTrigger
                  value="message"
                  className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent py-2"
                >
                  Messages
                </TabsTrigger>
              </TabsList>
            </Tabs>

            <ScrollArea className="h-80">
              {filteredNotifications.length > 0 ? (
                <div className="divide-y divide-border">
                  {renderNotificationGroup("Aujourd'hui", groupedNotifications.today)}
                  {renderNotificationGroup("Hier", groupedNotifications.yesterday)}
                  {renderNotificationGroup("Cette semaine", groupedNotifications.thisWeek)}
                  {renderNotificationGroup("Plus ancien", groupedNotifications.older)}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full py-8 text-center">
                  <Bell className="w-10 h-10 text-muted-foreground/50 mb-2" />
                  <p className="text-sm text-muted-foreground">
                    {activeTab === "unread" ? "Aucune notification non lue" : "Aucune notification"}
                  </p>
                </div>
              )}
            </ScrollArea>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
};
