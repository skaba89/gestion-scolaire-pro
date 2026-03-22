import { useState, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/api/client";
import { useTenant } from "@/contexts/TenantContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import {
  BarChart3,
  Search,
  Plus,
  FileText,
  BookOpen,
  Users,
  Calendar
} from "lucide-react";
import { toast } from "sonner";
import { generateReportCard } from "@/utils/pdfGenerator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useMutation, useQueryClient } from "@tanstack/react-query";

const Grades = () => {
  const { tenant } = useTenant();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedClassroom, setSelectedClassroom] = useState<string>("all");

  const { data: classrooms } = useQuery({
    queryKey: ["classrooms", tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return [];
      const { data } = await apiClient.get("/infrastructure/classrooms/");
      return data;
    },
    enabled: !!tenant?.id,
  });

  const { data: assessments, isLoading } = useQuery({
    queryKey: ["assessments", tenant?.id, selectedClassroom],
    queryFn: async () => {
      if (!tenant?.id) return [];
      const { data } = await apiClient.get("/assessments/", {
        params: selectedClassroom !== "all" ? { classId: selectedClassroom } : {}
      });
      return data.items || data;
    },
    enabled: !!tenant?.id,
  });

  const { data: subjects } = useQuery({
    queryKey: ["subjects", tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return [];
      const { data } = await apiClient.get("/subjects/");
      return data;
    },
    enabled: !!tenant?.id,
  });

  const { data: currentTerms } = useQuery({
    queryKey: ["terms", tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return [];
      const { data } = await apiClient.get("/terms/");
      return data;
    },
    enabled: !!tenant?.id,
  });

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newAssessment, setNewAssessment] = useState({
    name: "",
    type: "EXAM",
    date: new Date().toISOString().split('T')[0],
    max_score: 20,
    weight: 1,
    class_id: "",
    subject_id: "",
    term_id: ""
  });

  const queryClient = useQueryClient();
  const createMutation = useMutation({
    mutationFn: async (assessment: any) => {
      const { data } = await apiClient.post("/assessments/", assessment);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["assessments"] });
      toast.success("Évaluation créée avec succès");
      setIsCreateOpen(false);
    }
  });

  // Mémoïsation du filtrage et des calculs de notes
  const filteredAssessments = useMemo(() =>
    assessments?.filter((assessment) =>
      assessment.name.toLowerCase().includes(searchTerm.toLowerCase())
    ) || [],
    [assessments, searchTerm]);

  // Mémoïsation des statistiques
  const stats = useMemo(() => {
    const total = assessments?.length || 0;
    const classroomCount = classrooms?.length || 0;

    return {
      total,
      subjects: subjects?.length || 0,
      classrooms: classroomCount,
    };
  }, [assessments, subjects, classrooms]);

  // useCallback pour les handlers
  const handleSearch = useCallback((value: string) => {
    setSearchTerm(value);
  }, []);

  const handleClassroomChange = useCallback((value: string) => {
    setSelectedClassroom(value);
  }, []);

  const handleGenerateBulletins = () => {
    try {
      if (!assessments || assessments.length === 0) {
        toast.info("Aucune évaluation disponible pour générer un bulletin.");
        return;
      }

      const demoStudent = { first_name: "Jean", last_name: "Dupont" };
      const demoClass = { name: "3ème A" };
      const demoTerm = { name: "Trimestre 1" };

      const demoGrades = assessments.slice(0, 5).map((a: any) => ({
        ...a,
        score: Math.floor(Math.random() * 8) + 12, // Random score between 12-20
        description: "Bon travail, continuez ainsi."
      }));

      generateReportCard(demoStudent, demoClass, demoTerm, demoGrades, tenant);
      toast.success("Bulletin de démonstration généré et téléchargé (PDF).");
    } catch (e) {
      toast.error("Erreur lors de la génération du PDF.");
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground">Notes & Bulletins</h1>
          <p className="text-muted-foreground">Gérez les évaluations et bulletins scolaires</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleGenerateBulletins}>
            <FileText className="w-4 h-4 mr-2" />
            Générer Bulletins
          </Button>
          <Button onClick={() => setIsCreateOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Nouvelle Évaluation
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <BarChart3 className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.total}</p>
                <p className="text-xs text-muted-foreground">Évaluations</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-secondary/50 flex items-center justify-center">
                <BookOpen className="w-5 h-5 text-secondary-foreground" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.subjects}</p>
                <p className="text-xs text-muted-foreground">Matières</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-accent/50 flex items-center justify-center">
                <Users className="w-5 h-5 text-accent-foreground" />
              </div>
              <div>
                <p className="text-2xl font-bold">{classrooms?.length || 0}</p>
                <p className="text-xs text-muted-foreground">Classes</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                <Calendar className="w-5 h-5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.classrooms}</p>
                <p className="text-xs text-muted-foreground">Classes</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Rechercher une évaluation..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={selectedClassroom} onValueChange={setSelectedClassroom}>
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue placeholder="Toutes les classes" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes les classes</SelectItem>
                {classrooms?.map((classroom) => (
                  <SelectItem key={classroom.id} value={classroom.id}>
                    {classroom.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Assessments Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5" />
            Évaluations ({filteredAssessments?.length || 0})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">
              Chargement...
            </div>
          ) : filteredAssessments?.length === 0 ? (
            <div className="text-center py-12">
              <BarChart3 className="w-12 h-12 text-muted-foreground/50 mx-auto mb-4" />
              <p className="text-muted-foreground">Aucune évaluation trouvée</p>
              <p className="text-sm text-muted-foreground/70">
                Créez des évaluations pour commencer à saisir les notes
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Évaluation</TableHead>
                    <TableHead>Matière</TableHead>
                    <TableHead>Classe</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Note Max</TableHead>
                    <TableHead>Coefficient</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAssessments?.map((assessment) => (
                    <TableRow key={assessment.id}>
                      <TableCell className="font-medium">{assessment.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {(assessment.subjects as any)?.name || "-"}
                        </Badge>
                      </TableCell>
                      <TableCell>{(assessment.classrooms as any)?.name || "-"}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{assessment.type}</Badge>
                      </TableCell>
                      <TableCell>{assessment.max_score}</TableCell>
                      <TableCell>{assessment.weight}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Empty state for getting started */}
      {!isLoading && (assessments?.length === 0 || subjects?.length === 0 || classrooms?.length === 0) && (
        <Card className="border-dashed">
          <CardContent className="p-8 text-center">
            <h3 className="text-lg font-semibold mb-2">Configuration requise</h3>
            <p className="text-muted-foreground mb-4">
              Pour saisir des notes, vous devez d'abord configurer :
            </p>
            <ul className="text-sm text-muted-foreground space-y-1">
              {subjects?.length === 0 && <li>• Des matières (Paramètres → Matières)</li>}
              {classrooms?.length === 0 && <li>• Des classes (Paramètres → Classes)</li>}
              <li>• Des trimestres et années scolaires</li>
            </ul>
          </CardContent>
        </Card>
      )}
      {/* Create Assessment Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nouvelle Évaluation</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Nom de l'évaluation</Label>
              <Input
                placeholder="ex: Contrôle continu 1"
                value={newAssessment.name}
                onChange={(e) => setNewAssessment({ ...newAssessment, name: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Classe</Label>
                <Select
                  value={newAssessment.class_id}
                  onValueChange={(v) => setNewAssessment({ ...newAssessment, class_id: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choisir..." />
                  </SelectTrigger>
                  <SelectContent>
                    {classrooms?.map((c: any) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Matière</Label>
                <Select
                  value={newAssessment.subject_id}
                  onValueChange={(v) => setNewAssessment({ ...newAssessment, subject_id: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choisir..." />
                  </SelectTrigger>
                  <SelectContent>
                    {subjects?.map((s: any) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Trimestre / Semestre</Label>
                <Select
                  value={newAssessment.term_id}
                  onValueChange={(v) => setNewAssessment({ ...newAssessment, term_id: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choisir..." />
                  </SelectTrigger>
                  <SelectContent>
                    {currentTerms?.map((t: any) => (
                      <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Date</Label>
                <Input
                  type="date"
                  value={newAssessment.date}
                  onChange={(e) => setNewAssessment({ ...newAssessment, date: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Note Max</Label>
                <Input
                  type="number"
                  value={newAssessment.max_score}
                  onChange={(e) => setNewAssessment({ ...newAssessment, max_score: parseFloat(e.target.value) })}
                />
              </div>
              <div className="space-y-2">
                <Label>Coefficient</Label>
                <Input
                  type="number"
                  value={newAssessment.weight}
                  onChange={(e) => setNewAssessment({ ...newAssessment, weight: parseFloat(e.target.value) })}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>Annuler</Button>
            <Button
              onClick={() => createMutation.mutate(newAssessment)}
              disabled={createMutation.isPending || !newAssessment.name || !newAssessment.class_id || !newAssessment.subject_id}
            >
              {createMutation.isPending ? "Création..." : "Créer l'évaluation"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Grades;
