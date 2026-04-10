import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

interface CareersHeaderProps {
    onNewOffer: () => void;
    onNewEvent: () => void;
    activeTab: string;
}

export function CareersHeader({ onNewOffer, onNewEvent, activeTab }: CareersHeaderProps) {
    return (
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
                <h1 className="text-3xl font-bold">Carrières & Stages</h1>
                <p className="text-muted-foreground">
                    Gérez les offres d'emploi, stages et événements carrière
                </p>
            </div>
            <div className="flex gap-2">
                {activeTab === "offers" && (
                    <Button onClick={onNewOffer}>
                        <Plus className="h-4 w-4 mr-2" />
                        Nouvelle offre
                    </Button>
                )}
                {activeTab === "events" && (
                    <Button onClick={onNewEvent}>
                        <Plus className="h-4 w-4 mr-2" />
                        Nouvel événement
                    </Button>
                )}
            </div>
        </div>
    );
}
