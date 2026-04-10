/**
 * TeacherHomework Page
 * Refactored to use feature-based architecture and modular UI
 */

import { useState } from "react";
import { HomeworkList, HomeworkForm, homeworkService } from "@/features/homework";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, BookOpen, Calendar, Clock, BookMarked, FileText } from "lucide-react";
import type { Homework } from "@/features/homework";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

export default function TeacherHomework() {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedHomework, setSelectedHomework] = useState<Homework | undefined>(undefined);
  const [viewingHomework, setViewingHomework] = useState<Homework | null>(null);
  const [isViewOpen, setIsViewOpen] = useState(false);

  const handleEditStart = (homework: Homework) => {
    setSelectedHomework(homework);
    setIsOpen(true);
  };

  const handleSuccess = () => {
    setSelectedHomework(undefined);
    setIsOpen(false);
  };

  const handleView = async (id: string) => {
    try {
      const homework = await homeworkService.getHomework(id);
      setViewingHomework(homework as unknown as Homework);
      setIsViewOpen(true);
    } catch {
      // If the detailed fetch fails, find from list
      const hw = (await homeworkService.listHomework("")).find((h) => h.id === id);
      if (hw) {
        setViewingHomework(hw);
        setIsViewOpen(true);
      }
    }
  };

  const getDueDateLabel = (dueDate: string) => {
    const date = new Date(dueDate);
    const now = new Date();
    const diffDays = Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays < 0) return { text: `En retard de ${Math.abs(diffDays)}j`, variant: "destructive" as const };
    if (diffDays === 0) return { text: "À rendre aujourd'hui", variant: "default" as const };
    if (diffDays <= 3) return { text: `Dans ${diffDays} jour(s)`, variant: "secondary" as const };
    return { text: format(date, "dd MMM yyyy", { locale: fr }), variant: "outline" as const };
  };

  const submissions = (viewingHomework as any)?.homework_submissions || [];
  const dueInfo = viewingHomework?.due_date ? getDueDateLabel(viewingHomework.due_date) : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <BookOpen className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-display font-bold">Gestion des Devoirs</h1>
          </div>
          <p className="text-muted-foreground">
            Créez et gérez les devoirs pour vos classes
          </p>
        </div>

        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <Button
              size="lg"
              className="group transition-all"
              onClick={() => setSelectedHomework(undefined)}
            >
              <Plus className="mr-2 h-4 w-4 group-hover:rotate-90 transition-transform" />
              Nouveau Devoir
            </Button>
          </DialogTrigger>

          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>
                {selectedHomework ? "Modifier le devoir" : "Créer un nouveau devoir"}
              </DialogTitle>
            </DialogHeader>

            <HomeworkForm
              homework={selectedHomework}
              onSuccess={handleSuccess}
              onCancel={() => {
                setSelectedHomework(undefined);
                setIsOpen(false);
              }}
            />
          </DialogContent>
        </Dialog>
      </div>

      {/* Homework List Container */}
      <div className="bg-card rounded-xl border border-primary/10 overflow-hidden shadow-sm">
        <HomeworkList
          onEdit={handleEditStart}
          onView={handleView}
        />
      </div>

      {/* View Homework Dialog */}
      <Dialog open={isViewOpen} onOpenChange={setIsViewOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BookMarked className="h-5 w-5 text-primary" />
              {viewingHomework?.title || "Détails du devoir"}
            </DialogTitle>
          </DialogHeader>

          {viewingHomework ? (
            <div className="space-y-4">
              {/* Status & Due Date */}
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant={viewingHomework.status === "PUBLISHED" ? "default" : "secondary"}>
                  {viewingHomework.status || "Brouillon"}
                </Badge>
                {dueInfo && (
                  <Badge variant={dueInfo.variant}>
                    <Clock className="h-3 w-3 mr-1" />
                    {dueInfo.text}
                  </Badge>
                )}
                {viewingHomework.max_points && (
                  <Badge variant="outline">
                    <FileText className="h-3 w-3 mr-1" />
                    {viewingHomework.max_points} pts
                  </Badge>
                )}
              </div>

              {/* Description */}
              {viewingHomework.description && (
                <Card>
                  <CardContent className="p-4">
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                      {viewingHomework.description}
                    </p>
                  </CardContent>
                </Card>
              )}

              {/* Details Grid */}
              <div className="grid grid-cols-2 gap-3">
                {viewingHomework.due_date && (
                  <div className="flex items-center gap-2 text-sm">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Date limite :</span>
                    <span className="font-medium">
                      {format(new Date(viewingHomework.due_date), "dd MMM yyyy", { locale: fr })}
                    </span>
                  </div>
                )}
                {viewingHomework.due_time && (
                  <div className="flex items-center gap-2 text-sm">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Heure :</span>
                    <span className="font-medium">{viewingHomework.due_time}</span>
                  </div>
                )}
              </div>

              {/* Submissions Summary */}
              {submissions.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">
                      Soumissions ({submissions.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 pt-0">
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="p-2 bg-muted/50 rounded-lg">
                        <p className="text-lg font-bold">{submissions.length}</p>
                        <p className="text-xs text-muted-foreground">Total</p>
                      </div>
                      <div className="p-2 bg-muted/50 rounded-lg">
                        <p className="text-lg font-bold">
                          {submissions.filter((s: any) => s.graded_at).length}
                        </p>
                        <p className="text-xs text-muted-foreground">Notés</p>
                      </div>
                      <div className="p-2 bg-muted/50 rounded-lg">
                        <p className="text-lg font-bold">
                          {submissions.filter((s: any) => !s.graded_at).length}
                        </p>
                        <p className="text-xs text-muted-foreground">En attente</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Actions */}
              <div className="flex gap-2 pt-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    setIsViewOpen(false);
                    if (viewingHomework) handleEditStart(viewingHomework);
                  }}
                >
                  Modifier
                </Button>
                <Button
                  variant="default"
                  className="flex-1"
                  onClick={() => setIsViewOpen(false)}
                >
                  Fermer
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3 py-4">
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-20 w-full" />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
