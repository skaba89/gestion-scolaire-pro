/**
 * OfflineAttendance — Saisie d'absences hors-ligne (Guinée)
 *
 * Permet aux enseignants de saisir les absences même sans connexion.
 * Les données sont stockées dans IndexedDB (Dexie) et synchronisées
 * automatiquement dès que la connexion est rétablie.
 *
 * Usage : inséré dans la page Attendance quand hors-ligne
 */

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { offlineDb, queueAttendance, type CachedStudent, type AttendanceStatus, type PendingAttendance } from "@/lib/offlineDb";
import { useTenant } from "@/contexts/TenantContext";
import {
  WifiOff, UserCheck, UserX, Clock, AlertCircle,
  CheckCircle2, Trash2, RefreshCw, Database
} from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { cn } from "@/lib/utils";

type StatusChoice = AttendanceStatus | "";

const STATUS_CONFIG: Record<AttendanceStatus, { label: string; color: string; icon: React.ReactNode }> = {
  PRESENT:  { label: "Présent(e)",    color: "bg-green-100 text-green-800 border-green-300", icon: <UserCheck className="w-4 h-4" /> },
  ABSENT:   { label: "Absent(e)",     color: "bg-red-100 text-red-800 border-red-300",       icon: <UserX className="w-4 h-4" /> },
  LATE:     { label: "En retard",     color: "bg-amber-100 text-amber-800 border-amber-300", icon: <Clock className="w-4 h-4" /> },
  EXCUSED:  { label: "Absent(e) just.",color: "bg-blue-100 text-blue-800 border-blue-300",   icon: <AlertCircle className="w-4 h-4" /> },
};

interface Props {
  classroomId: string;
  classroomName?: string;
  onSyncRequested?: () => void;
}

export function OfflineAttendance({ classroomId, classroomName, onSyncRequested }: Props) {
  const { tenant } = useTenant();
  const { toast } = useToast();

  const [students, setStudents] = useState<CachedStudent[]>([]);
  const [pending, setPending] = useState<PendingAttendance[]>([]);
  const [attendanceMap, setAttendanceMap] = useState<Record<string, StatusChoice>>({});
  const [selectedDate, setSelectedDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [saving, setSaving] = useState(false);
  const [loadingStudents, setLoadingStudents] = useState(true);

  // ── Load cached students from IndexedDB ──────────────────────────────────

  useEffect(() => {
    const load = async () => {
      setLoadingStudents(true);
      try {
        const cached = await offlineDb.cachedStudents
          .where("classroomId").equals(classroomId)
          .toArray();
        setStudents(cached);

        // Load today's pending attendance for pre-fill
        const todayPending = await offlineDb.pendingAttendance
          .where("classroomId").equals(classroomId)
          .and((item) => item.date === selectedDate && item.synced === 0)
          .toArray();
        setPending(todayPending);

        // Pre-fill attendance map from pending
        const map: Record<string, StatusChoice> = {};
        todayPending.forEach((item) => {
          map[item.studentId] = item.status;
        });
        setAttendanceMap(map);
      } finally {
        setLoadingStudents(false);
      }
    };
    load();
  }, [classroomId, selectedDate]);

  // ── Set status for a student ──────────────────────────────────────────────

  const setStatus = (studentId: string, status: AttendanceStatus) => {
    setAttendanceMap((prev) => ({
      ...prev,
      [studentId]: prev[studentId] === status ? "" : status, // toggle
    }));
  };

  // ── Mark all present (quick action) ──────────────────────────────────────

  const markAllPresent = () => {
    const map: Record<string, StatusChoice> = {};
    students.forEach((s) => { map[s.id] = "PRESENT"; });
    setAttendanceMap(map);
  };

  // ── Save to IndexedDB queue ───────────────────────────────────────────────

  const saveOffline = async () => {
    if (!tenant) return;
    const entries = Object.entries(attendanceMap).filter(([, status]) => status !== "");
    if (entries.length === 0) {
      toast({ title: "Rien à enregistrer", description: "Sélectionnez le statut de chaque élève" });
      return;
    }

    setSaving(true);
    try {
      // Remove existing pending for this date + classroom first
      await offlineDb.pendingAttendance
        .where("classroomId").equals(classroomId)
        .and((item) => item.date === selectedDate && item.synced === 0)
        .delete();

      // Queue all entries
      for (const [studentId, status] of entries) {
        if (!status) continue;
        await queueAttendance({
          localId: `${studentId}-${selectedDate}-${classroomId}-${Date.now()}`,
          tenantId: tenant.id,
          studentId,
          classroomId,
          date: selectedDate,
          status: status as AttendanceStatus,
        });
      }

      // Reload pending
      const todayPending = await offlineDb.pendingAttendance
        .where("classroomId").equals(classroomId)
        .and((item) => item.date === selectedDate && item.synced === 0)
        .toArray();
      setPending(todayPending);

      toast({
        title: `${entries.length} présence(s) enregistrée(s) hors-ligne`,
        description: "Les données seront synchronisées au retour de la connexion",
      });
    } catch (err) {
      toast({ title: "Erreur", description: "Impossible d'enregistrer hors-ligne", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  // ── Delete pending record ──────────────────────────────────────────────────

  const deletePending = async (id: number) => {
    await offlineDb.pendingAttendance.delete(id);
    setPending((prev) => prev.filter((p) => p.id !== id));
    toast({ title: "Enregistrement supprimé" });
  };

  // ── No cached students ────────────────────────────────────────────────────

  if (!loadingStudents && students.length === 0) {
    return (
      <Card className="border-amber-200 bg-amber-50">
        <CardContent className="p-6 text-center">
          <Database className="w-10 h-10 mx-auto mb-3 text-amber-500" />
          <p className="font-semibold text-amber-800">Aucune donnée en cache pour cette classe</p>
          <p className="text-sm text-amber-700 mt-1">
            Connectez-vous au moins une fois avec internet pour mettre en cache les données des élèves.
          </p>
        </CardContent>
      </Card>
    );
  }

  const presentCount = Object.values(attendanceMap).filter(s => s === "PRESENT").length;
  const absentCount  = Object.values(attendanceMap).filter(s => s === "ABSENT" || s === "LATE" || s === "EXCUSED").length;

  return (
    <div className="space-y-4">

      {/* Header offline alert */}
      <div className="flex items-center gap-3 p-3 rounded-lg bg-red-50 border border-red-200">
        <WifiOff className="w-5 h-5 text-red-500 shrink-0" />
        <div>
          <p className="text-sm font-semibold text-red-800">Mode hors-ligne — {classroomName || "Classe"}</p>
          <p className="text-xs text-red-700">
            Les absences sont enregistrées localement et synchronisées automatiquement dès le retour de la connexion.
          </p>
        </div>
        {pending.length > 0 && (
          <Badge variant="outline" className="ml-auto shrink-0 border-red-400 text-red-700">
            {pending.length} en attente
          </Badge>
        )}
      </div>

      {/* Date + quick actions */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="offlineDate">Date</Label>
          <Input
            id="offlineDate"
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="w-40"
            max={format(new Date(), "yyyy-MM-dd")}
          />
        </div>
        <Button variant="outline" size="sm" onClick={markAllPresent}>
          <UserCheck className="w-4 h-4 mr-1.5 text-green-600" />
          Tous présents
        </Button>
        <div className="ml-auto flex items-center gap-3 text-sm">
          <span className="text-green-700 font-medium">{presentCount} présent(s)</span>
          <span className="text-red-700 font-medium">{absentCount} absent(s)</span>
        </div>
      </div>

      {/* Student list */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            {loadingStudents ? "Chargement..." : `${students.length} élèves — ${format(new Date(selectedDate + "T00:00:00"), "EEEE d MMMM yyyy", { locale: fr })}`}
          </CardTitle>
          <CardDescription>Appuyez sur un statut pour l'enregistrer hors-ligne</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {students.map((student) => {
            const currentStatus = attendanceMap[student.id] || "";
            return (
              <div
                key={student.id}
                className="flex items-center gap-3 p-2.5 rounded-lg border bg-card"
              >
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">
                    {student.lastName} {student.firstName}
                  </p>
                  {student.registrationNumber && (
                    <p className="text-xs text-muted-foreground">{student.registrationNumber}</p>
                  )}
                </div>
                {/* Status buttons */}
                <div className="flex gap-1.5 shrink-0">
                  {(Object.entries(STATUS_CONFIG) as [AttendanceStatus, typeof STATUS_CONFIG[AttendanceStatus]][]).map(
                    ([status, cfg]) => (
                      <button
                        key={status}
                        type="button"
                        onClick={() => setStatus(student.id, status)}
                        title={cfg.label}
                        className={cn(
                          "p-1.5 rounded-md border transition-all",
                          currentStatus === status
                            ? cfg.color + " scale-110 shadow-sm"
                            : "border-transparent text-muted-foreground hover:bg-muted"
                        )}
                      >
                        {cfg.icon}
                      </button>
                    )
                  )}
                </div>
                {currentStatus && (
                  <Badge
                    variant="outline"
                    className={cn("text-xs shrink-0", STATUS_CONFIG[currentStatus as AttendanceStatus]?.color)}
                  >
                    {STATUS_CONFIG[currentStatus as AttendanceStatus]?.label}
                  </Badge>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Save button */}
      <div className="flex gap-3">
        <Button onClick={saveOffline} disabled={saving} className="flex-1">
          {saving ? (
            <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Database className="w-4 h-4 mr-2" />
          )}
          {saving ? "Enregistrement..." : "Enregistrer hors-ligne"}
        </Button>
        {onSyncRequested && (
          <Button variant="outline" onClick={onSyncRequested}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Synchroniser
          </Button>
        )}
      </div>

      {/* Pending queue display */}
      {pending.length > 0 && (
        <Card className="border-blue-200 bg-blue-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-blue-800 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" />
              {pending.length} enregistrement(s) en attente de synchronisation
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {pending.map((item) => {
              const student = students.find(s => s.id === item.studentId);
              const cfg = STATUS_CONFIG[item.status];
              return (
                <div key={item.id} className="flex items-center justify-between text-sm">
                  <span className="font-medium">
                    {student ? `${student.lastName} ${student.firstName}` : item.studentId.slice(0, 8)}
                  </span>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={cn("text-xs", cfg?.color)}>
                      {cfg?.label || item.status}
                    </Badge>
                    {item.syncError && (
                      <span className="text-xs text-red-600" title={item.syncError}>⚠️</span>
                    )}
                    <button
                      type="button"
                      onClick={() => item.id && deletePending(item.id)}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
