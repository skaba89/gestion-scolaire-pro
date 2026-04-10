import { Button } from "@/components/ui/button";
import { Plus, Scan } from "lucide-react";
import BatchBadgePrint from "@/components/badges/BatchBadgePrint";

interface BadgeHeaderProps {
    studentsLabel: string;
    studentLabel: string;
    onRefresh: () => void;
    onShowScanner: () => void;
    onOpenCreateDialog: () => void;
}

export function BadgeHeader({
    studentsLabel,
    studentLabel,
    onRefresh,
    onShowScanner,
    onOpenCreateDialog,
}: BadgeHeaderProps) {
    return (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
                <h1 className="text-3xl font-bold">Gestion des Badges</h1>
                <p className="text-muted-foreground">
                    Gérez les badges QR code des {studentsLabel} et le pointage
                </p>
            </div>
            <div className="flex flex-wrap gap-2">
                <BatchBadgePrint onBadgesCreated={onRefresh} />
                <Button variant="outline" onClick={onShowScanner}>
                    <Scan className="h-4 w-4 mr-2" />
                    Scanner
                </Button>
                <Button onClick={onOpenCreateDialog}>
                    <Plus className="h-4 w-4 mr-2" />
                    Nouveau Badge
                </Button>
            </div>
        </div>
    );
}
