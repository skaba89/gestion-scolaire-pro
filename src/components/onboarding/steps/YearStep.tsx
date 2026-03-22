import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Calendar, Plus, Trash2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useState } from "react";

interface YearStepProps {
    data: any;
    onUpdate: (data: any) => void;
}

export const YearStep = ({ data, onUpdate }: YearStepProps) => {
    const [terms, setTerms] = useState(data.terms || []);

    const handleAddTerm = () => {
        const newTerms = [...terms, { name: `Trimestre ${terms.length + 1}`, start_date: '', end_date: '' }];
        setTerms(newTerms);
        onUpdate({ ...data, terms: newTerms });
    };

    const handleRemoveTerm = (index: number) => {
        const newTerms = terms.filter((_: any, i: number) => i !== index);
        setTerms(newTerms);
        onUpdate({ ...data, terms: newTerms });
    };

    const handleTermChange = (index: number, field: string, value: string) => {
        const newTerms = [...terms];
        newTerms[index] = { ...newTerms[index], [field]: value };
        setTerms(newTerms);
        onUpdate({ ...data, terms: newTerms });
    };

    const handleUseTemplate = () => {
        const currentYear = new Date().getFullYear();
        const template = [
            { name: "Trimestre 1", start_date: `${currentYear}-09-01`, end_date: `${currentYear}-12-20` },
            { name: "Trimestre 2", start_date: `${currentYear + 1}-01-05`, end_date: `${currentYear + 1}-04-05` },
            { name: "Trimestre 3", start_date: `${currentYear + 1}-04-20`, end_date: `${currentYear + 1}-07-05` }
        ];
        setTerms(template);
        onUpdate({
            ...data,
            start_date: `${currentYear}-09-01`,
            end_date: `${currentYear + 1}-07-05`,
            terms: template
        });
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                    <Calendar className="w-6 h-6 text-primary" />
                </div>
                <div>
                    <h2 className="text-2xl font-bold">Année Scolaire</h2>
                    <p className="text-muted-foreground">Définissez les périodes et trimestres</p>
                </div>
            </div>

            <Alert>
                <AlertDescription className="flex items-center justify-between">
                    <span>Utilisez le modèle français standard (3 trimestres)</span>
                    <Button variant="outline" size="sm" onClick={handleUseTemplate}>
                        Utiliser le modèle
                    </Button>
                </AlertDescription>
            </Alert>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                    <Label htmlFor="start_date" className="required">Date de début</Label>
                    <Input
                        id="start_date"
                        type="date"
                        value={data.start_date || ''}
                        onChange={(e) => onUpdate({ ...data, start_date: e.target.value })}
                        className="mt-2"
                    />
                </div>

                <div>
                    <Label htmlFor="end_date" className="required">Date de fin</Label>
                    <Input
                        id="end_date"
                        type="date"
                        value={data.end_date || ''}
                        onChange={(e) => onUpdate({ ...data, end_date: e.target.value })}
                        className="mt-2"
                    />
                </div>
            </div>

            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <Label>Trimestres / Semestres</Label>
                    <Button onClick={handleAddTerm} size="sm" className="gap-2">
                        <Plus className="w-4 h-4" />
                        Ajouter une période
                    </Button>
                </div>

                {terms.map((term: any, index: number) => (
                    <div key={index} className="p-4 bg-muted rounded-lg space-y-3">
                        <div className="flex items-center justify-between">
                            <Input
                                value={term.name}
                                onChange={(e) => handleTermChange(index, 'name', e.target.value)}
                                placeholder="Nom de la période"
                                className="max-w-xs"
                            />
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleRemoveTerm(index)}
                                className="text-destructive hover:text-destructive"
                            >
                                <Trash2 className="w-4 h-4" />
                            </Button>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <Label className="text-xs">Date de début</Label>
                                <Input
                                    type="date"
                                    value={term.start_date}
                                    onChange={(e) => handleTermChange(index, 'start_date', e.target.value)}
                                    className="mt-1"
                                />
                            </div>
                            <div>
                                <Label className="text-xs">Date de fin</Label>
                                <Input
                                    type="date"
                                    value={term.end_date}
                                    onChange={(e) => handleTermChange(index, 'end_date', e.target.value)}
                                    className="mt-1"
                                />
                            </div>
                        </div>
                    </div>
                ))}

                {terms.length === 0 && (
                    <div className="text-center py-8 text-muted-foreground">
                        Aucune période définie. Cliquez sur "Ajouter une période" ou utilisez le modèle.
                    </div>
                )}
            </div>
        </div>
    );
};
