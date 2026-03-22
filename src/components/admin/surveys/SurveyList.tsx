import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ClipboardList, Users, Eye, Edit, Trash2, Plus } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { audienceConfig, getSurveyStatus } from "./constants";

interface SurveyListProps {
    surveys: any[] | null;
    responseCounts: Record<string, number> | null;
    onEdit: (survey: any) => void;
    onDelete: (id: string) => void;
    onViewResults: (id: string) => void;
    onNewSurvey: () => void;
}

export const SurveyList = ({
    surveys,
    responseCounts,
    onEdit,
    onDelete,
    onViewResults,
    onNewSurvey,
}: SurveyListProps) => {
    if (!surveys || surveys.length === 0) {
        return (
            <Card className="p-8 text-center">
                <ClipboardList className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-2">Aucun sondage</h3>
                <p className="text-muted-foreground mb-4">
                    Créez votre premier sondage pour recueillir l'avis de la communauté
                </p>
                <Button onClick={onNewSurvey}>
                    <Plus className="h-4 w-4 mr-2" />
                    Créer un sondage
                </Button>
            </Card>
        );
    }

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {surveys.map((survey) => {
                const status = getSurveyStatus(survey);
                const responseCount = responseCounts?.[survey.id] || 0;
                return (
                    <Card key={survey.id}>
                        <CardHeader>
                            <div className="flex items-start justify-between">
                                <div className="flex items-center gap-2">
                                    <ClipboardList className="h-5 w-5 text-primary" />
                                    <CardTitle className="text-lg">{survey.title}</CardTitle>
                                </div>
                                <Badge className={status.color}>{status.label}</Badge>
                            </div>
                            <CardDescription className="line-clamp-2">{survey.description}</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-3">
                                <div className="flex items-center justify-between text-sm">
                                    <span className="text-muted-foreground text-left">Public cible:</span>
                                    <Badge variant="outline">
                                        {audienceConfig[survey.target_audience as keyof typeof audienceConfig]?.label || survey.target_audience}
                                    </Badge>
                                </div>
                                <div className="flex items-center justify-between text-sm">
                                    <span className="text-muted-foreground text-left">Réponses:</span>
                                    <span className="font-medium">{responseCount}</span>
                                </div>
                                {survey.is_anonymous && (
                                    <Badge variant="secondary" className="text-xs">
                                        Anonyme
                                    </Badge>
                                )}
                                {survey.ends_at && (
                                    <div className="text-xs text-muted-foreground">
                                        Fin: {format(new Date(survey.ends_at), "dd MMMM yyyy", { locale: fr })}
                                    </div>
                                )}
                                <div className="flex justify-end gap-2 pt-2">
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => onViewResults(survey.id)}
                                    >
                                        <Eye className="h-4 w-4" />
                                    </Button>
                                    <Button variant="ghost" size="sm" onClick={() => onEdit(survey)}>
                                        <Edit className="h-4 w-4" />
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => {
                                            if (confirm("Supprimer ce sondage ?")) {
                                                onDelete(survey.id);
                                            }
                                        }}
                                    >
                                        <Trash2 className="h-4 w-4 text-destructive" />
                                    </Button>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                );
            })}
        </div>
    );
};
