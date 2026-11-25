import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { classroomQueries } from "@/queries/classrooms";
import type { AdmissionApplication } from "@/queries/admissions";

const NO_CLASS = "";

interface ConvertAdmissionDialogProps {
  tenantId: string;
  application: AdmissionApplication | null;
  /** Compte limité à des cycles : la classe est obligatoire (le serveur refuse sinon). */
  classRequired: boolean;
  isPending: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (classId: string | undefined) => void;
}

/**
 * « Inscrire » une candidature acceptée (lot Admissions, Q-A1) : choix de la classe où l'élève est
 * inscrit dans la même opération. Les classes proposées sont celles que le serveur renvoie (déjà
 * limitées aux cycles du compte), restreintes au niveau demandé par la candidature.
 */
export function ConvertAdmissionDialog({
  tenantId, application, classRequired, isPending, onOpenChange, onConfirm,
}: ConvertAdmissionDialogProps) {
  const { t } = useTranslation();
  const [classId, setClassId] = useState(NO_CLASS);
  const { data: classrooms = [], isLoading } = useQuery({
    ...classroomQueries.all(tenantId),
    enabled: !!tenantId && !!application,
  });

  useEffect(() => setClassId(NO_CLASS), [application?.id]);

  const options = useMemo(() => {
    const level = application?.level_id;
    return (Array.isArray(classrooms) ? classrooms : [])
      .filter((c) => !level || !c.level_id || c.level_id === level)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [classrooms, application?.level_id]);

  const canConfirm = !isPending && (!classRequired || classId !== NO_CLASS);

  return (
    <Dialog open={!!application} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("admissions.convertDialog.title")}</DialogTitle>
          <DialogDescription>
            {application ? `${application.student_first_name} ${application.student_last_name}` : ""}
            {" — "}
            {t(classRequired ? "admissions.convertDialog.descriptionRequired" : "admissions.convertDialog.description")}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="convert-admission-class">{t("admissions.convertDialog.classLabel")}</Label>
          <select
            id="convert-admission-class"
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            value={classId}
            disabled={isLoading || isPending}
            onChange={(event) => setClassId(event.target.value)}
          >
            <option value={NO_CLASS}>
              {t(classRequired ? "admissions.convertDialog.choose" : "admissions.convertDialog.noClass")}
            </option>
            {options.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          {!isLoading && options.length === 0 && (
            <p className="text-sm text-muted-foreground">{t("admissions.convertDialog.noClassAvailable")}</p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            {t("admissions.convertDialog.cancel")}
          </Button>
          <Button onClick={() => onConfirm(classId || undefined)} disabled={!canConfirm}>
            {t("admissions.convertDialog.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
