/**
 * TeacherHomework Page
 * Refactored to use feature-based architecture and modular UI
 */

import { useState } from "react";
import { HomeworkList, HomeworkForm } from "@/features/homework";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, BookOpen } from "lucide-react";
import type { Homework } from "@/features/homework";

export default function TeacherHomework() {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedHomework, setSelectedHomework] = useState<Homework | undefined>(undefined);

  const handleEditStart = (homework: Homework) => {
    setSelectedHomework(homework);
    setIsOpen(true);
  };

  const handleSuccess = () => {
    setSelectedHomework(undefined);
    setIsOpen(false);
  };

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
          onView={(id) => {
            console.log("View homework:", id);
          }}
        />
      </div>
    </div>
  );
}
