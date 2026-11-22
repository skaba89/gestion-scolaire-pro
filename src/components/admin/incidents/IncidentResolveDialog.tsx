import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export interface IncidentResolution {
  resolution: string;
  action_taken: string;
}

interface IncidentResolveDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (resolution: IncidentResolution) => void;
  isPending: boolean;
}

export function IncidentResolveDialog({
  open,
  onOpenChange,
  onSubmit,
  isPending,
}: IncidentResolveDialogProps) {
  const [resolution, setResolution] = useState("");
  const [actionTaken, setActionTaken] = useState("");

  useEffect(() => {
    if (!open) {
      setResolution("");
      setActionTaken("");
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Résoudre l’incident</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="incident-resolution">Résolution</Label>
            <Textarea
              id="incident-resolution"
              value={resolution}
              onChange={(event) => setResolution(event.target.value)}
              placeholder="Conclusion de l’analyse et décision prise"
              rows={3}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="incident-action">Action prise</Label>
            <Textarea
              id="incident-action"
              value={actionTaken}
              onChange={(event) => setActionTaken(event.target.value)}
              placeholder="Mesures appliquées et suivi prévu"
              rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Annuler
          </Button>
          <Button
            onClick={() => onSubmit({
              resolution: resolution.trim(),
              action_taken: actionTaken.trim(),
            })}
            disabled={!resolution.trim() || isPending}
          >
            Confirmer la résolution
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
