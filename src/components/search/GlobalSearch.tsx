import React, { useState, useEffect, useCallback, useRef } from "react";
import {
    CommandDialog,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
    CommandSeparator,
} from "@/components/ui/command";
import { Badge } from "@/components/ui/badge";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import {
    CreditCard,
    Settings,
    User,
    Users,
    Search,
    BarChart3,
    BookOpen,
    LayoutDashboard,
    GraduationCap,
    Loader2,
    BookMarked,
    Layers,
    ArrowRight,
} from "lucide-react";
import { useTenant } from "@/contexts/TenantContext";
import { apiClient } from "@/api/client";
import { useDebounce } from "@/hooks/useDebounce";

interface GlobalSearchProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

interface SearchResultItem {
    id: string;
    resource_type: string;
    label: string;
    icon: string;
    display_name: string;
    subtitle: string | null;
}

interface SearchResults {
    [key: string]: {
        label: string;
        icon: string;
        items: SearchResultItem[];
        count: number;
    };
}

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
    GraduationCap,
    BookOpen,
    CreditCard,
    BookMarked,
    Layers,
    Users,
    User,
    Search,
};

const QUICK_NAV = [
    { label: "Tableau de bord", icon: LayoutDashboard, path: "/admin" },
    { label: "Élèves", icon: GraduationCap, path: "/admin/students" },
    { label: "Finances", icon: CreditCard, path: "/admin/finances" },
    { label: "Notes", icon: BarChart3, path: "/admin/grades" },
    { label: "Enseignants", icon: BookOpen, path: "/admin/teachers" },
    { label: "Paramètres", icon: Settings, path: "/admin/settings" },
];

const QUICK_ACTIONS = [
    { label: "Inscrire un élève", icon: User, path: "/admin/admissions" },
    { label: "Créer une facture", icon: CreditCard, path: "/admin/finances" },
    { label: "Saisir des notes", icon: BarChart3, path: "/admin/grades" },
];

export const GlobalSearch = ({ open, onOpenChange }: GlobalSearchProps) => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { tenant } = useTenant();
    const [query, setQuery] = useState("");
    const debouncedQuery = useDebounce(query, 350);
    const [results, setResults] = useState<SearchResults>({});
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const abortRef = useRef<AbortController | null>(null);

    // Global search via backend API
    useEffect(() => {
        if (!debouncedQuery || debouncedQuery.length < 2 || !tenant?.id) {
            setResults({});
            setError(null);
            return;
        }

        // Cancel previous request
        if (abortRef.current) abortRef.current.abort();
        abortRef.current = new AbortController();

        const doSearch = async () => {
            setLoading(true);
            setError(null);
            try {
                const response = await apiClient.get("/search/", {
                    params: { q: debouncedQuery, limit: 5 },
                    signal: abortRef.current!.signal,
                });
                setResults(response.data?.results || {});
            } catch (err: any) {
                if (err?.name !== "CanceledError" && err?.code !== "ERR_CANCELED") {
                    setError("Erreur lors de la recherche");
                }
            } finally {
                setLoading(false);
            }
        };

        doSearch();

        return () => abortRef.current?.abort();
    }, [debouncedQuery, tenant?.id]);

    // Reset on close
    useEffect(() => {
        if (!open) {
            setQuery("");
            setResults({});
            setError(null);
        }
    }, [open]);

    const runCommand = useCallback((command: () => void) => {
        onOpenChange(false);
        command();
    }, [onOpenChange]);

    const getTenantUrl = (path: string) => {
        if (!tenant?.slug) return path;
        return `/${tenant.slug}${path}`;
    };

    const hasResults = Object.values(results).some(r => r.items.length > 0);
    const isSearching = debouncedQuery.length >= 2;

    return (
        <CommandDialog open={open} onOpenChange={onOpenChange}>
            <div className="flex items-center border-b px-3">
                {loading
                    ? <Loader2 className="mr-2 h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
                    : <Search className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
                }
                <CommandInput
                    placeholder={t("search.placeholder", "Rechercher élèves, enseignants, paiements...")}
                    value={query}
                    onValueChange={setQuery}
                    className="border-0 focus:ring-0"
                />
                <kbd className="ml-auto hidden sm:flex pointer-events-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] text-muted-foreground">
                    ESC
                </kbd>
            </div>

            <CommandList className="max-h-[60vh]">
                {/* Error state */}
                {error && (
                    <div className="px-4 py-3 text-sm text-destructive text-center">{error}</div>
                )}

                {/* Empty state */}
                {isSearching && !loading && !hasResults && !error && (
                    <CommandEmpty>
                        <div className="flex flex-col items-center gap-2 py-6 text-muted-foreground">
                            <Search className="h-8 w-8" />
                            <p>{t("search.noResults", "Aucun résultat pour")}</p>
                            <p className="font-medium text-foreground">"{debouncedQuery}"</p>
                        </div>
                    </CommandEmpty>
                )}

                {/* Dynamic search results */}
                {hasResults && Object.entries(results).map(([type, group]) => {
                    if (group.items.length === 0) return null;
                    const IconComponent = ICON_MAP[group.icon] || Search;

                    return (
                        <CommandGroup
                            key={type}
                            heading={
                                <div className="flex items-center gap-2">
                                    <span>{group.label}</span>
                                    <Badge variant="secondary" className="h-4 px-1 text-[10px]">
                                        {group.count}
                                    </Badge>
                                </div>
                            }
                        >
                            {group.items.map((item) => (
                                <CommandItem
                                    key={item.id}
                                    value={`${item.display_name} ${item.subtitle || ""} ${item.id}`}
                                    onSelect={() => {
                                        runCommand(() => navigate(getTenantUrl(
                                            type === "students" ? `/admin/students/${item.id}` :
                                            type === "teachers" ? `/admin/teachers` :
                                            type === "payments" ? `/admin/finances` :
                                            `/admin/${type}`
                                        )));
                                    }}
                                    className="flex items-center gap-3 py-2"
                                >
                                    <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10">
                                        <IconComponent className="h-4 w-4 text-primary" />
                                    </div>
                                    <div className="flex flex-col flex-1 min-w-0">
                                        <span className="font-medium truncate">{item.display_name}</span>
                                        {item.subtitle && (
                                            <span className="text-xs text-muted-foreground truncate">{item.subtitle}</span>
                                        )}
                                    </div>
                                    <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    );
                })}

                {/* Quick navigation (shown when no active search) */}
                {!isSearching && (
                    <>
                        <CommandGroup heading="Navigation Rapide">
                            {QUICK_NAV.map((item) => (
                                <CommandItem
                                    key={item.path}
                                    value={item.label}
                                    onSelect={() => runCommand(() => navigate(getTenantUrl(item.path)))}
                                    className="flex items-center gap-3 py-2"
                                >
                                    <item.icon className="h-4 w-4 text-muted-foreground" />
                                    <span>{item.label}</span>
                                </CommandItem>
                            ))}
                        </CommandGroup>

                        <CommandSeparator />

                        <CommandGroup heading="Actions Rapides">
                            {QUICK_ACTIONS.map((item) => (
                                <CommandItem
                                    key={item.path + item.label}
                                    value={item.label}
                                    onSelect={() => runCommand(() => navigate(getTenantUrl(item.path)))}
                                    className="flex items-center gap-3 py-2"
                                >
                                    <item.icon className="h-4 w-4 text-muted-foreground" />
                                    <span>{item.label}</span>
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    </>
                )}
            </CommandList>
        </CommandDialog>
    );
};
