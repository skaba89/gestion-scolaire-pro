import { TrendingUp, Users } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { ParentChildCard } from "@/components/dashboard/ParentChildCard";
import { StaggerContainer, StaggerItem } from "@/components/ui/stagger-container";

interface Student {
    id: string;
    first_name: string;
    last_name: string;
    registration_number: string;
    photo_url: string | null;
}

interface Relation {
    id: string;
    student: Student;
}

interface ParentChildGridProps {
    children: Relation[];
    tenantId: string;
}

export const ParentChildGrid = ({ children, tenantId }: ParentChildGridProps) => {
    return (
        <div className="space-y-4">
            <div className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-primary" />
                <h2 className="text-lg font-semibold font-display">Performance de mes enfants</h2>
            </div>

            {children.length === 0 ? (
                <Card className="border-dashed">
                    <CardContent className="py-12">
                        <div className="text-center">
                            <Users className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
                            <p className="text-muted-foreground font-medium">Aucun enfant associé</p>
                            <p className="text-sm text-muted-foreground/70">
                                Contactez l'administration pour associer vos enfants à votre compte.
                            </p>
                        </div>
                    </CardContent>
                </Card>
            ) : (
                <StaggerContainer delayChildren={0.3}>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        {children.map((relation, index) => (
                            <StaggerItem key={relation.id} index={index}>
                                <ParentChildCard
                                    student={relation.student}
                                    tenantId={tenantId}
                                />
                            </StaggerItem>
                        ))}
                    </div>
                </StaggerContainer>
            )}
        </div>
    );
};
