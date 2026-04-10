import React from "react";
import { School, ChevronDown, Building2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useTenant } from "@/contexts/TenantContext";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

export const TenantSwitcher = () => {
    const navigate = useNavigate();
    const { isSuperAdmin } = useAuth();
    const { currentTenant, allTenants, switchTenant } = useTenant();

    if (!isSuperAdmin()) return null;

    return (
        <div className="px-4 mb-4">
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button
                        variant="outline"
                        className="w-full justify-between gap-2 px-3 h-12 border-primary/20 bg-primary/5 hover:bg-primary/10 transition-colors rounded-xl group"
                    >
                        <div className="flex items-center gap-2 truncate text-left">
                            <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-white transition-colors flex-shrink-0">
                                <Building2 className="w-4 h-4" />
                            </div>
                            <div className="flex flex-col min-w-0">
                                <span className="font-bold text-xs text-primary uppercase tracking-wider leading-tight">Établissement</span>
                                <span className="font-semibold text-sm truncate leading-tight">
                                    {currentTenant?.name || "Sélectionner"}
                                </span>
                            </div>
                        </div>
                        <ChevronDown className="w-4 h-4 opacity-50 flex-shrink-0" />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-64 max-h-[400px] overflow-y-auto z-[60]" align="start">
                    <DropdownMenuLabel>Établissements disponibles</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {allTenants.map((t) => (
                        <DropdownMenuItem
                            key={t.id}
                            onClick={async () => {
                                await switchTenant(t.id);
                                navigate(`/${t.slug}/admin`);
                            }}
                            className={currentTenant?.id === t.id ? "bg-accent font-bold" : ""}
                        >
                            <div className="flex flex-col">
                                <span className="text-sm">{t.name}</span>
                                <span className="text-[10px] text-muted-foreground uppercase opacity-70">
                                    {t.type || "École/Université"} • {t.slug}
                                </span>
                            </div>
                        </DropdownMenuItem>
                    ))}
                    {allTenants.length === 0 && (
                        <div className="px-2 py-4 text-center text-sm text-muted-foreground">
                            Chargement ou aucun établissement...
                        </div>
                    )}
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
    );
};
