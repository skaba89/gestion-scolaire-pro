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
    return (
        <AlertDialog open={open} onOpenChange={onOpenChange}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Confirmer la suppression</AlertDialogTitle>
                    <AlertDialogDescription>
                        Êtes-vous sûr de vouloir retirer le rôle de professeur à **{teacher?.first_name} {teacher?.last_name}** ?
                        L'utilisateur conservera son compte mais n'aura plus accès aux fonctions d'enseignant dans cet établissement.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Annuler</AlertDialogCancel>
                    <AlertDialogAction
                        onClick={(e) => {
                            e.preventDefault();
                            onConfirm();
                        }}
                        className="bg-red-600 hover:bg-red-700"
                        disabled={isPending}
                    >
                        {isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />}
                        Supprimer
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
};
