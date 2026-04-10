import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { UserPlus, X, Search } from "lucide-react";
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "@/components/ui/command";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { Parent } from "./schema";
import { useState } from "react";
import { CreateParentDialog } from "./CreateParentDialog";

interface StudentParentsSectionProps {
    selectedParents: Parent[];
    onRemoveParent: (id: string) => void;
    onAddParent: (parent: Parent) => void;
    searchParents: (query: string) => Promise<Parent[]>;
    tenantId: string;
}

export const StudentParentsSection = ({
    selectedParents,
    onRemoveParent,
    onAddParent,
    searchParents,
    tenantId,
}: StudentParentsSectionProps) => {
    const [open, setOpen] = useState(false);
    const [createDialogOpen, setCreateDialogOpen] = useState(false);
    const [searchResults, setSearchResults] = useState<Parent[]>([]);

    const handleSearch = async (value: string) => {
        if (value.length > 2) {
            const results = await searchParents(value);
            setSearchResults(results);
        } else {
            setSearchResults([]);
        }
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium">Parents / Tuteurs</h3>
                <Button variant="outline" size="sm" onClick={() => setCreateDialogOpen(true)} type="button">
                    <UserPlus className="w-4 h-4 mr-2" />
                    Nouveau Parent
                </Button>
            </div>

            <div className="flex flex-wrap gap-2">
                {selectedParents.map((parent) => (
                    <Badge key={parent.id} variant="secondary" className="pl-2 pr-1 py-1 gap-1">
                        {parent.first_name} {parent.last_name}
                        <button
                            type="button"
                            onClick={() => onRemoveParent(parent.id)}
                            className="ml-1 hover:bg-destructive/20 rounded-full p-0.5"
                        >
                            <X className="w-3 h-3" />
                        </button>
                    </Badge>
                ))}
                {selectedParents.length === 0 && (
                    <span className="text-sm text-muted-foreground italic">Aucun parent sélectionné</span>
                )}
            </div>

            <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger asChild>
                    <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={open}
                        className="w-full justify-between"
                    >
                        <span className="flex items-center text-muted-foreground">
                            <Search className="mr-2 h-4 w-4" />
                            Rechercher un parent existant...
                        </span>
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[400px] p-0" align="start">
                    <Command shouldFilter={false}>
                        <CommandInput
                            placeholder="Rechercher par nom..."
                            onValueChange={handleSearch}
                        />
                        <CommandList>
                            <CommandEmpty>Aucun parent trouvé.</CommandEmpty>
                            <CommandGroup heading="Résultats">
                                {searchResults.map((parent) => (
                                    <CommandItem
                                        key={parent.id}
                                        onSelect={() => {
                                            onAddParent(parent);
                                            setOpen(false);
                                        }}
                                    >
                                        <div className="flex flex-col">
                                            <span className="font-medium">
                                                {parent.first_name} {parent.last_name}
                                            </span>
                                            <span className="text-xs text-muted-foreground">
                                                {parent.email} - {parent.phone}
                                            </span>
                                        </div>
                                    </CommandItem>
                                ))}
                            </CommandGroup>
                        </CommandList>
                    </Command>
                </PopoverContent>
            </Popover>

            <CreateParentDialog
                open={createDialogOpen}
                onOpenChange={setCreateDialogOpen}
                onSuccess={onAddParent}
                tenantId={tenantId}
            />
        </div>
    );
};
