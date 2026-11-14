import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Archive } from "lucide-react";
import { useTranslation } from "react-i18next";

interface StudentFiltersProps {
    searchTerm: string;
    setSearchTerm: (value: string) => void;
    showArchived: boolean;
    setShowArchived: (value: boolean) => void;
}

export const StudentFilters = ({
    searchTerm,
    setSearchTerm,
    showArchived,
    setShowArchived,
}: StudentFiltersProps) => {
    const { t } = useTranslation();
    return (
        <Card>
            <CardContent className="p-4">
                <div className="flex flex-col sm:flex-row gap-4">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                            placeholder={t("studentsAdmin.rechercherParNomOuNumero")}
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-10"
                        />
                    </div>
                    <Button
                        variant={showArchived ? "default" : "outline"}
                        onClick={() => setShowArchived(!showArchived)}
                    >
                        <Archive className="w-4 h-4 mr-2" />
                        {showArchived ? t("studentsAdmin.voirActifs") : t("studentsAdmin.voirArchives")}
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
};
