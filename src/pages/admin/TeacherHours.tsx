import { useState, useEffect } from "react";
import { useTenant } from "@/contexts/TenantContext";
import { useAuth } from "@/contexts/AuthContext";
import { apiClient } from "@/api/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek } from "date-fns";
import { fr } from "date-fns/locale";
import { Clock, Plus, CalendarIcon, Users, BookOpen, BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useStaff } from "@/features/staff/hooks/useStaff";
import { useQuery, useQueryClient } from "@tanstack/react-query";

interface Teacher {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
}

interface Subject {
  id: string;
  name: string;
}

interface Classroom {
  id: string;
  name: string;
}

interface WorkHour {
  id: string;
  teacher_id: string;
  subject_id: string | null;
  class_id: string | null;
  work_date: string;
  hours_worked: number;
  description: string | null;
  teacher?: Teacher;
  subject?: Subject;
  classroom?: Classroom;
}

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16"];

export default function TeacherHoursPage() {
  const { tenant } = useTenant();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Filter state
  const [filterTeacher, setFilterTeacher] = useState<string>("all");
  const [filterPeriod, setFilterPeriod] = useState<"week" | "month" | "all">("month");

  // Dialog & Form state
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedTeacher, setSelectedTeacher] = useState("");
  const [selectedSubject, setSelectedSubject] = useState("");
  const [selectedClassroom, setSelectedClassroom] = useState("");
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [hoursWorked, setHoursWorked] = useState("");
  const [description, setDescription] = useState("");

  // Data Fetching
  const { staff: teachers, isLoading: loadingTeachers } = useStaff({ role: "TEACHER" });

  const { data: subjects = [] } = useQuery({
    queryKey: ["subjects", tenant?.id],
    queryFn: async () => {
      if (!tenant) return [];
      const response = await apiClient.get<{ id: string; name: string }[]>("/academic/subjects/");
      return response.data;
    },
    enabled: !!tenant,
  });

  const { data: classrooms = [] } = useQuery({
    queryKey: ["classrooms", tenant?.id],
    queryFn: async () => {
      if (!tenant) return [];
      const response = await apiClient.get<{ id: string; name: string }[]>("/infrastructure/classrooms/");
      return response.data;
    },
    enabled: !!tenant,
  });

  const { data: workHours = [], isLoading: loadingHours } = useQuery({
    queryKey: ["teacher-work-hours", tenant?.id, filterTeacher, filterPeriod],
    queryFn: async () => {
      if (!tenant) return [];

      // Build date filter
      const now = new Date();
      let dateStart: string | null = null;
      let dateEnd: string | null = null;

      if (filterPeriod === "week") {
        dateStart = format(startOfWeek(now, { weekStartsOn: 1 }), "yyyy-MM-dd");
        dateEnd = format(endOfWeek(now, { weekStartsOn: 1 }), "yyyy-MM-dd");
      } else if (filterPeriod === "month") {
        dateStart = format(startOfMonth(now), "yyyy-MM-dd");
        dateEnd = format(endOfMonth(now), "yyyy-MM-dd");
      }

      const params: Record<string, string> = {};
      if (filterTeacher !== "all") {
        params.teacher_id = filterTeacher;
      }
      if (dateStart && dateEnd) {
        params.work_date_after = dateStart;
        params.work_date_before = dateEnd;
      }

      const response = await apiClient.get<WorkHour[]>("/hr/teacher-work-hours/", { params });
      return response.data;
    },
    enabled: !!tenant,
  });

  const loading = loadingTeachers || loadingHours;

  const handleAddHours = async () => {
    if (!selectedTeacher || !hoursWorked || !tenant) {
      toast({
        title: "Erreur",
        description: "Veuillez remplir tous les champs obligatoires",
        variant: "destructive",
      });
      return;
    }

    try {
      await apiClient.post("/hr/teacher-work-hours/", {
        teacher_id: selectedTeacher,
        tenant_id: tenant.id,
        subject_id: selectedSubject || null,
        class_id: selectedClassroom || null,
        work_date: format(selectedDate, "yyyy-MM-dd"),
        hours_worked: parseFloat(hoursWorked),
        description: description || null,
        recorded_by: user?.id,
      });

      toast({
        title: "Succès",
        description: "Heures enregistrées",
      });
      setIsDialogOpen(false);
      resetForm();
      queryClient.invalidateQueries({ queryKey: ["teacher-work-hours"] });
    } catch (error) {
      toast({
        title: "Erreur",
        description: "Impossible d'ajouter les heures",
        variant: "destructive",
      });
    }
  };

  const resetForm = () => {
    setSelectedTeacher("");
    setSelectedSubject("");
    setSelectedClassroom("");
    setSelectedDate(new Date());
    setHoursWorked("");
    setDescription("");
  };

  // Calculate stats
  const totalHours = workHours.reduce((sum, wh) => sum + Number(wh.hours_worked), 0);
  const uniqueTeachers = new Set(workHours.map(wh => wh.teacher_id)).size;

  // Hours by teacher chart data
  const hoursByTeacher = workHours.reduce((acc, wh) => {
    const teacherName = wh.teacher ? `${wh.teacher.first_name} ${wh.teacher.last_name}` : "Inconnu";
    acc[teacherName] = (acc[teacherName] || 0) + Number(wh.hours_worked);
    return acc;
  }, {} as Record<string, number>);

  const teacherChartData = Object.entries(hoursByTeacher).map(([name, hours]) => ({
    name,
    value: Math.round(hours * 10) / 10,
    hours: Math.round(hours * 10) / 10,
  })).sort((a, b) => b.value - a.value);

  // Hours by subject chart data
  const hoursBySubject = workHours.reduce((acc, wh) => {
    const subjectName = wh.subject?.name || "Non spécifié";
    acc[subjectName] = (acc[subjectName] || 0) + Number(wh.hours_worked);
    return acc;
  }, {} as Record<string, number>);

  const subjectChartData = Object.entries(hoursBySubject).map(([name, value]) => ({
    name,
    value: Math.round(value * 10) / 10,
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Suivi Horaire Enseignants</h1>
          <p className="text-muted-foreground">
            Gérez et suivez les heures de travail des professeurs
          </p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 h-4 mr-2" />
              Ajouter des heures
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Enregistrer des heures</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Enseignant *</Label>
                <Select value={selectedTeacher} onValueChange={setSelectedTeacher}>
                  <SelectTrigger>
                    <SelectValue placeholder="Sélectionner un enseignant" />
                  </SelectTrigger>
                  <SelectContent>
                    {teachers.map((teacher) => (
                      <SelectItem key={teacher.id} value={teacher.id}>
                        {teacher.first_name} {teacher.last_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Matière</Label>
                  <Select value={selectedSubject} onValueChange={setSelectedSubject}>
                    <SelectTrigger>
                      <SelectValue placeholder="Optionnel" />
                    </SelectTrigger>
                    <SelectContent>
                      {subjects.map((subject) => (
                        <SelectItem key={subject.id} value={subject.id}>
                          {subject.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Classe</Label>
                  <Select value={selectedClassroom} onValueChange={setSelectedClassroom}>
                    <SelectTrigger>
                      <SelectValue placeholder="Optionnel" />
                    </SelectTrigger>
                    <SelectContent>
                      {classrooms.map((classroom) => (
                        <SelectItem key={classroom.id} value={classroom.id}>
                          {classroom.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Date *</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full justify-start text-left">
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {format(selectedDate, "dd/MM/yyyy", { locale: fr })}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={selectedDate}
                        onSelect={(date) => date && setSelectedDate(date)}
                        locale={fr}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="space-y-2">
                  <Label>Heures *</Label>
                  <Input
                    type="number"
                    step="0.5"
                    min="0.5"
                    max="12"
                    value={hoursWorked}
                    onChange={(e) => setHoursWorked(e.target.value)}
                    placeholder="Ex: 2.5"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Description</Label>
                <Input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Détails optionnels..."
                />
              </div>

              <Button onClick={handleAddHours} className="w-full">
                Enregistrer
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Heures</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalHours.toFixed(1)}h</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Enseignants Actifs</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{uniqueTeachers}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Matières Enseignées</CardTitle>
            <BookOpen className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{Object.keys(hoursBySubject).length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Moyenne/Enseignant</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {uniqueTeachers > 0 ? (totalHours / uniqueTeachers).toFixed(1) : 0}h
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="dashboard" className="space-y-4">
        <TabsList>
          <TabsTrigger value="dashboard">Tableau de Bord</TabsTrigger>
          <TabsTrigger value="details">Détails</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            {/* Hours by Teacher Chart */}
            <Card>
              <CardHeader>
                <CardTitle>Heures par Enseignant</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={teacherChartData} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" unit="h" />
                      <YAxis dataKey="name" type="category" width={120} />
                      <Tooltip formatter={(value) => [`${value}h`, "Heures"]} />
                      <Bar dataKey="hours" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Hours by Subject Chart */}
            <Card>
              <CardHeader>
                <CardTitle>Heures par Matière</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={subjectChartData}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, value }) => `${name}: ${value}h`}
                        outerRadius={100}
                        fill="#8884d8"
                        dataKey="value"
                      >
                        {subjectChartData.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value) => [`${value}h`, "Heures"]} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="details">
          <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row gap-4">
                <Select value={filterTeacher} onValueChange={setFilterTeacher}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="Tous les enseignants" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tous les enseignants</SelectItem>
                    {teachers.map((teacher) => (
                      <SelectItem key={teacher.id} value={teacher.id}>
                        {teacher.first_name} {teacher.last_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={filterPeriod} onValueChange={(v) => setFilterPeriod(v as "week" | "month" | "all")}>
                  <SelectTrigger className="w-[150px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="week">Cette semaine</SelectItem>
                    <SelectItem value="month">Ce mois</SelectItem>
                    <SelectItem value="all">Tout</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center py-8">Chargement...</div>
              ) : workHours.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  Aucune heure enregistrée
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Enseignant</TableHead>
                      <TableHead>Matière</TableHead>
                      <TableHead>Classe</TableHead>
                      <TableHead>Heures</TableHead>
                      <TableHead>Description</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {workHours.map((wh) => (
                      <TableRow key={wh.id}>
                        <TableCell>
                          {format(new Date(wh.work_date), "dd/MM/yyyy", { locale: fr })}
                        </TableCell>
                        <TableCell className="font-medium">
                          {wh.teacher?.first_name} {wh.teacher?.last_name}
                        </TableCell>
                        <TableCell>{wh.subject?.name || "-"}</TableCell>
                        <TableCell>{wh.classroom?.name || "-"}</TableCell>
                        <TableCell className="font-mono">{wh.hours_worked}h</TableCell>
                        <TableCell className="text-muted-foreground">
                          {wh.description || "-"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
