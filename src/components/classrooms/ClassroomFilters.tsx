import { Search, LayoutGrid, List } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface ClassroomFiltersProps {
    searchTerm: string;
    onSearchChange: (value: string) => void;
    selectedLevel: string;
    onLevelChange: (value: string) => void;
    levels: { id: string; name: string }[];
    viewMode: "grid" | "list";
    onViewModeChange: (mode: "grid" | "list") => void;
}

export const ClassroomFilters = ({
    searchTerm,
    onSearchChange,
    selectedLevel,
    onLevelChange,
    levels,
    viewMode,
    onViewModeChange,
}: ClassroomFiltersProps) => {
    return (
        <Card className="border-none shadow-sm bg-background/50 backdrop-blur-sm">
            <CardContent className="p-4 flex flex-wrap gap-4 items-center">
                <div className="relative flex-1 min-w-[300px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                    <Input
                        placeholder="Rechercher une classe, un niveau..."
                        className="pl-11 rounded-2xl h-12 border-none bg-muted/50 hover:bg-muted focus:bg-background transition-all"
                        value={searchTerm}
                        onChange={(e) => onSearchChange(e.target.value)}
                    />
                </div>
                <Select value={selectedLevel} onValueChange={onLevelChange}>
                    <SelectTrigger className="w-full md:w-[200px] h-12 rounded-2xl border-none bg-muted/50">
                        <SelectValue placeholder="Tous niveaux" />
                    </SelectTrigger>
                    <SelectContent className="rounded-2xl border-none shadow-2xl">
                        <SelectItem value="all">Tous niveaux</SelectItem>
                        {levels.map((level) => (
                            <SelectItem key={level.id} value={level.id}>{level.name}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <div className="flex bg-muted/50 p-1 rounded-xl">
                    <Button
                        variant={viewMode === "grid" ? "default" : "ghost"}
                        size="icon"
                        onClick={() => onViewModeChange("grid")}
                        className="rounded-lg h-10 w-10 shadow-none hover:bg-background"
                    >
                        <LayoutGrid className="w-5 h-5" />
                    </Button>
                    <Button
                        variant={viewMode === "list" ? "default" : "ghost"}
                        size="icon"
                        onClick={() => onViewModeChange("list")}
                        className="rounded-lg h-10 w-10 shadow-none hover:bg-background"
                    >
                        <List className="w-5 h-5" />
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
};
