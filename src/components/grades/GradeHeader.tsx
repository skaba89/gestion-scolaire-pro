import { FileText, Plus } from "lucide-react";
import { useTerminology } from "@/hooks/useTerminology";
import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";

interface GradeHeaderProps {
    onAddClick: () => void;
    onGenerateBulletins: () => void;
}

export const GradeHeader = ({ onAddClick, onGenerateBulletins }: GradeHeaderProps) => {
    const { t } = useTranslation();
    const { gradeLabel, termLabel } = useTerminology();
    return (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
                <h1 className="text-2xl font-display font-bold text-foreground">{gradeLabel}s & {termLabel}s</h1>
                <p className="text-muted-foreground">{t("teachingAdmin.gerezLesEvaluationsEtDocuments")}</p>
            </div>
            <div className="flex gap-2">
                <Button variant="outline" onClick={onGenerateBulletins}>
                    <FileText className="w-4 h-4 mr-2" />
                    {t("teachingAdmin.genererTermlabelS", { termLabel })}
                </Button>
                <Button onClick={onAddClick}>
                    <Plus className="w-4 h-4 mr-2" />
                    {t("teachingAdmin.nouvelleEvaluation")}
                </Button>
            </div>
        </div>
    );
};
