import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Bell, CheckCircle2, Info, X } from 'lucide-react';

import { apiClient } from '@/api/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';

interface DashboardNotification {
  id: string;
  type: string | null;
  title: string;
  message: string | null;
  is_read: boolean;
}

type DisplayType = 'info' | 'warning' | 'success';

const getDisplayType = (type: string | null): DisplayType => {
  const normalizedType = type?.toLowerCase();

  if (normalizedType && ['alert', 'warning', 'absence', 'low_grade', 'error'].includes(normalizedType)) {
    return 'warning';
  }
  if (normalizedType && ['success', 'grade', 'payment'].includes(normalizedType)) {
    return 'success';
  }
  return 'info';
};

const getNotificationIcon = (type: DisplayType) => {
  switch (type) {
    case 'warning':
      return <AlertTriangle className="h-4 w-4 text-amber-500" />;
    case 'success':
      return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
    default:
      return <Info className="h-4 w-4 text-blue-500" />;
  }
};

const getNotificationColor = (type: DisplayType) => {
  switch (type) {
    case 'warning':
      return 'border-l-amber-500';
    case 'success':
      return 'border-l-emerald-500';
    default:
      return 'border-l-blue-500';
  }
};

export const NotificationsWidget = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  // Keep the limit in the key so this compact query cannot truncate the
  // 50-item cache used by NotificationBell.
  const queryKey = ['notifications', user?.id, { limit: 5 }];

  const {
    data: notifications = [],
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey,
    queryFn: async () => {
      const response = await apiClient.get<DashboardNotification[]>('/notifications/', {
        params: { limit: 5 },
      });
      return response.data;
    },
    enabled: Boolean(user?.id),
    refetchInterval: 60_000,
  });

  const deleteMutation = useMutation({
    mutationFn: async (notificationId: string) => {
      await apiClient.delete(`/notifications/${notificationId}/`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const markAllReadMutation = useMutation({
    mutationFn: async () => {
      await apiClient.post('/notifications/mark-all-read/');
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  if (isLoading) {
    return (
      <div className="space-y-3" aria-label="Chargement des notifications">
        {[0, 1, 2].map((item) => <Skeleton key={item} className="h-16 w-full" />)}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
        <AlertTriangle className="h-6 w-6 text-amber-500" />
        <p className="text-sm text-muted-foreground">Impossible de charger les notifications.</p>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          Réessayer
        </Button>
      </div>
    );
  }

  if (notifications.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-muted-foreground">
        <Bell className="h-7 w-7" />
        <p className="text-sm">Aucune notification pour le moment.</p>
      </div>
    );
  }

  const unreadCount = notifications.filter((notification) => !notification.is_read).length;

  return (
    <div className="flex h-full flex-col gap-2">
      <div className="flex-1 space-y-2 overflow-auto">
        {notifications.map((notification) => {
          const displayType = getDisplayType(notification.type);
          return (
            <div
              key={notification.id}
              className={cn(
                'relative rounded-lg border-l-4 bg-muted/50 p-3 transition-all hover:bg-muted',
                getNotificationColor(displayType),
              )}
            >
              <div className="flex items-start gap-3">
                <div className="mt-0.5">{getNotificationIcon(displayType)}</div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">{notification.title}</p>
                    {!notification.is_read && (
                      <Badge variant="default" className="h-4 px-1 text-[10px]">
                        Nouveau
                      </Badge>
                    )}
                  </div>
                  {notification.message && (
                    <p className="mt-0.5 text-xs text-muted-foreground">{notification.message}</p>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 shrink-0"
                  aria-label={`Supprimer la notification ${notification.title}`}
                  disabled={deleteMutation.isPending && deleteMutation.variables === notification.id}
                  onClick={() => deleteMutation.mutate(notification.id)}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      {unreadCount > 0 && (
        <Button
          variant="ghost"
          className="w-full text-sm"
          size="sm"
          disabled={markAllReadMutation.isPending}
          onClick={() => markAllReadMutation.mutate()}
        >
          Tout marquer comme lu ({unreadCount})
        </Button>
      )}
    </div>
  );
};
