import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface AccountingPeriodSelectorProps {
    selectedPeriod: string;
    onPeriodChange: (value: string) => void;
}

export const AccountingPeriodSelector = ({
    selectedPeriod,
    onPeriodChange,
}: AccountingPeriodSelectorProps) => {
    return (
        <Card>
            <CardHeader>
                <CardTitle>Période d'export</CardTitle>
            </CardHeader>
            <CardContent>
                <div className="flex flex-wrap gap-4">
                    <div className="w-64">
                        <Label>Sélectionner la période</Label>
                        <Select value={selectedPeriod} onValueChange={onPeriodChange}>
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="current_month">Mois en cours</SelectItem>
                                <SelectItem value="last_month">Mois précédent</SelectItem>
                                <SelectItem value="last_quarter">3 derniers mois</SelectItem>
                                <SelectItem value="current_year">Année en cours</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
};
