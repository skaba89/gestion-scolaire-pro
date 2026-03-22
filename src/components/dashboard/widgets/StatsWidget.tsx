import React from 'react';
import { motion } from 'framer-motion';
import { 
  Users, 
  GraduationCap, 
  BookOpen, 
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface StatItem {
  label: string;
  value: string | number;
  change?: number;
  icon: React.ReactNode;
  color: string;
}

interface StatsWidgetProps {
  stats?: StatItem[];
}

const defaultStats: StatItem[] = [
  { 
    label: 'Étudiants', 
    value: '1,247', 
    change: 12.5, 
    icon: <Users className="h-5 w-5" />,
    color: 'bg-blue-500/10 text-blue-500'
  },
  { 
    label: 'Enseignants', 
    value: '86', 
    change: 4.2, 
    icon: <GraduationCap className="h-5 w-5" />,
    color: 'bg-emerald-500/10 text-emerald-500'
  },
  { 
    label: 'Cours', 
    value: '324', 
    change: -2.1, 
    icon: <BookOpen className="h-5 w-5" />,
    color: 'bg-purple-500/10 text-purple-500'
  },
  { 
    label: 'Taux de réussite', 
    value: '94.2%', 
    change: 3.8, 
    icon: <TrendingUp className="h-5 w-5" />,
    color: 'bg-amber-500/10 text-amber-500'
  },
];

export const StatsWidget: React.FC<StatsWidgetProps> = ({ stats = defaultStats }) => {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 h-full">
      {stats.map((stat, index) => (
        <motion.div
          key={stat.label}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: index * 0.1 }}
          className="flex flex-col justify-between p-4 bg-gradient-to-br from-card to-muted/30 rounded-xl border hover:shadow-md transition-all duration-300 hover:-translate-y-0.5"
        >
          <div className="flex items-center justify-between">
            <div className={cn("p-2 rounded-lg", stat.color)}>
              {stat.icon}
            </div>
            {stat.change !== undefined && (
              <div className={cn(
                "flex items-center text-xs font-medium",
                stat.change >= 0 ? "text-emerald-500" : "text-red-500"
              )}>
                {stat.change >= 0 ? (
                  <ArrowUpRight className="h-3 w-3" />
                ) : (
                  <ArrowDownRight className="h-3 w-3" />
                )}
                {Math.abs(stat.change)}%
              </div>
            )}
          </div>
          <div className="mt-3">
            <p className="text-2xl font-bold">{stat.value}</p>
            <p className="text-sm text-muted-foreground">{stat.label}</p>
          </div>
        </motion.div>
      ))}
    </div>
  );
};
