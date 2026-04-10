import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

interface SurveyHeaderProps {
    onNewSurvey: () => void;
}

export const SurveyHeader = ({ onNewSurvey }: SurveyHeaderProps) => {
    return (
        <div className="flex items-center justify-between">
            <div>
                <h1 className="text-3xl font-bold">Sondages</h1>
                <p className="text-muted-foreground">
                    Créez et gérez les sondages pour recueillir l'avis de la communauté
                </p>
            </div>
            <Button onClick={onNewSurvey}>
                <Plus className="h-4 w-4 mr-2" />
                Nouveau Sondage
            </Button>
        </div>
    );
};
