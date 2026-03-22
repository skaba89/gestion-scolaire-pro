import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Building2, Layers, School, Search, FilterX } from "lucide-react";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";

interface SubjectFiltersProps {
    departments: any[];
    levels: any[];
    classrooms: any[];
    selectedDept: string;
    selectedLevel: string;
    selectedClass: string;
    searchTerm: string;
    onDeptChange: (val: string) => void;
    onLevelChange: (val: string) => void;
    onClassChange: (val: string) => void;
    onSearchChange: (val: string) => void;
    onClearFilters: () => void;
}

export const SubjectFilters = ({
    departments,
    levels,
    classrooms,
    selectedDept,
    selectedLevel,
    selectedClass,
    searchTerm,
    onDeptChange,
    onLevelChange,
    onClassChange,
    onSearchChange,
    onClearFilters,
}: SubjectFiltersProps) => {
    return (
        <Card>
            <CardContent className="p-4">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                    {/* Department Filter */}
                    <div className="space-y-2">
                        <label className="text-xs font-semibold flex items-center gap-2 text-muted-foreground uppercase tracking-wider">
                            <Building2 className="w-3 h-3" /> Département
                        </label>
                        <Select value={selectedDept} onValueChange={onDeptChange}>
                            <SelectTrigger className="h-9">
                                <SelectValue placeholder="Tous" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Tous les départements</SelectItem>
                                {departments.map((dept) => (
                                    <SelectItem key={dept.id} value={dept.id}>
                                        {dept.code ? `[${dept.code}] ` : ""}{dept.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Level Filter */}
                    <div className="space-y-2">
                        <label className="text-xs font-semibold flex items-center gap-2 text-muted-foreground uppercase tracking-wider">
                            <Layers className="w-3 h-3" /> Niveau
                        </label>
                        <Select value={selectedLevel} onValueChange={onLevelChange}>
                            <SelectTrigger className="h-9">
                                <SelectValue placeholder="Tous" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Tous les niveaux</SelectItem>
                                {levels.map((level) => (
                                    <SelectItem key={level.id} value={level.id}>{level.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Class Filter */}
                    <div className="space-y-2">
                        <label className="text-xs font-semibold flex items-center gap-2 text-muted-foreground uppercase tracking-wider">
                            <School className="w-3 h-3" /> Classe
                        </label>
                        <Select value={selectedClass} onValueChange={onClassChange}>
                            <SelectTrigger className="h-9">
                                <SelectValue placeholder="Toutes" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Toutes les classes</SelectItem>
                                {classrooms.map((cls) => (
                                    <SelectItem key={cls.id} value={cls.id}>{cls.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Search Filter */}
                    <div className="lg:col-span-2 space-y-2">
                        <label className="text-xs font-semibold flex items-center gap-2 text-muted-foreground uppercase tracking-wider">
                            <Search className="w-3 h-3" /> Recherche
                        </label>
                        <div className="relative">
                            <Input
                                placeholder="Nom ou code de la matière..."
                                className="h-9 pl-9 pr-8"
                                value={searchTerm}
                                onChange={(e) => onSearchChange(e.target.value)}
                            />
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            {(searchTerm || selectedDept !== "all" || selectedLevel !== "all" || selectedClass !== "all") && (
                                <button
                                    onClick={onClearFilters}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                >
                                    <FilterX className="h-3.5 w-3.5" />
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
};
