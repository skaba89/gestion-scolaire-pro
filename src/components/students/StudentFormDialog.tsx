import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { useTenant } from "@/contexts/TenantContext";
import { Form } from "@/components/ui/form";
import { useStudentForm } from "./form/hooks/useStudentForm";
import { StudentIdentitySection } from "./form/StudentIdentitySection";
import { StudentContactSection } from "./form/StudentContactSection";
import { StudentEnrollmentSection } from "./form/StudentEnrollmentSection";
import { StudentParentsSection } from "./form/StudentParentsSection";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/api/client";
import { useLevels } from "@/queries/levels"; // Using existing hook if available

interface StudentFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  editStudent?: any;
}

export const StudentFormDialog = ({
  open,
  onOpenChange,
  onSuccess,
  editStudent,
}: StudentFormDialogProps) => {
  const { tenant } = useTenant();

  // Fetch reference data here or inside sections. 
  // Fetching here allows passing to sections.
  const { data: departments = [] } = useQuery({
    queryKey: ["departments", tenant?.id],
    queryFn: async () => {
      const { data } = await apiClient.get('/departments/', {
        params: { tenant_id: tenant?.id },
      });
      return data.data || data || [];
    },
    enabled: !!tenant?.id,
  });

  const { data: levels = [] } = useLevels(tenant?.id);

  const {
    form,
    onSubmit,
    isSubmitting,
    selectedParents,
    setSelectedParents,
    searchParents,
    photoPreview,
    handlePhotoSelect,
    selectedOptionalSubjects,
    setSelectedOptionalSubjects
  } = useStudentForm({
    onSuccess: () => {
      onSuccess();
      onOpenChange(false);
    },
    tenantId: tenant?.id || "",
    editStudent
  });

  const handleOptionalSubjectToggle = (id: string) => {
    setSelectedOptionalSubjects(prev =>
      prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="px-6 py-4 border-b">
          <DialogTitle>
            {editStudent ? "Modifier l'étudiant" : "Nouvel étudiant"}
          </DialogTitle>
          <DialogDescription>
            Remplissez les informations ci-dessous pour {editStudent ? "modifier" : "créer"} un dossier étudiant.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex-1 overflow-hidden flex flex-col">
            <ScrollArea className="flex-1 px-6 py-4">
              <Tabs defaultValue="identity" className="w-full">
                <TabsList className="grid w-full grid-cols-4 mb-6">
                  <TabsTrigger value="identity">Identité</TabsTrigger>
                  <TabsTrigger value="contact">Contact</TabsTrigger>
                  <TabsTrigger value="academic">Scolarité</TabsTrigger>
                  <TabsTrigger value="parents">Parents</TabsTrigger>
                </TabsList>

                <TabsContent value="identity" className="space-y-6">
                  <StudentIdentitySection
                    form={form}
                    photoPreview={photoPreview}
                    handlePhotoSelect={handlePhotoSelect}
                  />
                </TabsContent>

                <TabsContent value="contact" className="space-y-6">
                  <StudentContactSection form={form} />
                </TabsContent>

                <TabsContent value="academic" className="space-y-6">
                  <StudentEnrollmentSection
                    form={form}
                    departments={departments}
                    levels={levels}
                    selectedOptionalSubjects={selectedOptionalSubjects}
                    onOptionalSubjectToggle={handleOptionalSubjectToggle}
                  />
                </TabsContent>

                <TabsContent value="parents" className="space-y-6">
                  <StudentParentsSection
                    selectedParents={selectedParents}
                    onRemoveParent={(id) => setSelectedParents(prev => prev.filter(p => p.id !== id))}
                    onAddParent={(parent) => setSelectedParents(prev => [...prev, parent])}
                    searchParents={searchParents}
                    tenantId={tenant?.id || ""}
                  />
                </TabsContent>
              </Tabs>
            </ScrollArea>

            <div className="p-6 border-t bg-muted/20 flex justify-end space-x-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Annuler
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {editStudent ? "Mettre à jour" : "Créer l'étudiant"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};
