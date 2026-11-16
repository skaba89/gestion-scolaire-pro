import { UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";

interface TeacherHeaderProps {
    onAddClick: () => void;
}

export const TeacherHeader = ({ onAddClick }: TeacherHeaderProps) => {
    const { t } = useTranslation();
    return (
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
                <h1 className="text-2xl font-display font-bold text-foreground">
                    {t("teachingAdmin.gestionDesProfesseurs")}
                </h1>
                <p className="text-muted-foreground">
                    {t("teachingAdmin.gerezLesEnseignantsEtLeurs")}
                </p>
            </div>
            <Button onClick={onAddClick}>
                <UserPlus className="w-4 h-4 mr-2" />
                {t("teachingAdmin.ajouterUnProfesseur")}
            </Button>
        </div>
    );
};
