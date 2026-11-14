import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@/components/ui/select";
import { Search, Filter } from "lucide-react";
import { useTranslation } from "react-i18next";

interface AdmissionFiltersProps {
    searchTerm: string;
    setSearchTerm: (value: string) => void;
    statusFilter: string;
    setStatusFilter: (value: string) => void;
}

export const AdmissionFilters = ({
    searchTerm,
    setSearchTerm,
    statusFilter,
    setStatusFilter,
}: AdmissionFiltersProps) => {
    const { t } = useTranslation();
    return (
        <Card>
            <CardContent className="p-4">
                <div className="flex flex-col sm:flex-row gap-4">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                            placeholder={t("admissions.rechercherParNomOuEmail")}
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-10"
                        />
                    </div>
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                        <SelectTrigger className="w-full sm:w-48">
                            <Filter className="w-4 h-4 mr-2" />
                            <SelectValue placeholder={t("admissions.filters.byStatus")} />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">{t("admissions.filters.allStatuses")}</SelectItem>
                            <SelectItem value="SUBMITTED">{t("admissions.status.SUBMITTED")}</SelectItem>
                            <SelectItem value="UNDER_REVIEW">{t("admissions.status.UNDER_REVIEW")}</SelectItem>
                            <SelectItem value="ACCEPTED">{t("admissions.status.ACCEPTED")}</SelectItem>
                            <SelectItem value="REJECTED">{t("admissions.status.REJECTED")}</SelectItem>
                            <SelectItem value="CONVERTED_TO_STUDENT">{t("admissions.status.CONVERTED_TO_STUDENT")}</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </CardContent>
        </Card>
    );
};
