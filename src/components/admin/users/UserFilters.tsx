import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Users } from "lucide-react";
import { AppRole } from "@/queries/users";
import { useStudentLabel } from "@/hooks/useStudentLabel";
import { getRoleLabel as getRoleLabelBase } from "@/lib/permissions";

interface UserFiltersProps {
    userCount: number;
    searchQuery: string;
    setSearchQuery: (query: string) => void;
    roleFilter: string;
    setRoleFilter: (role: string) => void;
}

export const UserFilters = ({
    userCount,
    searchQuery,
    setSearchQuery,
    roleFilter,
    setRoleFilter,
}: UserFiltersProps) => {
    const { StudentLabel } = useStudentLabel();

    const getRoleLabel = (role: string) => {
        if (role === "all") return "Tous";
        return getRoleLabelBase(role as AppRole, StudentLabel);
    };

    return (
        <Card>
            <CardHeader>
                <div className="flex flex-col sm:flex-row justify-between gap-4">
                    <div>
                        <CardTitle className="flex items-center gap-2">
                            <Users className="w-5 h-5" />
                            Utilisateurs ({userCount})
                        </CardTitle>
                        <CardDescription>
                            {roleFilter !== "all" && `Filtré par: ${getRoleLabel(roleFilter)}`}
                        </CardDescription>
                    </div>
                    <div className="flex gap-2">
                        <div className="relative w-full sm:w-64">
                            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <Input
                                placeholder="Rechercher..."
                                value={searchQuery}
                                onChange={(e) => {
                                    setSearchQuery(e.target.value);
                                }}
                                className="pl-10"
                            />
                        </div>
                        {roleFilter !== "all" && (
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                    setRoleFilter("all");
                                }}
                            >
                                Effacer filtre
                            </Button>
                        )}
                    </div>
                </div>
            </CardHeader>
        </Card>
    );
};
