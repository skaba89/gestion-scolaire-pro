import React, { useState } from 'react';
import { Calendar } from '@/components/ui/calendar';
import { Badge } from '@/components/ui/badge';
import { motion } from 'framer-motion';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

interface Event {
  date: Date;
  title: string;
  type: 'exam' | 'meeting' | 'holiday' | 'deadline';
}

const mockEvents: Event[] = [
  { date: new Date(), title: 'Conseil de classe', type: 'meeting' },
  { date: new Date(Date.now() + 86400000 * 2), title: 'Examen Math', type: 'exam' },
  { date: new Date(Date.now() + 86400000 * 5), title: 'Remise bulletins', type: 'deadline' },
];

const eventColors = {
  exam: 'bg-red-500',
  meeting: 'bg-blue-500',
  holiday: 'bg-green-500',
  deadline: 'bg-amber-500',
};

export const CalendarWidget: React.FC = () => {
  const [date, setDate] = useState<Date | undefined>(new Date());

  const selectedEvents = mockEvents.filter(
    event => date && format(event.date, 'yyyy-MM-dd') === format(date, 'yyyy-MM-dd')
  );

  return (
    <div className="flex flex-col h-full">
      <Calendar
        mode="single"
        selected={date}
        onSelect={setDate}
        locale={fr}
        className="rounded-md border-0 w-full"
        modifiers={{
          hasEvent: mockEvents.map(e => e.date)
        }}
        modifiersStyles={{
          hasEvent: { 
            fontWeight: 'bold',
            textDecoration: 'underline',
            textDecorationColor: 'hsl(var(--primary))'
          }
        }}
      />
      
      {selectedEvents.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-2 space-y-1"
        >
          {selectedEvents.map((event, index) => (
            <div key={index} className="flex items-center gap-2 p-2 bg-muted rounded-lg">
              <div className={`w-2 h-2 rounded-full ${eventColors[event.type]}`} />
              <span className="text-sm">{event.title}</span>
            </div>
          ))}
        </motion.div>
      )}
    </div>
  );
};
