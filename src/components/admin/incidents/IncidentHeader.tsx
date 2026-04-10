import { Button } from "@/components/ui/button";
import { AlertTriangle, Plus } from "lucide-react";

interface IncidentHeaderProps {
    onReportIncident: () => void;
}

export function IncidentHeader({ onReportIncident }: IncidentHeaderProps) {
    return (
        <div className="flex items-center justify-between">
            <div>
                <h1 className="text-3xl font-bold flex items-center gap-2">
                    <AlertTriangle className="h-8 w-8 text-destructive" />
                    Gestion des Incidents
                </h1>
                <p className="text-muted-foreground">
                    Signalez et suivez les incidents au sein de l'établissement
                </p>
            </div>
            <Button variant="destructive" onClick={onReportIncident}>
                <Plus className="h-4 w-4 mr-2" />
                Signaler un incident
            </Button>
        </div>
    );
}
