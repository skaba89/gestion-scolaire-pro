import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loader2, Trash2 } from "lucide-react";
import { StaffProfile as TeacherProfile } from "@/features/staff/types";
import { Trans, useTranslation } from "react-i18next";

interface TeacherDeleteDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    teacher: TeacherProfile | null;
    onConfirm: () => void;
    isPending: boolean;
}

export const TeacherDeleteDialog = ({
    open,
    onOpenChange,
    teacher,
    onConfirm,
    isPending,
}: TeacherDeleteDialogProps) => {
    const { t } = useTranslation();
    return (
        <AlertDialog open={open} onOpenChange={onOpenChange}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>{t("teachingAdmin.confirmerLaSuppression")}</AlertDialogTitle>
                    <AlertDialogDescription>
                        <Trans
                            i18nKey="teachingAdmin.removeTeacherConfirm"
                            values={{ name: `${teacher?.first_name ?? ""} ${teacher?.last_name ?? ""}`.trim() }}
                            components={{ strong: <strong /> }}
                        />
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>{t("teachingAdmin.annuler")}</AlertDialogCancel>
                    <AlertDialogAction
                        onClick={(e) => {
                            e.preventDefault();
                            onConfirm();
                        }}
                        className="bg-red-600 hover:bg-red-700"
                        disabled={isPending}
                    >
                        {isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />}
                        {t("teachingAdmin.supprimer")}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
};
