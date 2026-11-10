import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";

export interface TransferClassOption {
  id: string;
  name: string;
}

interface TransferEnrollmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studentName: string;
  /** Classes de la même année, hors classe actuelle. */
  classes: TransferClassOption[];
  isPending: boolean;
  /** Renvoie true si le transfert a réussi (la boîte se ferme). */
  onConfirm: (classId: string) => Promise<boolean>;
}

/** Changement de classe d'un élève dans la même année (opération unique). */
export const TransferEnrollmentDialog = ({
  open, onOpenChange, studentName, classes, isPending, onConfirm,
}: TransferEnrollmentDialogProps) => {
  const { t } = useTranslation();
  const [classId, setClassId] = useState("");

  const close = (next: boolean) => {
    if (!next) setClassId("");
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("enrollments.transfer.title")}</DialogTitle>
          <DialogDescription>{t("enrollments.transfer.description", { name: studentName })}</DialogDescription>
        </DialogHeader>
        {classes.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("enrollments.transfer.noOtherClass")}</p>
        ) : (
          <div className="space-y-2">
            <Label htmlFor="transfer-target-class">{t("enrollments.transfer.targetClass")}</Label>
            <Select value={classId} onValueChange={setClassId}>
              <SelectTrigger id="transfer-target-class">
                <SelectValue placeholder={t("enrollments.transfer.chooseClass")} />
              </SelectTrigger>
              <SelectContent>
                {classes.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => close(false)} disabled={isPending}>
            {t("enrollments.transfer.cancel")}
          </Button>
          <Button
            onClick={async () => {
              if (await onConfirm(classId)) close(false);
            }}
            disabled={!classId || isPending}
          >
            {isPending && <Loader2 className="w-4 h-4 me-2 animate-spin" />}
            {t("enrollments.transfer.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
