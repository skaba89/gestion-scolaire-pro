import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/api/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTenant } from "@/contexts/TenantContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import {
  Target,
  Plus,
  User,
  Calendar,
  CheckCircle2,
  AlertTriangle,
  TrendingUp,
  BookOpen,
  ListTodo
} from "lucide-react";
import { useStudentLabel } from "@/hooks/useStudentLabel";

export default function SuccessPlans() {
  const { user } = useAuth();
  const { tenant } = useTenant();
  const { studentLabel, StudentLabel, studentsLabel } = useStudentLabel();
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<any>(null);
  const [formData, setFormData] = useState({
    student_id: "",
    title: "",
    description: "",
    start_date: "",
    end_date: "",
    priority: "medium",
  });

  const { data: students } = useQuery({
    queryKey: ["students-simple", tenant?.id],
    queryFn: async () => {
      const response = await apiClient.get<any[]>("/students/", {
        params: { ordering: "last_name" }
      });
      return response.data;
    },
    enabled: !!tenant?.id,
  });

  const { data: plans, isLoading } = useQuery({
    queryKey: ["success-plans", tenant?.id],
    queryFn: async () => {
      const response = await apiClient.get<any[]>("/school-life/success-plans/");
      return response.data;
    },
    enabled: !!tenant?.id,
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      await apiClient.post("/school-life/success-plans/", {
        tenant_id: tenant?.id,
        student_id: data.student_id,
        created_by: user?.id,
        title: data.title,
        description: data.description,
        start_date: data.start_date,
        end_date: data.end_date || null,
        priority: data.priority,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["success-plans"] });
      setIsOpen(false);
      setFormData({ student_id: "", title: "", description: "", start_date: "", end_date: "", priority: "medium" });
      toast.success("Plan de réussite créé");
    },
    onError: () => {
      toast.error("Erreur lors de la création");
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      await apiClient.patch(`/school-life/success-plans/${id}/`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["success-plans"] });
      toast.success("Statut mis à jour");
    },
  });

  const getStatusBadge = (status: string) => {
    const configs: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; label: string }> = {
      DRAFT: { variant: "outline", label: "Brouillon" },
      ACTIVE: { variant: "default", label: "Actif" },
      COMPLETED: { variant: "secondary", label: "Terminé" },
      CANCELLED: { variant: "destructive", label: "Annulé" },
    };
    const config = configs[status] || configs.DRAFT;
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const getPriorityBadge = (priority: string) => {
    const configs: Record<string, { className: string; label: string }> = {
      low: { className: "bg-gray-100 text-gray-800", label: "Basse" },
      medium: { className: "bg-blue-100 text-blue-800", label: "Moyenne" },
      high: { className: "bg-orange-100 text-orange-800", label: "Haute" },
      urgent: { className: "bg-red-100 text-red-800", label: "Urgente" },
    };
    const config = configs[priority] || configs.medium;
    return <Badge className={config.className}>{config.label}</Badge>;
  };

  const calculateProgress = (objectives: any[]) => {
    if (!objectives?.length) return 0;
    const achieved = objectives.filter(o => o.status === "achieved").length;
    return Math.round((achieved / objectives.length) * 100);
  };

  const activePlans = plans?.filter(p => p.status === "ACTIVE") || [];
  const draftPlans = plans?.filter(p => p.status === "DRAFT") || [];
  const completedPlans = plans?.filter(p => ["COMPLETED", "CANCELLED"].includes(p.status)) || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Target className="h-8 w-8 text-primary" />
            Plans de Réussite
          </h1>
          <p className="text-muted-foreground">
            Accompagnez les {studentsLabel} avec des plans personnalisés
          </p>
        </div>
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 h-4 mr-2" />
              Nouveau plan
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Créer un plan de réussite</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>{StudentLabel}</Label>
                <Select
                  value={formData.student_id}
                  onValueChange={(value) => setFormData({ ...formData, student_id: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={`Sélectionner un ${studentLabel}`} />
                  </SelectTrigger>
                  <SelectContent>
                    {students?.map((student: any) => (
                      <SelectItem key={student.id} value={student.id}>
                        {student.first_name} {student.last_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Titre du plan</Label>
                <Input
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="Plan de soutien en mathématiques"
                />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Objectifs et stratégies..."
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Date de début</Label>
                  <Input
                    type="date"
                    value={formData.start_date}
                    onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Date de fin (optionnel)</Label>
                  <Input
                    type="date"
                    value={formData.end_date}
                    onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Priorité</Label>
                <Select
                  value={formData.priority}
                  onValueChange={(value) => setFormData({ ...formData, priority: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Basse</SelectItem>
                    <SelectItem value="medium">Moyenne</SelectItem>
                    <SelectItem value="high">Haute</SelectItem>
                    <SelectItem value="urgent">Urgente</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button
                onClick={() => createMutation.mutate(formData)}
                disabled={!formData.student_id || !formData.title || !formData.start_date || createMutation.isPending}
                className="w-full"
              >
                Créer le plan
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{activePlans.length}</div>
            <p className="text-sm text-muted-foreground">Plans actifs</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{draftPlans.length}</div>
            <p className="text-sm text-muted-foreground">En préparation</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">
              {plans?.reduce((acc, p) => acc + (p.objectives?.length || 0), 0) || 0}
            </div>
            <p className="text-sm text-muted-foreground">Objectifs totaux</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-green-600">
              {completedPlans.filter(p => p.status === "completed").length}
            </div>
            <p className="text-sm text-muted-foreground">Plans réussis</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="active" className="space-y-4">
        <TabsList>
          <TabsTrigger value="active">Actifs ({activePlans.length})</TabsTrigger>
          <TabsTrigger value="draft">Brouillons ({draftPlans.length})</TabsTrigger>
          <TabsTrigger value="completed">Terminés ({completedPlans.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="active" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {activePlans.map((plan: any) => (
              <Card key={plan.id} className="hover:shadow-md transition-shadow">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">{plan.title}</CardTitle>
                    {getPriorityBadge(plan.priority)}
                  </div>
                  <CardDescription className="flex items-center gap-1">
                    <User className="h-3 w-3" />
                    {plan.student?.first_name} {plan.student?.last_name}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span>Progression</span>
                      <span>{calculateProgress(plan.objectives)}%</span>
                    </div>
                    <Progress value={calculateProgress(plan.objectives)} />
                  </div>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <ListTodo className="h-4 w-4" />
                      {plan.objectives?.length || 0} objectifs
                    </span>
                    <span className="flex items-center gap-1">
                      <BookOpen className="h-4 w-4" />
                      {plan.interventions?.length || 0} interventions
                    </span>
                  </div>
                  {plan.end_date && (
                    <div className="flex items-center gap-1 text-sm text-muted-foreground">
                      <Calendar className="h-4 w-4" />
                      Échéance: {format(new Date(plan.end_date), "d MMM yyyy", { locale: fr })}
                    </div>
                  )}
                </CardContent>
                <CardFooter className="flex gap-2">
                  <Button variant="outline" size="sm" className="flex-1" onClick={() => setSelectedPlan(plan)}>
                    Voir détails
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => updateStatusMutation.mutate({ id: plan.id, status: "COMPLETED" })}
                  >
                    <CheckCircle2 className="h-4 w-4" />
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="draft" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {draftPlans.map((plan: any) => (
              <Card key={plan.id}>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center justify-between">
                    {plan.title}
                    {getStatusBadge(plan.status)}
                  </CardTitle>
                  <CardDescription>
                    {plan.student?.first_name} {plan.student?.last_name}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground line-clamp-2">{plan.description}</p>
                </CardContent>
                <CardFooter>
                  <Button
                    size="sm"
                    className="w-full"
                    onClick={() => updateStatusMutation.mutate({ id: plan.id, status: "ACTIVE" })}
                  >
                    Activer le plan
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="completed" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {completedPlans.map((plan: any) => (
              <Card key={plan.id} className="opacity-75">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center justify-between">
                    {plan.title}
                    {getStatusBadge(plan.status)}
                  </CardTitle>
                  <CardDescription>
                    {plan.student?.first_name} {plan.student?.last_name}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-sm text-muted-foreground">
                    Progression finale: {calculateProgress(plan.objectives)}%
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
