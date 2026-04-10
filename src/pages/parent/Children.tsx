import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AttendanceHistory } from "@/components/attendance/AttendanceHistory";
import { Users } from "lucide-react";
import { parentQueries } from "@/queries/parents";
import { StaggerContainer, StaggerItem } from "@/components/ui/stagger-container";
import { TableSkeleton } from "@/components/ui/TableSkeleton";
import { useTenantUrl } from "@/hooks/useTenantUrl";

// Modular Components
import { ParentChildInfoCard } from "@/components/parent/ParentChildInfoCard";

import { useParentData } from "@/features/parents/hooks/useParentData";

const Children = () => {
  const { user } = useAuth();
  const { getTenantUrl } = useTenantUrl();
  const [selectedStudentForAttendance, setSelectedStudentForAttendance] = useState<{ id: string, name: string } | null>(null);

  const { children, isLoading } = useParentData();

  if (isLoading) {
    return <TableSkeleton columns={2} rows={5} />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground">Mes Enfants</h1>
          <p className="text-muted-foreground">Consultez les informations et résultats de vos enfants</p>
        </div>
        <div className="flex items-center gap-2 bg-primary/10 px-4 py-2 rounded-full border border-primary/5">
          <Users className="w-4 h-4 text-primary" />
          <span className="text-sm font-bold text-primary">{children?.length || 0} enfant(s)</span>
        </div>
      </div>

      {!children || children.length === 0 ? (
        <Card className="border-dashed py-12">
          <CardContent className="text-center">
            <div className="w-20 h-20 bg-muted rounded-3xl flex items-center justify-center mx-auto mb-6">
              <Users className="w-10 h-10 text-muted-foreground/30" />
            </div>
            <p className="text-xl font-bold font-display mb-2">Aucun enfant trouvé</p>
            <p className="text-muted-foreground max-w-sm mx-auto">
              Veuillez contacter l'administration de l'établissement pour associer vos enfants à votre compte parent.
            </p>
          </CardContent>
        </Card>
      ) : (
        <StaggerContainer delayChildren={0.1}>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {children.map((relation, index) => (
              <StaggerItem key={relation.id} index={index}>
                <ParentChildInfoCard
                  student={relation.student}
                  isPrimary={relation.is_primary}
                  getTenantUrl={getTenantUrl}
                  onViewAttendance={setSelectedStudentForAttendance}
                />
              </StaggerItem>
            ))}
          </div>
        </StaggerContainer>
      )}

      {/* Attendance History Modal */}
      {selectedStudentForAttendance && (
        <div className="fixed inset-0 bg-background/60 backdrop-blur-md z-50 flex items-center justify-center p-4 transition-all animate-in fade-in duration-300">
          <Card className="w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl border-primary/10 animate-in zoom-in-95 duration-300">
            <CardHeader className="flex flex-row items-center justify-between sticky top-0 bg-card z-10 border-b p-6">
              <div>
                <CardTitle className="font-display text-xl">Historique des présences</CardTitle>
                <p className="text-sm text-primary font-bold mt-1">{selectedStudentForAttendance.name}</p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="hover:bg-destructive/10 hover:text-destructive rounded-full"
                onClick={() => setSelectedStudentForAttendance(null)}
              >
                ✕
              </Button>
            </CardHeader>
            <CardContent className="pt-6 flex-1 overflow-y-auto custom-scrollbar">
              <AttendanceHistory
                studentId={selectedStudentForAttendance.id}
                studentName={selectedStudentForAttendance.name}
              />
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

export default Children;
