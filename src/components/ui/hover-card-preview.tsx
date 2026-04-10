import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { CalendarDays, Mail, Phone, User } from "lucide-react";
import { motion } from "framer-motion";
import { ReactNode } from "react";

interface UserPreviewProps {
  trigger: ReactNode;
  name: string;
  email?: string;
  phone?: string;
  role?: string;
  avatarUrl?: string;
  joinedDate?: string;
  additionalInfo?: { label: string; value: string }[];
}

export const UserHoverPreview = ({
  trigger,
  name,
  email,
  phone,
  role,
  avatarUrl,
  joinedDate,
  additionalInfo = []
}: UserPreviewProps) => {
  const initials = name
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <HoverCard openDelay={200} closeDelay={100}>
      <HoverCardTrigger asChild>
        <span className="cursor-pointer">{trigger}</span>
      </HoverCardTrigger>
      <HoverCardContent className="w-80 p-0 overflow-hidden" side="right" align="start">
        <motion.div
          initial={{ opacity: 0, y: 10, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
        >
          {/* Header with gradient */}
          <div className="h-16 bg-gradient-to-r from-primary/20 via-primary/10 to-transparent" />
          
          {/* Avatar overlapping header */}
          <div className="px-4 -mt-8">
            <Avatar className="h-16 w-16 border-4 border-background shadow-lg">
              <AvatarImage src={avatarUrl} alt={name} />
              <AvatarFallback className="bg-primary/10 text-primary text-lg font-semibold">
                {initials}
              </AvatarFallback>
            </Avatar>
          </div>

          {/* Content */}
          <div className="p-4 pt-2 space-y-3">
            <div>
              <h4 className="font-semibold text-foreground">{name}</h4>
              {role && (
                <Badge variant="secondary" className="mt-1 text-xs">
                  {role}
                </Badge>
              )}
            </div>

            <div className="space-y-2 text-sm">
              {email && (
                <motion.div 
                  className="flex items-center gap-2 text-muted-foreground"
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.1 }}
                >
                  <Mail className="h-4 w-4" />
                  <span className="truncate">{email}</span>
                </motion.div>
              )}
              
              {phone && (
                <motion.div 
                  className="flex items-center gap-2 text-muted-foreground"
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.15 }}
                >
                  <Phone className="h-4 w-4" />
                  <span>{phone}</span>
                </motion.div>
              )}

              {joinedDate && (
                <motion.div 
                  className="flex items-center gap-2 text-muted-foreground"
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.2 }}
                >
                  <CalendarDays className="h-4 w-4" />
                  <span>{joinedDate}</span>
                </motion.div>
              )}

              {additionalInfo.map((info, index) => (
                <motion.div 
                  key={info.label}
                  className="flex items-center gap-2 text-muted-foreground"
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.25 + index * 0.05 }}
                >
                  <User className="h-4 w-4" />
                  <span>{info.label}: <span className="text-foreground">{info.value}</span></span>
                </motion.div>
              ))}
            </div>
          </div>
        </motion.div>
      </HoverCardContent>
    </HoverCard>
  );
};

interface SimpleHoverPreviewProps {
  trigger: ReactNode;
  title: string;
  description?: string;
  stats?: { label: string; value: string | number }[];
}

export const SimpleHoverPreview = ({
  trigger,
  title,
  description,
  stats = []
}: SimpleHoverPreviewProps) => {
  return (
    <HoverCard openDelay={200} closeDelay={100}>
      <HoverCardTrigger asChild>
        <span className="cursor-pointer">{trigger}</span>
      </HoverCardTrigger>
      <HoverCardContent className="w-64" side="top">
        <motion.div
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.15 }}
          className="space-y-2"
        >
          <h4 className="font-semibold text-sm">{title}</h4>
          {description && (
            <p className="text-xs text-muted-foreground">{description}</p>
          )}
          {stats.length > 0 && (
            <div className="flex gap-4 pt-2 border-t">
              {stats.map((stat) => (
                <div key={stat.label} className="text-center">
                  <p className="text-lg font-bold text-primary">{stat.value}</p>
                  <p className="text-xs text-muted-foreground">{stat.label}</p>
                </div>
              ))}
            </div>
          )}
        </motion.div>
      </HoverCardContent>
    </HoverCard>
  );
};
