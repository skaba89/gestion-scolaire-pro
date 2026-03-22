import React, { useState, useEffect, useCallback } from "react";
import {
    CommandDialog,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
    CommandSeparator,
} from "@/components/ui/command";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import {
    Calculator,
    Calendar,
    CreditCard,
    Settings,
    Smile,
    User,
    Users,
    Search,
    FileText,
    BarChart3,
    BookOpen,
    LayoutDashboard
} from "lucide-react";
import { useTenant } from "@/contexts/TenantContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useDebounce } from "@/hooks/useDebounce";

interface GlobalSearchProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export const GlobalSearch = ({ open, onOpenChange }: GlobalSearchProps) => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { tenant } = useTenant();
    const { user } = useAuth();
    const [query, setQuery] = useState("");
    const debouncedQuery = useDebounce(query, 300);
    const [students, setStudents] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);

    // Search Students
    useEffect(() => {
        const searchStudents = async () => {
            if (!debouncedQuery || debouncedQuery.length < 2 || !tenant?.id) {
                setStudents([]);
                return;
            }

            setLoading(true);
            try {
                const { data, error } = await supabase
                    .from("students")
                    .select("id, first_name, last_name, registration_number, gender")
                    .eq("tenant_id", tenant.id)
                    .or(`first_name.ilike.%${debouncedQuery}%,last_name.ilike.%${debouncedQuery}%,registration_number.ilike.%${debouncedQuery}%`)
                    .limit(5);

                if (error) throw error;
                setStudents(data || []);
            } catch (error) {
                console.error("Search error:", error);
            } finally {
                setLoading(false);
            }
        };

        searchStudents();
    }, [debouncedQuery, tenant?.id]);

    const runCommand = useCallback((command: () => void) => {
        onOpenChange(false);
        command();
    }, [onOpenChange]);

    const getTenantUrl = (path: string) => {
        if (!tenant?.slug) return path;
        return `/${tenant.slug}${path}`;
    };

    return (
        <CommandDialog open={open} onOpenChange={onOpenChange}>
            <CommandInput
                placeholder={t("search.placeholder", "Rechercher un élève, une page, un paramètre...")}
                value={query}
                onValueChange={setQuery}
            />
            <CommandList>
                <CommandEmpty>
                    {loading ? "Recherche en cours..." : t("search.noResults", "Aucun résultat trouvé.")}
                </CommandEmpty>

                {/* Dynamic Results: Students */}
                {students.length > 0 && (
                    <CommandGroup heading="Élèves">
                        {students.map((student) => (
                            <CommandItem
                                key={student.id}
                                value={`${student.first_name} ${student.last_name} ${student.registration_number}`}
                                onSelect={() => {
                                    runCommand(() => navigate(getTenantUrl(`/admin/students/${student.id}`)));
                                }}
                            >
                                <User className="mr-2 h-4 w-4" />
                                <div className="flex flex-col">
                                    <span>{student.first_name} {student.last_name}</span>
                                    <span className="text-xs text-muted-foreground">{student.registration_number}</span>
                                </div>
                            </CommandItem>
                        ))}
                    </CommandGroup>
                )}

                <CommandSeparator />

                {/* Static Pages */}
                <CommandGroup heading="Navigation Rapide">
                    <CommandItem
                        value="Tableau de bord Dashboard Accueil"
                        onSelect={() => runCommand(() => navigate(getTenantUrl("/admin")))}
                    >
                        <LayoutDashboard className="mr-2 h-4 w-4" />
                        <span>Tableau de bord</span>
                    </CommandItem>
                    <CommandItem
                        value="Élèves Students Liste"
                        onSelect={() => runCommand(() => navigate(getTenantUrl("/admin/students")))}
                    >
                        <Users className="mr-2 h-4 w-4" />
                        <span>Élèves</span>
                    </CommandItem>
                    <CommandItem
                        value="Finances Factures Paiements"
                        onSelect={() => runCommand(() => navigate(getTenantUrl("/admin/finances")))}
                    >
                        <CreditCard className="mr-2 h-4 w-4" />
                        <span>Finances</span>
                    </CommandItem>
                    <CommandItem
                        value="Notes Grades Bulletins"
                        onSelect={() => runCommand(() => navigate(getTenantUrl("/admin/grades")))}
                    >
                        <BarChart3 className="mr-2 h-4 w-4" />
                        <span>Notes</span>
                    </CommandItem>
                    <CommandItem
                        value="Paramètres Settings Configuration"
                        onSelect={() => runCommand(() => navigate(getTenantUrl("/admin/settings")))}
                    >
                        <Settings className="mr-2 h-4 w-4" />
                        <span>Paramètres</span>
                    </CommandItem>
                </CommandGroup>

                <CommandSeparator />

                {/* Global Actions */}
                <CommandGroup heading="Actions Rapides">
                    <CommandItem
                        value="Nouvel élève Inscription"
                        onSelect={() => runCommand(() => navigate(getTenantUrl("/admin/admissions")))}
                    >
                        <User className="mr-2 h-4 w-4" />
                        <span>Inscrire un élève</span>
                    </CommandItem>
                    <CommandItem
                        value="Nouvelle facture Paiement"
                        onSelect={() => runCommand(() => navigate(getTenantUrl("/admin/finances")))}
                    >
                        <CreditCard className="mr-2 h-4 w-4" />
                        <span>Créer une facture</span>
                    </CommandItem>
                </CommandGroup>
            </CommandList>
        </CommandDialog>
    );
};
