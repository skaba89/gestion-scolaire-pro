import { AlertTriangle, UserX } from "lucide-react";
import { Button } from "@/components/ui/button";

interface StudentRiskBannerProps {
    count: number;
    studentsLabel: string;
    StudentsLabel: string;
    onFilterRisk: () => void;
    onClose: () => void;
}

export const StudentRiskBanner = ({
    count,
    studentsLabel,
    StudentsLabel,
    onFilterRisk,
    onClose,
}: StudentRiskBannerProps) => {
    if (count === 0) return null;

    return (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3 animate-in fade-in slide-in-from-top-4">
            <div className="bg-red-100 p-2 rounded-full">
                <AlertTriangle className="w-5 h-5 text-red-600" />
            </div>
            <div className="flex-1">
                <h3 className="font-semibold text-red-900">Système d'alerte - {StudentsLabel} à risque</h3>
                <p className="text-sm text-red-700 mt-1">
                    L'analyse a décelé {count} {studentsLabel} décrocheurs potentiels (Moyenne &lt; 8 ou Présence &lt; 70%).
                </p>
                <div className="mt-3 flex gap-2">
                    <Button
                        size="sm"
                        variant="outline"
                        className="border-red-200 text-red-700 hover:bg-red-100 hover:text-red-800 bg-white"
                        onClick={onFilterRisk}
                    >
                        Filtrer la liste
                    </Button>
                </div>
            </div>
            <Button variant="ghost" size="icon" className="text-red-500 hover:bg-red-100" onClick={onClose}>
                <UserX className="w-4 h-4" />
            </Button>
        </div>
    );
};
