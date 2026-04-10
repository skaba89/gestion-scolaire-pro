import { useState, useEffect } from "react";
import { useTenant } from "@/contexts/TenantContext";
import { apiClient } from "@/api/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { format, startOfDay, endOfDay } from "date-fns";
import { fr } from "date-fns/locale";
import { Users, UserCheck, UserX, Clock, Search, Activity, Scan } from "lucide-react";
import { useStudentLabel } from "@/hooks/useStudentLabel";
import QRScanner from "@/components/badges/QRScanner";
import { Button } from "@/components/ui/button";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { adminQueries } from "@/queries/admin";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

interface Student {
  id: string;
  first_name: string;
  last_name: string;
  registration_number: string | null;
}

interface Enrollment {
  student_id: string;
  student: Student;
}

interface CheckIn {
  id: string;
  student_id: string;
  check_in_type: "ENTRY" | "EXIT";
  checked_at: string;
}

interface Classroom {
  id: string;
  name: string;
}

export default function LiveAttendancePage() {
  const { tenant } = useTenant();
  const { toast: uiToast } = useToast();
  const { studentLabel, studentsLabel, StudentsLabel } = useStudentLabel();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [selectedClassroom, setSelectedClassroom] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [showScanner, setShowScanner] = useState(false);
  const [scanMode, setScanMode] = useState<"AUTO" | "ENTRY" | "EXIT">("AUTO");

  const { data: badges = [] } = useQuery({
    ...adminQueries.studentBadgesDetailed(tenant?.id || ""),
    enabled: !!tenant?.id,
  });

  const today = new Date();
  const dayStart = startOfDay(today).toISOString();
  const dayEnd = endOfDay(today).toISOString();

  const { data: checkIns = [], isLoading: isLoadingCheckIns } = useQuery({
    ...adminQueries.studentCheckInHistory(tenant?.id || "", dayStart, dayEnd),
    enabled: !!tenant?.id,
  });

  const checkInMutation = useMutation({
    mutationFn: adminQueries.createStudentCheckIn,
    onMutate: async (newCheckIn) => {
      await queryClient.cancelQueries({ queryKey: ["admin-student-check-ins", tenant?.id] });
      const previousCheckIns = queryClient.getQueryData<CheckIn[]>(["admin-student-check-ins", tenant?.id]);

      if (previousCheckIns) {
        const optimisticCheckIn = {
          ...newCheckIn,
          id: `temp-${Date.now()}`,
          checked_at: new Date().toISOString(),
        } as CheckIn;

        queryClient.setQueryData<CheckIn[]>(
          ["admin-student-check-ins", tenant?.id],
          [optimisticCheckIn, ...previousCheckIns]
        );
      }

      return { previousCheckIns };
    },
    onError: (err, newCheckIn, context) => {
      if (context?.previousCheckIns) {
        queryClient.setQueryData(["admin-student-check-ins", tenant?.id], context.previousCheckIns);
      }
      toast.error("Erreur lors de l'enregistrement du pointage.");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-student-check-ins", tenant?.id, dayStart, dayEnd] });
    }
  });

  const fetchClassrooms = async () => {
    if (!tenant) return;
    const response = await apiClient.get<Classroom[]>("/infrastructure/classrooms/", {
      params: { ordering: "name" }
    });
    setClassrooms(response.data || []);
  };

  const fetchData = async () => {
    if (!tenant) return;
    setLoading(true);

    const params: Record<string, string> = { status: "active" };
    if (selectedClassroom !== "all") {
      params.class_id = selectedClassroom;
    }

    const response = await apiClient.get<Enrollment[]>("/students/enrollments/", { params });
    setEnrollments(response.data || []);
    setLoading(false);
  };

  useEffect(() => {
    if (tenant) {
      fetchClassrooms();
      fetchData();
      // Realtime disabled — polling or manual refresh only
    }
  }, [tenant]);

  useEffect(() => {
    if (tenant) fetchData();
  }, [selectedClassroom]);

  const handleScanResult = async (qrData: string) => {
    try {
      const data = JSON.parse(qrData);
      if (data.type !== "student_badge" || data.tenant_id !== tenant?.id) {
        toast.error("Badge non valide.");
        return;
      }

      const badge = badges.find((b: any) => b.badge_code === data.badge_code);
      if (!badge) {
        toast.error("Badge non trouvé.");
        return;
      }

      let type: "ENTRY" | "EXIT" = "ENTRY";
      if (scanMode === "AUTO") {
        const lastCheck = await adminQueries.getStudentLastCheckIn(badge.student_id, tenant!.id);
        type = lastCheck?.check_in_type === "ENTRY" ? "EXIT" : "ENTRY";
      } else {
        type = scanMode as "ENTRY" | "EXIT";
      }

      await checkInMutation.mutateAsync({
        student_id: badge.student_id,
        badge_id: badge.id,
        tenant_id: tenant!.id,
        check_in_type: type,
        checked_by: user?.id,
      });

      toast.success(`${type === "ENTRY" ? "Entrée" : "Sortie"} enregistrée`, {
        description: `${badge.student?.first_name} ${badge.student?.last_name}`,
      });
    } catch (e) {
      toast.error("Erreur lors du scan.");
    }
  };

  const getStudentStatus = (studentId: string): "present" | "absent" | "left" => {
    const studentCheckIns = checkIns.filter(c => c.student_id === studentId);
    if (studentCheckIns.length === 0) return "absent";
    const lastCheckIn = studentCheckIns[0];
    return lastCheckIn.check_in_type === "ENTRY" ? "present" : "left";
  };

  const getLastCheckInTime = (studentId: string): string | null => {
    const studentCheckIns = checkIns.filter(c => c.student_id === studentId);
    if (studentCheckIns.length === 0) return null;
    return format(new Date(studentCheckIns[0].checked_at), "HH:mm", { locale: fr });
  };

  const filteredEnrollments = enrollments.filter(e => {
    const studentName = `${e.student.first_name} ${e.student.last_name}`.toLowerCase();
    return studentName.includes(searchTerm.toLowerCase()) ||
      e.student.registration_number?.toLowerCase().includes(searchTerm.toLowerCase());
  });

  const totalStudents = enrollments.length;
  const presentStudents = enrollments.filter(e => getStudentStatus(e.student_id) === "present").length;
  const absentStudents = enrollments.filter(e => getStudentStatus(e.student_id) === "absent").length;
  const leftStudents = enrollments.filter(e => getStudentStatus(e.student_id) === "left").length;
  const attendanceRate = totalStudents > 0 ? Math.round(((presentStudents + leftStudents) / totalStudents) * 100) : 0;

  return (
    <div className="space-y-6 text-foreground">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Activity className="h-8 w-8 text-green-500 animate-pulse" />
            Pointage en Temps Réel
          </h1>
          <p className="text-muted-foreground">
            {format(new Date(), "EEEE d MMMM yyyy", { locale: fr })}
          </p>
        </div>
        <Button size="lg" onClick={() => setShowScanner(!showScanner)} variant={showScanner ? "destructive" : "default"} className="gap-2 shadow-lg">
          <Scan className="w-5 h-5" />
          {showScanner ? "Fermer le Scanner" : "Ouvrir le Scanner"}
        </Button>
      </div>

      {showScanner && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-1 shadow-xl border-primary/20">
            <CardHeader>
              <CardTitle className="flex justify-between items-center text-sm md:text-base">
                <span>Scanner de Badges</span>
                <div className="flex gap-1">
                  <Badge variant={scanMode === 'AUTO' ? 'default' : 'outline'} className="cursor-pointer" onClick={() => setScanMode('AUTO')}>Auto</Badge>
                  <Badge variant={scanMode === 'ENTRY' ? 'default' : 'outline'} className="cursor-pointer" onClick={() => setScanMode('ENTRY')}>Entrée</Badge>
                  <Badge variant={scanMode === 'EXIT' ? 'default' : 'outline'} className="cursor-pointer" onClick={() => setScanMode('EXIT')}>Sortie</Badge>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <QRScanner continuous onScan={handleScanResult} onClose={() => setShowScanner(false)} />
            </CardContent>
          </Card>

          <Card className="lg:col-span-2 shadow-lg">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Clock className="w-5 h-5" /> File d'attente (Derniers passages)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
                {checkIns.slice(0, 8).map((check, idx) => {
                  const enrollment = enrollments.find(e => e.student_id === check.student_id);
                  return (
                    <div key={check.id} className={`flex items-center justify-between p-3 rounded-lg border-l-4 animate-in slide-in-from-right duration-300 ${idx === 0 ? 'bg-primary/5 border-primary ring-1 ring-primary/20' : 'bg-muted/30 border-muted'}`}>
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center font-bold text-lg overflow-hidden">
                          {enrollment?.student.first_name?.[0]}{enrollment?.student.last_name?.[0]}
                        </div>
                        <div>
                          <p className="font-bold">{enrollment?.student.first_name} {enrollment?.student.last_name}</p>
                          <p className="text-xs text-muted-foreground">{enrollment?.student.registration_number}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <Badge className={check.check_in_type === 'ENTRY' ? 'bg-emerald-500 hover:bg-emerald-600' : 'bg-orange-500 hover:bg-orange-600'}>
                            {check.check_in_type === 'ENTRY' ? 'ENTRÉE' : 'SORTIE'}
                          </Badge>
                          <p className="text-[10px] text-muted-foreground mt-1">{format(new Date(check.checked_at), 'HH:mm:ss')}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
                {checkIns.length === 0 && (
                  <div className="text-center py-10 text-muted-foreground">En attente de pointage...</div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total {StudentsLabel}</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalStudents}</div>
          </CardContent>
        </Card>
        <Card className="border-green-200 bg-green-50">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-green-800">Présents</CardTitle>
            <UserCheck className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{presentStudents}</div>
          </CardContent>
        </Card>
        <Card className="border-red-200 bg-red-50">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-red-800">Absents</CardTitle>
            <UserX className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{absentStudents}</div>
          </CardContent>
        </Card>
        <Card className="border-orange-200 bg-orange-50">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-orange-800">Partis</CardTitle>
            <Clock className="h-4 w-4 text-orange-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">{leftStudents}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Taux Présence</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{attendanceRate}%</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Rechercher..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-10" />
            </div>
            <Select value={selectedClassroom} onValueChange={setSelectedClassroom}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Toutes les classes" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes les classes</SelectItem>
                {classrooms.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8">Chargement...</div>
          ) : filteredEnrollments.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">Aucun {studentLabel} trouvé</div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
              {filteredEnrollments.map((en) => {
                const status = getStudentStatus(en.student_id);
                const time = getLastCheckInTime(en.student_id);
                return (
                  <Card key={en.student_id} className={`transition-all shadow-sm ${status === "present" ? "border-green-300 bg-green-50" : status === "left" ? "border-orange-300 bg-orange-50" : "border-red-300 bg-red-50"}`}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium text-sm sm:text-base">{en.student.first_name} {en.student.last_name}</p>
                          <p className="text-xs text-muted-foreground">{en.student.registration_number || "—"}</p>
                        </div>
                        <div className="text-right">
                          <Badge variant="outline" className={status === "present" ? "bg-green-100 text-green-800 border-green-200" : status === "left" ? "bg-orange-100 text-orange-800 border-orange-200" : "bg-red-100 text-red-800 border-red-200"}>
                            {status === "present" ? "Présent" : status === "left" ? "Parti" : "Absent"}
                          </Badge>
                          {time && <p className="text-[10px] text-muted-foreground mt-1 font-mono">{time}</p>}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
