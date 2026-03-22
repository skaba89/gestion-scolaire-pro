import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";

interface ExportFieldSelectorProps {
    fields: string[];
    selectedFields: string[];
    onToggleField: (field: string) => void;
    onSelectAll: () => void;
    onSelectNone: () => void;
}

export const ExportFieldSelector = ({
    fields,
    selectedFields,
    onToggleField,
    onSelectAll,
    onSelectNone,
}: ExportFieldSelectorProps) => {
    return (
        <Card>
            <CardHeader>
                <CardTitle>Colonnes à exporter</CardTitle>
                <CardDescription>Sélectionnez les champs à inclure dans l'export</CardDescription>
            </CardHeader>
            <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {fields.map((field) => (
                        <label key={field} className="flex items-center gap-2 cursor-pointer">
                            <Checkbox
                                checked={selectedFields.includes(field)}
                                onCheckedChange={() => onToggleField(field)}
                            />
                            <span className="text-sm">{field}</span>
                        </label>
                    ))}
                </div>
                <div className="mt-4 flex gap-2">
                    <Button variant="outline" size="sm" onClick={onSelectAll}>
                        Tout sélectionner
                    </Button>
                    <Button variant="outline" size="sm" onClick={onSelectNone}>
                        Tout désélectionner
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
};
