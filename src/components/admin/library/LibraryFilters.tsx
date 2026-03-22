import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Search, Grid, List } from "lucide-react";

interface LibraryFiltersProps {
    searchQuery: string;
    onSearchChange: (value: string) => void;
    selectedCategory: string;
    onCategoryChange: (value: string) => void;
    selectedType: string;
    onTypeChange: (value: string) => void;
    viewMode: "grid" | "list";
    onViewModeChange: (mode: "grid" | "list") => void;
    categories: any[];
    resourceTypes: Record<string, string>;
}

export function LibraryFilters({
    searchQuery,
    onSearchChange,
    selectedCategory,
    onCategoryChange,
    selectedType,
    onTypeChange,
    viewMode,
    onViewModeChange,
    categories,
    resourceTypes,
}: LibraryFiltersProps) {
    return (
        <Card>
            <CardContent className="pt-6">
                <div className="flex flex-col sm:flex-row gap-4">
                    <div className="flex-1 relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                            placeholder="Rechercher..."
                            value={searchQuery}
                            onChange={(e) => onSearchChange(e.target.value)}
                            className="pl-10"
                        />
                    </div>
                    <Select value={selectedCategory} onValueChange={onCategoryChange}>
                        <SelectTrigger className="w-48">
                            <SelectValue placeholder="Catégorie" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">Toutes catégories</SelectItem>
                            {categories?.map((cat: any) => (
                                <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <Select value={selectedType} onValueChange={onTypeChange}>
                        <SelectTrigger className="w-40">
                            <SelectValue placeholder="Type" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">Tous types</SelectItem>
                            {Object.entries(resourceTypes).map(([value, label]) => (
                                <SelectItem key={value} value={value}>{label}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <div className="flex gap-1">
                        <Button
                            variant={viewMode === "grid" ? "secondary" : "ghost"}
                            size="icon"
                            onClick={() => onViewModeChange("grid")}
                        >
                            <Grid className="w-4 h-4" />
                        </Button>
                        <Button
                            variant={viewMode === "list" ? "secondary" : "ghost"}
                            size="icon"
                            onClick={() => onViewModeChange("list")}
                        >
                            <List className="w-4 h-4" />
                        </Button>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
