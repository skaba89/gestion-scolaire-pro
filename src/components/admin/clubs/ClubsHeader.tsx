import { Button } from "@/components/ui/button";
import { Plus, Users } from "lucide-react";

interface ClubsHeaderProps {
    onOpenCreateDialog: () => void;
}

export function ClubsHeader({ onOpenCreateDialog }: ClubsHeaderProps) {
    return (
        <div className="flex items-center justify-between">
            <div>
                <h1 className="text-3xl font-bold flex items-center gap-3">
                    <Users className="h-8 w-8 text-primary" />
                    Clubs & Associations
                </h1>
                <p className="text-muted-foreground">Gérez les clubs étudiants et leurs membres</p>
            </div>
            <Button onClick={onOpenCreateDialog}>
                <Plus className="mr-2 h-4 w-4" />
                Nouveau club
            </Button>
        </div>
    );
}
