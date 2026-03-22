import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Trash2, BookOpen, School, Loader2 } from "lucide-react";

interface TeacherAssignmentsDialogProps {
  teacher: {
    id: string;
    first_name: string | null;
    last_name: string | null;
  };
  tenantId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const TeacherAssignmentsDialog = ({
  teacher,
  tenantId,
  open,
  onOpenChange,
}: TeacherAssignmentsDialogProps) => {
  const queryClient = useQueryClient();
  const [selectedClassroom, setSelectedClassroom] = useState("");
  const [selectedSubject, setSelectedSubject] = useState("");

  // Fetch existing assignments
  const { data: assignments, isLoading } = useQuery({
    queryKey: ["teacher-assignments", teacher.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("teacher_assignments")
        .select(`
          id,
          class_id,
          subject_id,
          classrooms (name),
          subjects (name)
        `)
        .eq("teacher_id", teacher.id)
        .eq("tenant_id", tenantId);

      if (error) throw error;
      return data;
    },
    enabled: open && !!teacher.id,
  });

  // Fetch classrooms
  const { data: classrooms } = useQuery({
    queryKey: ["classrooms-for-assignment", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("classrooms")
        .select("id, name")
        .eq("tenant_id", tenantId)
        .order("name");
      if (error) throw error;
      return data;
    },
    enabled: open,
  });

  // Fetch subjects
  const { data: subjects } = useQuery({
    queryKey: ["subjects-for-assignment", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subjects")
        .select("id, name")
        .eq("tenant_id", tenantId)
        .order("name");
      if (error) throw error;
      return data;
    },
    enabled: open,
  });

  const addAssignmentMutation = useMutation({
    mutationFn: async () => {
      if (!selectedClassroom || !selectedSubject) {
        throw new Error("Veuillez sélectionner une classe et une matière");
      }

      const { error } = await supabase
        .from("teacher_assignments")
        .insert({
          teacher_id: teacher.id,
          class_id: selectedClassroom,
          subject_id: selectedSubject,
          tenant_id: tenantId,
        });

      if (error) {
        if (error.code === "23505") {
          throw new Error("Cette assignation existe déjà");
        }
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["teacher-assignments"] });
      toast.success("Assignation ajoutée");
      setSelectedClassroom("");
      setSelectedSubject("");
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const removeAssignmentMutation = useMutation({
    mutationFn: async (assignmentId: string) => {
      const { error } = await supabase
        .from("teacher_assignments")
        .delete()
        .eq("id", assignmentId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["teacher-assignments"] });
      toast.success("Assignation supprimée");
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[95vh] flex flex-col p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookOpen className="w-5 h-5" />
            Assignations de {teacher.first_name} {teacher.last_name}
          </DialogTitle>
          <DialogDescription>
            Assignez des matières et classes à ce professeur
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 px-1 overflow-y-auto">
          <div className="space-y-6 py-4">
            {/* Add new assignment */}
            <div className="space-y-4 p-4 border rounded-lg bg-muted/30">
              <h4 className="font-medium">Nouvelle assignation</h4>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Classe</Label>
                  <Select value={selectedClassroom} onValueChange={setSelectedClassroom}>
                    <SelectTrigger>
                      <SelectValue placeholder="Sélectionner" />
                    </SelectTrigger>
                    <SelectContent>
                      {classrooms?.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Matière</Label>
                  <Select value={selectedSubject} onValueChange={setSelectedSubject}>
                    <SelectTrigger>
                      <SelectValue placeholder="Sélectionner" />
                    </SelectTrigger>
                    <SelectContent>
                      {subjects?.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button
                className="w-full"
                onClick={() => addAssignmentMutation.mutate()}
                disabled={!selectedClassroom || !selectedSubject || addAssignmentMutation.isPending}
              >
                {addAssignmentMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Plus className="w-4 h-4 mr-2" />
                )}
                Ajouter l'assignation
              </Button>
            </div>

            {/* Current assignments */}
            <div className="space-y-3">
              <h4 className="font-medium">Assignations actuelles</h4>
              {isLoading ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              ) : assignments && assignments.length > 0 ? (
                <div className="space-y-2">
                  {assignments.map((assignment: any) => (
                    <div
                      key={assignment.id}
                      className="flex items-center justify-between p-3 border rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="gap-1">
                            <School className="w-3 h-3" />
                            {assignment.classrooms?.name}
                          </Badge>
                          <Badge variant="secondary" className="gap-1">
                            <BookOpen className="w-3 h-3" />
                            {assignment.subjects?.name}
                          </Badge>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeAssignmentMutation.mutate(assignment.id)}
                        disabled={removeAssignmentMutation.isPending}
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground border rounded-lg bg-muted/20">
                  <BookOpen className="w-10 h-10 mx-auto mb-2 opacity-50" />
                  <p>Aucune assignation</p>
                </div>
              )}
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};

export default TeacherAssignmentsDialog;
