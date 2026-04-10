import { useState, useEffect } from "react";
import { useTenant } from "@/contexts/TenantContext";
import { apiClient } from "@/api/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Calendar, Save } from "lucide-react";

interface ScheduleConfig {
  workingDays: number[];
  startTime: string;
  endTime: string;
  slotDuration: number;
  breakStartTime: string;
  breakEndTime: string;
  lunchStartTime: string;
  lunchEndTime: string;
}

const DAYS = [
  { value: 1, label: "Lundi" },
  { value: 2, label: "Mardi" },
  { value: 3, label: "Mercredi" },
  { value: 4, label: "Jeudi" },
  { value: 5, label: "Vendredi" },
  { value: 6, label: "Samedi" },
  { value: 0, label: "Dimanche" },
];

const ScheduleSettings = () => {
  const { tenant } = useTenant();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [config, setConfig] = useState<ScheduleConfig>({
    workingDays: [1, 2, 3, 4, 5],
    startTime: "08:00",
    endTime: "17:00",
    slotDuration: 60,
    breakStartTime: "10:00",
    breakEndTime: "10:15",
    lunchStartTime: "12:00",
    lunchEndTime: "14:00",
  });

  useEffect(() => {
    if (tenant?.settings) {
      const settings = tenant.settings as Record<string, any>;
      setConfig({
        workingDays: settings.workingDays ?? [1, 2, 3, 4, 5],
        startTime: settings.startTime ?? "08:00",
        endTime: settings.endTime ?? "17:00",
        slotDuration: settings.slotDuration ?? 60,
        breakStartTime: settings.breakStartTime ?? "10:00",
        breakEndTime: settings.breakEndTime ?? "10:15",
        lunchStartTime: settings.lunchStartTime ?? "12:00",
        lunchEndTime: settings.lunchEndTime ?? "14:00",
      });
    }
  }, [tenant]);

  const handleSave = async () => {
    if (!tenant) return;
    setLoading(true);

    try {
      const currentSettings = (tenant.settings as Record<string, any>) || {};
      const newSettings = { ...currentSettings, ...config };

      await apiClient.patch(`/tenants/${tenant.id}/`, {
        settings: newSettings,
      });

      toast({
        title: "Paramètres enregistrés",
        description: "Les paramètres d'emploi du temps ont été mis à jour.",
      });
    } catch (error: any) {
      toast({
        title: "Erreur",
        description: error.response?.data?.detail || error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const toggleDay = (day: number) => {
    const newDays = config.workingDays.includes(day)
      ? config.workingDays.filter((d) => d !== day)
      : [...config.workingDays, day].sort((a, b) => a - b);
    setConfig({ ...config, workingDays: newDays });
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Calendar className="w-5 h-5 text-primary" />
          </div>
          <div>
            <CardTitle>Paramètres d'Emploi du Temps</CardTitle>
            <CardDescription>Configurez les horaires et jours de cours</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Working Days */}
        <div className="space-y-3">
          <Label className="text-base font-medium">Jours de cours</Label>
          <div className="flex flex-wrap gap-3">
            {DAYS.map((day) => (
              <div
                key={day.value}
                className="flex items-center space-x-2 p-3 rounded-lg border bg-card"
              >
                <Checkbox
                  id={`day-${day.value}`}
                  checked={config.workingDays.includes(day.value)}
                  onCheckedChange={() => toggleDay(day.value)}
                />
                <label
                  htmlFor={`day-${day.value}`}
                  className="text-sm font-medium cursor-pointer"
                >
                  {day.label}
                </label>
              </div>
            ))}
          </div>
        </div>

        {/* School Hours */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label htmlFor="startTime">Heure de début</Label>
            <Input
              id="startTime"
              type="time"
              value={config.startTime}
              onChange={(e) => setConfig({ ...config, startTime: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="endTime">Heure de fin</Label>
            <Input
              id="endTime"
              type="time"
              value={config.endTime}
              onChange={(e) => setConfig({ ...config, endTime: e.target.value })}
            />
          </div>
        </div>

        {/* Slot Duration */}
        <div className="space-y-2">
          <Label htmlFor="slotDuration">Durée d'un créneau (minutes)</Label>
          <Input
            id="slotDuration"
            type="number"
            min="30"
            step="15"
            value={config.slotDuration}
            onChange={(e) => setConfig({ ...config, slotDuration: parseInt(e.target.value) || 60 })}
            className="w-32"
          />
        </div>

        {/* Break Times */}
        <div className="space-y-4">
          <Label className="text-base font-medium">Pause du matin</Label>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-4 rounded-lg border bg-muted/30">
            <div className="space-y-2">
              <Label htmlFor="breakStart">Début de la pause</Label>
              <Input
                id="breakStart"
                type="time"
                value={config.breakStartTime}
                onChange={(e) => setConfig({ ...config, breakStartTime: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="breakEnd">Fin de la pause</Label>
              <Input
                id="breakEnd"
                type="time"
                value={config.breakEndTime}
                onChange={(e) => setConfig({ ...config, breakEndTime: e.target.value })}
              />
            </div>
          </div>
        </div>

        {/* Lunch Break */}
        <div className="space-y-4">
          <Label className="text-base font-medium">Pause déjeuner</Label>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-4 rounded-lg border bg-muted/30">
            <div className="space-y-2">
              <Label htmlFor="lunchStart">Début du déjeuner</Label>
              <Input
                id="lunchStart"
                type="time"
                value={config.lunchStartTime}
                onChange={(e) => setConfig({ ...config, lunchStartTime: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lunchEnd">Fin du déjeuner</Label>
              <Input
                id="lunchEnd"
                type="time"
                value={config.lunchEndTime}
                onChange={(e) => setConfig({ ...config, lunchEndTime: e.target.value })}
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={loading}>
            <Save className="w-4 h-4 mr-2" />
            {loading ? "Enregistrement..." : "Enregistrer les paramètres"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default ScheduleSettings;
