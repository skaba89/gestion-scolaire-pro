import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface SurveyResultsDialogProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    questions: any[] | null;
}

export const SurveyResultsDialog = ({
    isOpen,
    onOpenChange,
    questions,
}: SurveyResultsDialogProps) => {
    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle>Résultats du sondage</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                    {questions && questions.length > 0 ? (
                        questions.map((question, index) => (
                            <Card key={question.id}>
                                <CardHeader className="pb-2 text-left">
                                    <CardTitle className="text-sm">
                                        Q{index + 1}: {question.question_text}
                                    </CardTitle>
                                    <CardDescription>
                                        Type: {question.question_type}
                                    </CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <p className="text-sm text-muted-foreground text-left">
                                        Les résultats détaillés seront affichés ici
                                    </p>
                                </CardContent>
                            </Card>
                        ))
                    ) : (
                        <div className="text-center py-8">
                            <p className="text-muted-foreground">
                                Aucune question définie pour ce sondage.
                                <br />
                                Ajoutez des questions pour commencer à collecter des réponses.
                            </p>
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
};
