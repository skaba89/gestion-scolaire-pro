import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/api/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTenant } from "@/contexts/TenantContext";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import {
  Bell,
  BookOpen,
  CreditCard,
  Calendar,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Settings,
  X,
  BellRing,
  Sparkles,
  Timer
} from "lucide-react";
import { format, formatDistanceToNow, isAfter, addDays, differenceInDays } from "date-fns";
import { fr } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { useTenantUrl } from "@/hooks/useTenantUrl";
import { useCurrency } from "@/hooks/useCurrency";

interface Reminder {
  id: string;
  type: "homework" | "payment" | "event" | "exam";
  title: string;
  description: string;
  dueDate: Date;
  isUrgent: boolean;
  urgencyLevel: "low" | "medium" | "high" | "critical";
  link?: string;
  metadata?: Record<string, any>;
  progress?: number;
}

interface ReminderPreferences {
  homeworkReminders: boolean;
  paymentReminders: boolean;
  eventReminders: boolean;
  daysBeforeHomework: number;
  daysBeforePayment: number;
  daysBeforeEvent: number;
  enablePushReminders: boolean;
}

const DEFAULT_PREFERENCES: ReminderPreferences = {
  homeworkReminders: true,
  paymentReminders: true,
  eventReminders: true,
  daysBeforeHomework: 2,
  daysBeforePayment: 7,
  daysBeforeEvent: 3,
  enablePushReminders: true,
};

export const ReminderSystem = () => {
  const { user } = useAuth();
  const { tenant } = useTenant();
  const { getTenantUrl } = useTenantUrl();
  const { currency } = useCurrency();
  const queryClient = useQueryClient();
  const [showSettings, setShowSettings] = useState(false);
  const [preferences, setPreferences] = useState<ReminderPreferences>(DEFAULT_PREFERENCES);
  const [dismissedReminders, setDismissedReminders] = useState<Set<string>>(new Set());

  // Load preferences from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(`reminder-prefs-${user?.id}`);
    if (saved) {
      try {
        setPreferences(JSON.parse(saved));
      } catch (e) {
        console.error("Error loading reminder preferences:", e);
      }
    }

    const dismissed = localStorage.getItem(`dismissed-reminders-${user?.id}`);
    if (dismissed) {
      try {
        setDismissedReminders(new Set(JSON.parse(dismissed)));
      } catch (e) {
        console.error("Error loading dismissed reminders:", e);
      }
    }
  }, [user?.id]);

  // Save preferences
  const savePreferences = (newPrefs: ReminderPreferences) => {
    setPreferences(newPrefs);
    localStorage.setItem(`reminder-prefs-${user?.id}`, JSON.stringify(newPrefs));
    toast.success("Préférences sauvegardées");
  };

  // Dismiss reminder
  const dismissReminder = (id: string) => {
    const newDismissed = new Set(dismissedReminders);
    newDismissed.add(id);
    setDismissedReminders(newDismissed);
    localStorage.setItem(`dismissed-reminders-${user?.id}`, JSON.stringify([...newDismissed]));
  };

  // Fetch upcoming homework (for students)
  const { data: homeworkData } = useQuery({
    queryKey: ["upcoming-homework", user?.id, tenant?.id],
    queryFn: async () => {
      if (!user?.id || !tenant?.id) return [];

      // Get student record
      const studentResponse = await apiClient.get("/students", {
        params: { user_id: user.id, tenant_id: tenant.id },
      });
      const student = studentResponse.data?.[0] || null;

      if (!student) return [];

      // Get student's enrollment
      const enrollmentResponse = await apiClient.get("/enrollments", {
        params: { student_id: student.id, status: "active" },
      });
      const enrollment = enrollmentResponse.data?.[0] || null;

      if (!enrollment) return [];

      // Get upcoming homework
      const homeworkResponse = await apiClient.get("/homework", {
        params: {
          class_id: enrollment.class_id,
          tenant_id: tenant.id,
          due_date__gte: new Date().toISOString().split("T")[0],
          ordering: "due_date",
        },
      });

      return homeworkResponse.data || [];
    },
    enabled: !!user?.id && !!tenant?.id && preferences.homeworkReminders,
  });

  // Fetch pending invoices (for parents)
  const { data: invoiceData } = useQuery({
    queryKey: ["pending-invoices", user?.id, tenant?.id],
    queryFn: async () => {
      if (!user?.id || !tenant?.id) return [];

      // Get parent's students
      const psResponse = await apiClient.get("/parent-students", {
        params: { parent_id: user.id },
      });
      const parentStudents = psResponse.data || [];

      if (!parentStudents.length) return [];

      const studentIds = parentStudents.map((ps: any) => ps.student_id);

      // Get pending invoices
      const invoicesResponse = await apiClient.get("/invoices", {
        params: {
          student_id__in: studentIds.join(","),
          tenant_id: tenant.id,
          status__in: "PENDING,OVERDUE",
          ordering: "due_date",
        },
      });

      return invoicesResponse.data || [];
    },
    enabled: !!user?.id && !!tenant?.id && preferences.paymentReminders,
  });

  // Fetch upcoming school events
  const { data: eventData } = useQuery({
    queryKey: ["upcoming-events", tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return [];

      const today = new Date().toISOString().split("T")[0];

      const eventsResponse = await apiClient.get("/school-events", {
        params: {
          tenant_id: tenant.id,
          start_date__gte: today,
          ordering: "start_date",
          limit: 10,
        },
      });

      return eventsResponse.data || [];
    },
    enabled: !!tenant?.id && preferences.eventReminders,
  });

  // Build reminders list
  const reminders: Reminder[] = [];

  const getUrgencyLevel = (daysUntilDue: number): Reminder["urgencyLevel"] => {
    if (daysUntilDue < 0) return "critical";
    if (daysUntilDue <= 1) return "high";
    if (daysUntilDue <= 3) return "medium";
    return "low";
  };

  // Add homework reminders
  if (preferences.homeworkReminders && homeworkData) {
    homeworkData.forEach((hw: any) => {
      const dueDate = new Date(hw.due_date);
      const daysUntilDue = Math.ceil((dueDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));

      if (daysUntilDue <= preferences.daysBeforeHomework) {
        reminders.push({
          id: `homework-${hw.id}`,
          type: "homework",
          title: hw.title,
          description: `${hw.subjects?.name || "Devoir"} - À rendre`,
          dueDate,
          isUrgent: daysUntilDue <= 1,
          urgencyLevel: getUrgencyLevel(daysUntilDue),
          link: getTenantUrl("/student/homework"),
          metadata: hw,
        });
      }
    });
  }

  // Add payment reminders
  if (preferences.paymentReminders && invoiceData) {
    invoiceData.forEach((inv: any) => {
      const dueDate = new Date(inv.due_date);
      const daysUntilDue = Math.ceil((dueDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      const isOverdue = daysUntilDue < 0;

      if (daysUntilDue <= preferences.daysBeforePayment || isOverdue) {
        reminders.push({
          id: `invoice-${inv.id}`,
          type: "payment",
          title: `Facture ${inv.invoice_number}`,
          description: `${inv.students?.first_name} ${inv.students?.last_name} - ${inv.amount} ${currency.symbol}`,
          dueDate,
          isUrgent: isOverdue || daysUntilDue <= 3,
          urgencyLevel: getUrgencyLevel(daysUntilDue),
          link: getTenantUrl("/parent/invoices"),
          metadata: inv,
        });
      }
    });
  }

  // Add event reminders
  if (preferences.eventReminders && eventData) {
    eventData.forEach((event: any) => {
      const eventDate = new Date(event.start_date);
      const daysUntilEvent = Math.ceil((eventDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));

      if (daysUntilEvent <= preferences.daysBeforeEvent) {
        reminders.push({
          id: `event-${event.id}`,
          type: "event",
          title: event.title,
          description: event.location || event.event_type || "Événement",
          dueDate: eventDate,
          isUrgent: daysUntilEvent <= 1,
          urgencyLevel: getUrgencyLevel(daysUntilEvent),
          metadata: event,
        });
      }
    });
  }

  // Filter out dismissed reminders and sort
  const activeReminders = reminders
    .filter((r) => !dismissedReminders.has(r.id))
    .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());

  const urgentReminders = activeReminders.filter((r) => r.isUrgent);
  const upcomingReminders = activeReminders.filter((r) => !r.isUrgent);

  const getIcon = (type: Reminder["type"]) => {
    switch (type) {
      case "homework":
        return <BookOpen className="w-4 h-4" />;
      case "payment":
        return <CreditCard className="w-4 h-4" />;
      case "event":
        return <Calendar className="w-4 h-4" />;
    }
  };

  const getTypeColor = (type: Reminder["type"], isUrgent: boolean) => {
    if (isUrgent) return "text-destructive bg-destructive/10 border-destructive/20";
    switch (type) {
      case "homework":
        return "text-blue-600 bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800";
      case "payment":
        return "text-amber-600 bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800";
      case "event":
        return "text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800";
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Bell className="w-5 h-5" />
          Rappels
          {activeReminders.length > 0 && (
            <Badge variant="secondary">{activeReminders.length}</Badge>
          )}
        </CardTitle>
        <Button variant="ghost" size="icon" onClick={() => setShowSettings(!showSettings)}>
          <Settings className="w-4 h-4" />
        </Button>
      </CardHeader>

      <CardContent>
        {showSettings ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label htmlFor="homework-reminders" className="flex items-center gap-2">
                <BookOpen className="w-4 h-4" />
                Rappels de devoirs
              </Label>
              <Switch
                id="homework-reminders"
                checked={preferences.homeworkReminders}
                onCheckedChange={(checked) =>
                  savePreferences({ ...preferences, homeworkReminders: checked })
                }
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="payment-reminders" className="flex items-center gap-2">
                <CreditCard className="w-4 h-4" />
                Rappels de paiement
              </Label>
              <Switch
                id="payment-reminders"
                checked={preferences.paymentReminders}
                onCheckedChange={(checked) =>
                  savePreferences({ ...preferences, paymentReminders: checked })
                }
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="event-reminders" className="flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                Rappels d'événements
              </Label>
              <Switch
                id="event-reminders"
                checked={preferences.eventReminders}
                onCheckedChange={(checked) =>
                  savePreferences({ ...preferences, eventReminders: checked })
                }
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              className="w-full mt-2"
              onClick={() => setShowSettings(false)}
            >
              Fermer les paramètres
            </Button>
          </div>
        ) : activeReminders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <CheckCircle2 className="w-10 h-10 text-success/50 mb-2" />
            <p className="text-sm text-muted-foreground">Aucun rappel pour le moment</p>
            <p className="text-xs text-muted-foreground mt-1">Tout est à jour !</p>
          </div>
        ) : (
          <ScrollArea className="h-[300px] pr-4">
            {urgentReminders.length > 0 && (
              <div className="mb-4">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className="w-4 h-4 text-destructive" />
                  <span className="text-sm font-semibold text-destructive">Urgent</span>
                </div>
                <div className="space-y-2">
                  {urgentReminders.map((reminder) => (
                    <ReminderItem
                      key={reminder.id}
                      reminder={reminder}
                      getIcon={getIcon}
                      getTypeColor={getTypeColor}
                      onDismiss={dismissReminder}
                    />
                  ))}
                </div>
              </div>
            )}

            {upcomingReminders.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Clock className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm font-semibold text-muted-foreground">À venir</span>
                </div>
                <div className="space-y-2">
                  {upcomingReminders.map((reminder) => (
                    <ReminderItem
                      key={reminder.id}
                      reminder={reminder}
                      getIcon={getIcon}
                      getTypeColor={getTypeColor}
                      onDismiss={dismissReminder}
                    />
                  ))}
                </div>
              </div>
            )}
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
};

interface ReminderItemProps {
  reminder: Reminder;
  getIcon: (type: Reminder["type"]) => React.ReactNode;
  getTypeColor: (type: Reminder["type"], isUrgent: boolean) => string;
  onDismiss: (id: string) => void;
}

const ReminderItem = ({ reminder, getIcon, getTypeColor, onDismiss }: ReminderItemProps) => {
  const handleClick = () => {
    if (reminder.link) {
      window.location.href = reminder.link;
    }
  };

  return (
    <div
      className={cn(
        "p-3 rounded-lg border cursor-pointer transition-all hover:shadow-md group relative",
        getTypeColor(reminder.type, reminder.isUrgent)
      )}
      onClick={handleClick}
    >
      <Button
        variant="ghost"
        size="icon"
        className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={(e) => {
          e.stopPropagation();
          onDismiss(reminder.id);
        }}
      >
        <X className="w-3 h-3" />
      </Button>
      <div className="flex items-start gap-3">
        <div className="mt-0.5">{getIcon(reminder.type)}</div>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm truncate pr-6">{reminder.title}</p>
          <p className="text-xs opacity-75 truncate">{reminder.description}</p>
          <p className="text-xs mt-1 opacity-75">
            {formatDistanceToNow(reminder.dueDate, { addSuffix: true, locale: fr })}
          </p>
        </div>
      </div>
    </div>
  );
};
