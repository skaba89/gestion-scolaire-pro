import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search } from "lucide-react";

interface BadgeFiltersProps {
    searchTerm: string;
    onSearchChange: (value: string) => void;
    classroomFilter: string;
    onClassroomFilterChange: (value: string) => void;
    classrooms: { id: string; name: string }[];
}

export function BadgeFilters({
    searchTerm,
    onSearchChange,
    classroomFilter,
    onClassroomFilterChange,
    classrooms,
}: BadgeFiltersProps) {
    return (
        <div className="flex flex-col sm:flex-row gap-4 mb-4">
            <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                    placeholder="Rechercher par nom, numéro, code ou classe..."
                    value={searchTerm}
                    onChange={(e) => onSearchChange(e.target.value)}
                    className="pl-10"
                />
            </div>
            <Select value={classroomFilter} onValueChange={onClassroomFilterChange}>
                <SelectTrigger className="w-full sm:w-48">
                    <SelectValue placeholder="Filtrer par classe" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="all">Toutes les classes</SelectItem>
                    <SelectItem value="none">Sans classe</SelectItem>
                    {classrooms.map((classroom) => (
                        <SelectItem key={classroom.id} value={classroom.id}>
                            {classroom.name}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </div>
    );
}
