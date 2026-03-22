import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Wand2, Loader2, AlertTriangle, Info, MapPin } from "lucide-react";
import { toast } from "sonner";

const DAYS = [
  { value: 1, label: "Lundi" },
  { value: 2, label: "Mardi" },
  { value: 3, label: "Mercredi" },
  { value: 4, label: "Jeudi" },
  { value: 5, label: "Vendredi" },
];

const TIME_SLOTS = [
  { start: "08:00", end: "09:00" },
  { start: "09:00", end: "10:00" },
  { start: "10:00", end: "11:00" },
  { start: "11:00", end: "12:00" },
  { start: "14:00", end: "15:00" },
  { start: "15:00", end: "16:00" },
  { start: "16:00", end: "17:00" },
];

interface GeneratorConfig {
  class_id: string;
  selectedDays: number[];
  hoursPerSubject: number;
  avoidConflicts: boolean;
  defaultRoomName: string;
}

export const ScheduleGenerator = ({
  selectedDept,
  selectedLevel,
  filteredClassrooms,
  onGenerated,
  onClassroomGenerated
}: {
  selectedDept?: string;
  selectedLevel?: string;
  filteredClassrooms?: any[];
  onGenerated: () => void;
  onClassroomGenerated?: (classroomId: string) => void;
}) => {
  const { tenant } = useTenant();
  const [open, setOpen] = useState(false);
  const [config, setConfig] = useState<GeneratorConfig>({
    class_id: "", // Initial value for class_id
    selectedDays: [1, 2, 3, 4, 5],
    hoursPerSubject: 2,
    avoidConflicts: true,
    defaultRoomName: "",
  });

  const { data: rooms = [] } = useQuery({
    queryKey: ["all-rooms-for-gen", tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return [];
      const { data } = await supabase.from("rooms").select("id, name").eq("tenant_id", tenant.id);
      return data || [];
    },
    enabled: !!tenant?.id && open,
  });

  const { data: classrooms } = useQuery({
    queryKey: ["schedule-gen-classrooms", tenant?.id, selectedDept, selectedLevel],
    queryFn: async () => {
      if (!tenant?.id) return [];

      if (filteredClassrooms && filteredClassrooms.length > 0) {
        return filteredClassrooms.map((c: any) => ({
          id: c.id,
          name: c.name,
          level_id: c.level_id
        }));
      }

      const { data, error } = await supabase
        .from("classes")
        .select("id, name, level_id")
        .eq("tenant_id", tenant.id)
        .order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!tenant?.id && open,
  });

  const { data: subjects = [] } = useQuery({
    queryKey: ["schedule-gen-subjects", tenant?.id, config.class_id],
    queryFn: async () => {
      if (!tenant?.id || !config.class_id) return [];

      const currentClassroom = classrooms?.find(c => c.id === config.class_id);
      const levelId = currentClassroom?.level_id;

      if (!levelId) {
        const { data } = await supabase.from("subjects").select("id, name, coefficient").eq("tenant_id", tenant.id);
        return data || [];
      }

      const { data: slData } = await supabase.from("subject_levels").select("subject_id").eq("level_id", levelId);
      const subjectIds = (slData || []).map(sl => sl.subject_id);

      if (subjectIds.length === 0) {
        const { data } = await supabase.from("subjects").select("id, name, coefficient").eq("tenant_id", tenant.id).limit(10);
        return data || [];
      }

      const { data } = await supabase.from("subjects").select("id, name, coefficient").in("id", subjectIds).eq("tenant_id", tenant.id);
      return data || [];
    },
    enabled: !!tenant?.id && !!config.class_id && open,
  });

  const generateMutation = useMutation({
    mutationFn: async () => {
      if (!tenant?.id || !config.class_id || !subjects.length) {
        throw new Error("Configuration incomplète ou aucune matière chargée");
      }

      await supabase.from("schedule").delete().eq("class_id", config.class_id);

      const slotsToCreate: any[] = [];

      // Initialize grid
      const days = config.selectedDays.sort((a, b) => a - b);
      const slotsPerDay = TIME_SLOTS.length;
      const totalSlots = days.length * slotsPerDay;

      // Sort subjects by coefficient (heavier subjects first)
      const sortedSubjects = [...subjects].sort((a, b) => (b.coefficient || 1) - (a.coefficient || 1));

      // Calculate total hours needed
      let totalHoursNeeded = 0;
      const subjectHours = sortedSubjects.map(s => {
        const hours = Math.ceil((s.coefficient || 1) * config.hoursPerSubject);
        totalHoursNeeded += hours;
        return { ...s, hoursRemaining: hours };
      });

      if (totalHoursNeeded > totalSlots) {
        toast.warning("Attention: Plus d'heures de cours que de créneaux disponibles !");
      }

      // Helper to check if a slot is valid
      const isSlotValid = (day: number, slotIndex: number, subjectId: string) => {
        // Avoid more than 2 consecutive hours of same subject
        const prevSlot = slotsToCreate.find(s => s.day_of_week === day && s.slot_index === slotIndex - 1);
        const prevPrevSlot = slotsToCreate.find(s => s.day_of_week === day && s.slot_index === slotIndex - 2);

        if (prevSlot?.subject_id === subjectId && prevPrevSlot?.subject_id === subjectId) {
          return false;
        }
        return true;
      };

      // Fill slots
      // Strategy: Iterate days and slots, pick best subject
      const currentDayIndex = 0;
      const currentSlotIndex = 0;

      // Create a map of available slots
      const grid: { day: number, slotIdx: number, time: typeof TIME_SLOTS[0] }[] = [];
      for (const day of days) {
        TIME_SLOTS.forEach((time, idx) => {
          grid.push({ day, slotIdx: idx, time });
        });
      }

      // Shuffle grid slightly to avoid rigid patterns, but keep structure
      // We'll fill purely sequentially for now to ensure morning classes are filled first

      for (const slot of grid) {
        // Find a subject that needs hours and fits
        // Try to pick one that hasn't been taught today yet, or at least not right before
        let bestSubject = null;

        // 1. Try to find subject with hours remaining that respects constraints
        for (const sub of subjectHours) {
          if (sub.hoursRemaining > 0) {
            if (isSlotValid(slot.day, slot.slotIdx, sub.id)) {
              bestSubject = sub;
              break;
            }
          }
        }

        // If no strict valid subject found, just pick first available (relax constraints)
        if (!bestSubject) {
          const anySub = subjectHours.find(s => s.hoursRemaining > 0);
          if (anySub) bestSubject = anySub;
        }

        if (bestSubject) {
          slotsToCreate.push({
            tenant_id: tenant.id,
            class_id: config.class_id,
            subject_id: bestSubject.id,
            subject: bestSubject.name,
            day_of_week: String(slot.day),
            start_time: slot.time.start + ":00",
            end_time: slot.time.end + ":00",
            room: config.defaultRoomName || null,
            room_id: rooms.find((r: any) => r.name === config.defaultRoomName)?.id || null,
            slot_index: slot.slotIdx // Helper for validation, not in DB
          });
          bestSubject.hoursRemaining--;
        }
      }

      const finalSlots = slotsToCreate.map(({ slot_index, ...rest }) => rest);

      if (finalSlots.length === 0) throw new Error("Impossible de générer des créneaux");

      const { error } = await supabase.from("schedule").insert(finalSlots);
      if (error) throw error;

      return { count: finalSlots.length };
    },
    onSuccess: (data) => {
      toast.success(`${data.count} créneaux générés avec succès`);
      setOpen(false);
      onGenerated();
      if (onClassroomGenerated) onClassroomGenerated(config.class_id);
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="rounded-xl border-primary/20 hover:border-primary/50 gap-2">
          <Wand2 className="w-4 h-4 text-primary" />
          Auto-générer
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[450px] rounded-2xl border-none shadow-2xl">
        <DialogHeader>
          <DialogTitle className="text-2xl font-display font-bold">Assistant de Génération</DialogTitle>
          <DialogDescription>Générez un emploi du temps équilibré basé sur les coefficients.</DialogDescription>
        </DialogHeader>
        <div className="space-y-5 py-4">
          <div className="flex items-start gap-3 p-3 bg-amber-50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-900/30 rounded-xl">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-800 dark:text-amber-200">L'emploi du temps actuel de la classe sera remplacé.</p>
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground font-sans">Classe cible</Label>
            <Select value={config.class_id} onValueChange={(v) => setConfig(p => ({ ...p, class_id: v }))}>
              <SelectTrigger className="rounded-xl h-11">
                <SelectValue placeholder="Choisir une classe" />
              </SelectTrigger>
              <SelectContent className="rounded-xl">
                {classrooms?.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground font-sans">Salle par défaut</Label>
            <Select value={config.defaultRoomName} onValueChange={(v) => setConfig(p => ({ ...p, defaultRoomName: v }))}>
              <SelectTrigger className="rounded-xl h-11">
                <SelectValue placeholder="Aucune (manuel)" />
              </SelectTrigger>
              <SelectContent className="rounded-xl">
                {rooms.map((r: any) => <SelectItem key={r.name} value={r.name}>{r.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-4 pt-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-semibold">Jours d'enseignement</Label>
              <span className="text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded-full font-bold uppercase">{config.selectedDays.length} jours</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {DAYS.map(day => (
                <Button
                  key={day.value}
                  variant={config.selectedDays.includes(day.value) ? "default" : "outline"}
                  size="sm"
                  className="h-8 rounded-lg text-xs"
                  onClick={() => setConfig(p => ({
                    ...p,
                    selectedDays: p.selectedDays.includes(day.value) ? p.selectedDays.filter(d => d !== day.value) : [...p.selectedDays, day.value]
                  }))}
                >
                  {day.label}
                </Button>
              ))}
            </div>
          </div>

          <Button
            className="w-full h-12 rounded-xl font-bold shadow-colored text-md"
            onClick={() => generateMutation.mutate()}
            disabled={!config.class_id || generateMutation.isPending}
          >
            {generateMutation.isPending ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <Wand2 className="w-5 h-5 mr-2" />}
            Générer le planning
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
