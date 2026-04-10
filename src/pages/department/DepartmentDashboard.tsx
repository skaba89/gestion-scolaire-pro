import { useDepartmentDashboard } from "@/features/departments/hooks/useDepartment";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Building2, Users, GraduationCap, BookOpen,
  Calendar, ClipboardCheck, TrendingUp, AlertCircle
} from "lucide-react";
import { DepartmentDashboardCharts } from "@/components/dashboard/DepartmentDashboardCharts";

const DepartmentDashboard = () => {
  const { data, isLoading } = useDepartmentDashboard();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (!data?.department) {
    return (
      <div className="text-center py-12">
        <Building2 className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
        <h2 className="text-xl font-bold mb-2">Aucun département assigné</h2>
        <p className="text-muted-foreground">
          Vous n'êtes pas encore assigné comme chef de département.
          Contactez l'administration pour obtenir l'accès.
        </p>
      </div>
    );
  }

  const { department, stats, recent_activities } = data;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-100 rounded-lg">
              <Building2 className="h-6 w-6 text-indigo-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">{department.name}</h1>
              {department.code && (
                <Badge variant="outline" className="mt-1">{department.code}</Badge>
              )}
            </div>
          </div>
          {department.description && (
            <p className="text-muted-foreground mt-2">{department.description}</p>
          )}
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Étudiants</p>
                <p className="text-2xl font-bold">{stats.totalStudents}</p>
              </div>
              <Users className="h-8 w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Enseignants</p>
                <p className="text-2xl font-bold">{stats.totalTeachers}</p>
              </div>
              <GraduationCap className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Matières</p>
                <p className="text-2xl font-bold">{stats.totalSubjects}</p>
              </div>
              <BookOpen className="h-8 w-8 text-purple-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Assiduité</p>
                <p className="text-2xl font-bold">{stats.attendanceRate}%</p>
              </div>
              <ClipboardCheck className="h-8 w-8 text-orange-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <DepartmentDashboardCharts departmentId={department.id} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Activity */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Activité Récente
            </CardTitle>
            <CardDescription>Dernières notes et événements du département</CardDescription>
          </CardHeader>
          <CardContent>
            {recent_activities.length === 0 ? (
              <p className="text-center text-muted-foreground py-4">
                Aucune activité récente
              </p>
            ) : (
              <div className="space-y-3">
                {recent_activities.map((activity, idx) => (
                  <div key={idx} className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                    <div className="p-1.5 bg-blue-100 rounded">
                      <BookOpen className="h-4 w-4 text-blue-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm">{activity.description}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(activity.time).toLocaleDateString("fr-FR", {
                          day: "numeric", month: "short",
                          hour: "2-digit", minute: "2-digit"
                        })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Alerts */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5" />
              À surveiller
            </CardTitle>
            <CardDescription>Points nécessitant votre attention</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {stats.attendanceRate < 80 && (
                <div className="flex items-start gap-3 p-3 rounded-lg bg-orange-50 border border-orange-200">
                  <AlertCircle className="h-5 w-5 text-orange-500 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-orange-800">Taux d'assiduité faible</p>
                    <p className="text-xs text-orange-600">
                      Le taux d'assiduité est de {stats.attendanceRate}% (objectif: 80%)
                    </p>
                  </div>
                </div>
              )}
              <div className="flex items-start gap-3 p-3 rounded-lg bg-blue-50 border border-blue-200">
                <Calendar className="h-5 w-5 text-blue-500 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-blue-800">Planification</p>
                  <p className="text-xs text-blue-600">
                    Vérifiez les emplois du temps et examens à venir
                    {stats.upcomingExams > 0 && ` — ${stats.upcomingExams} examen(s) planifié(s)`}
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default DepartmentDashboard;
