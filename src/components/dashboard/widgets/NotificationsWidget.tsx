import React from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Bell, 
  AlertTriangle, 
  Info, 
  CheckCircle2,
  X
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface Notification {
  id: string;
  type: 'info' | 'warning' | 'success';
  title: string;
  message: string;
  unread: boolean;
}

const mockNotifications: Notification[] = [
  {
    id: '1',
    type: 'warning',
    title: 'Factures impayées',
    message: '12 factures en attente de paiement',
    unread: true
  },
  {
    id: '2',
    type: 'info',
    title: 'Nouvelle inscription',
    message: 'Demande d\'inscription en attente',
    unread: true
  },
  {
    id: '3',
    type: 'success',
    title: 'Sauvegarde terminée',
    message: 'Données exportées avec succès',
    unread: false
  },
];

const getNotificationIcon = (type: Notification['type']) => {
  switch (type) {
    case 'warning':
      return <AlertTriangle className="h-4 w-4 text-amber-500" />;
    case 'info':
      return <Info className="h-4 w-4 text-blue-500" />;
    case 'success':
      return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
  }
};

const getNotificationColor = (type: Notification['type']) => {
  switch (type) {
    case 'warning':
      return 'border-l-amber-500';
    case 'info':
      return 'border-l-blue-500';
    case 'success':
      return 'border-l-emerald-500';
  }
};

export const NotificationsWidget: React.FC = () => {
  return (
    <div className="space-y-2 h-full overflow-auto">
      {mockNotifications.map((notification, index) => (
        <motion.div
          key={notification.id}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: index * 0.1 }}
          className={cn(
            "relative p-3 rounded-lg bg-muted/50 border-l-4 transition-all hover:bg-muted",
            getNotificationColor(notification.type)
          )}
        >
          <div className="flex items-start gap-3">
            <div className="mt-0.5">
              {getNotificationIcon(notification.type)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium">{notification.title}</p>
                {notification.unread && (
                  <Badge variant="default" className="h-4 text-[10px] px-1">
                    Nouveau
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {notification.message}
              </p>
            </div>
            <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0">
              <X className="h-3 w-3" />
            </Button>
          </div>
        </motion.div>
      ))}
      
      <Button variant="ghost" className="w-full text-sm" size="sm">
        Voir toutes les notifications
      </Button>
    </div>
  );
};
