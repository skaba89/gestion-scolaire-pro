import React from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import {
  UserPlus,
  FileText,
  Calendar,
  MessageSquare,
  ClipboardList,
  Bell,
  Settings,
  BarChart3
} from 'lucide-react';
import { useTenantNavigate } from '@/hooks/useTenantNavigate';

interface QuickAction {
  label: string;
  icon: React.ReactNode;
  path: string;
  color: string;
}

const quickActions: QuickAction[] = [
  { label: 'Nouvel étudiant', icon: <UserPlus className="h-4 w-4" />, path: '/admin/students', color: 'bg-blue-500 hover:bg-blue-600' },
  { label: 'Bulletin', icon: <FileText className="h-4 w-4" />, path: '/admin/report-cards', color: 'bg-emerald-500 hover:bg-emerald-600' },
  { label: 'Planning', icon: <Calendar className="h-4 w-4" />, path: '/admin/schedule', color: 'bg-purple-500 hover:bg-purple-600' },
  { label: 'Messages', icon: <MessageSquare className="h-4 w-4" />, path: '/admin/messages', color: 'bg-amber-500 hover:bg-amber-600' },
  { label: 'Notes', icon: <ClipboardList className="h-4 w-4" />, path: '/admin/grades', color: 'bg-rose-500 hover:bg-rose-600' },
  { label: 'Alertes', icon: <Bell className="h-4 w-4" />, path: '/admin/live-attendance', color: 'bg-cyan-500 hover:bg-cyan-600' },
  { label: 'Analytics', icon: <BarChart3 className="h-4 w-4" />, path: '/admin/analytics', color: 'bg-indigo-500 hover:bg-indigo-600' },
  { label: 'Paramètres', icon: <Settings className="h-4 w-4" />, path: '/admin/settings', color: 'bg-slate-500 hover:bg-slate-600' },
];

export const QuickActionsWidget: React.FC = () => {
  const navigate = useTenantNavigate();

  return (
    <div className="grid grid-cols-2 gap-2 h-full content-start">
      {quickActions.map((action, index) => (
        <motion.div
          key={action.label}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: index * 0.05 }}
        >
          <Button
            variant="ghost"
            className={`w-full justify-start gap-2 ${action.color} text-white shadow-sm`}
            onClick={() => navigate(action.path)}
          >
            {action.icon}
            <span className="text-xs">{action.label}</span>
          </Button>
        </motion.div>
      ))}
    </div>
  );
};
