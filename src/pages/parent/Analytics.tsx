import { useAuth } from "@/contexts/AuthContext";
import { useTenant } from "@/contexts/TenantContext";
import { useQuery } from "@tanstack/react-query";
import { ParentAnalyticsDashboard } from "@/components/dashboard/ParentAnalyticsDashboard";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Users, BarChart3 } from "lucide-react";
import { useStudentLabel } from "@/hooks/useStudentLabel";

import { useParentData } from "@/features/parents/hooks/useParentData";
import { resolveUploadUrl } from "@/utils/url";

const ParentAnalytics = () => {
  const { user } = useAuth();
  const { tenant } = useTenant();
  const { studentLabel, StudentLabel, studentsLabel, StudentsLabel } = useStudentLabel();

  const { children, isLoading } = useParentData();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!children?.length) {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="text-center">
            <Users className="w-12 h-12 text-muted-foreground/50 mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-2">Aucun {studentLabel} associé</h3>
            <p className="text-muted-foreground">
              Contactez l'administration pour associer vos {studentsLabel} à votre compte
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <BarChart3 className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-display font-bold">Analytics détaillés</h1>
          <p className="text-muted-foreground">
            Suivez les performances de vos {studentsLabel} en détail
          </p>
        </div>
      </div>

      {children.length === 1 ? (
        <ParentAnalyticsDashboard
          studentId={(children[0].student as any)?.id}
          tenantId={tenant?.id || ""}
        />
      ) : (
        <Tabs defaultValue={String((children[0].student as any)?.id)} className="space-y-6">
          <TabsList className="flex-wrap h-auto gap-2">
            {children.map((relation) => {
              const student = relation.student as any;
              if (!student) return null;
              return (
                <TabsTrigger
                  key={student.id}
                  value={student.id}
                  className="flex items-center gap-2"
                >
                  {student.photo_url ? (
                    <img
                      src={resolveUploadUrl(student.photo_url)}
                      alt={student.first_name}
                      className="w-6 h-6 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-xs">
                      {student.first_name?.[0]}{student.last_name?.[0]}
                    </div>
                  )}
                  {student.first_name} {student.last_name}
                </TabsTrigger>
              );
            })}
          </TabsList>

          {children.map((relation) => {
            const student = relation.student as any;
            if (!student) return null;
            return (
              <TabsContent key={student.id} value={student.id}>
                <ParentAnalyticsDashboard
                  studentId={student.id}
                  tenantId={tenant?.id || ""}
                />
              </TabsContent>
            );
          })}
        </Tabs>
      )}
    </div>
  );
};

export default ParentAnalytics;
