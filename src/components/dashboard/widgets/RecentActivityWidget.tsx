import React from 'react';
import { motion } from 'framer-motion';
import { 
  UserPlus, 
  FileText, 
  CheckCircle, 
  AlertCircle,
  Clock
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';

interface Activity {
  id: string;
  type: 'student_added' | 'grade_submitted' | 'attendance_marked' | 'alert';
  title: string;
  description: string;
  timestamp: Date;
}

const mockActivities: Activity[] = [
  {
    id: '1',
    type: 'student_added',
    title: 'Nouvel étudiant inscrit',
    description: 'Marie Dupont - Classe 3ème A',
    timestamp: new Date(Date.now() - 1000 * 60 * 15)
  },
  {
    id: '2',
    type: 'grade_submitted',
    title: 'Notes soumises',
    description: 'Mathématiques - 2nde B',
    timestamp: new Date(Date.now() - 1000 * 60 * 45)
  },
  {
    id: '3',
    type: 'attendance_marked',
    title: 'Présence enregistrée',
    description: '24/25 présents - 1ère C',
    timestamp: new Date(Date.now() - 1000 * 60 * 120)
  },
  {
    id: '4',
    type: 'alert',
    title: 'Alerte absences',
    description: '3 absences consécutives - Jean Martin',
    timestamp: new Date(Date.now() - 1000 * 60 * 180)
  },
];

const getActivityIcon = (type: Activity['type']) => {
  switch (type) {
    case 'student_added':
      return <UserPlus className="h-4 w-4 text-blue-500" />;
    case 'grade_submitted':
      return <FileText className="h-4 w-4 text-emerald-500" />;
    case 'attendance_marked':
      return <CheckCircle className="h-4 w-4 text-purple-500" />;
    case 'alert':
      return <AlertCircle className="h-4 w-4 text-amber-500" />;
  }
};

export const RecentActivityWidget: React.FC = () => {
  return (
    <div className="space-y-3 h-full overflow-auto">
      {mockActivities.map((activity, index) => (
        <motion.div
          key={activity.id}
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: index * 0.1 }}
          className="flex items-start gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors cursor-pointer"
        >
          <div className="mt-0.5 p-1.5 rounded-full bg-background">
            {getActivityIcon(activity.type)}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{activity.title}</p>
            <p className="text-xs text-muted-foreground truncate">{activity.description}</p>
          </div>
          <div className="flex items-center gap-1 text-xs text-muted-foreground whitespace-nowrap">
            <Clock className="h-3 w-3" />
            {formatDistanceToNow(activity.timestamp, { addSuffix: true, locale: fr })}
          </div>
        </motion.div>
      ))}
    </div>
  );
};
