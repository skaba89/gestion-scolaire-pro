import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  Users,
  GraduationCap,
  BookOpen,
  BarChart3,
  MessageSquare,
  Settings,
  Home,
  Calendar,
  Bell,
  FileText,
  UserPlus,
  ClipboardList,
  DollarSign,
} from "lucide-react";
import { useCommandPaletteStore } from "@/hooks/useCommandPalette";
import { useDebounce } from "@/hooks/useDebounce";
import { apiClient } from "@/api/client";
import { useTenantUrl } from "@/hooks/useTenantUrl";

interface NavItem {
  label: string;
  path: string;
  icon: React.ComponentType<{ className?: string }>;
}

const NAV_ITEMS: NavItem[] = [
  { label: "Tableau de bord", path: "/admin/dashboard", icon: Home },
  { label: "Élèves", path: "/admin/students", icon: GraduationCap },
  { label: "Enseignants", path: "/admin/teachers", icon: Users },
  { label: "Classes", path: "/admin/classes", icon: BookOpen },
  { label: "Notes & Bulletins", path: "/admin/grades", icon: BarChart3 },
  { label: "Présences", path: "/admin/attendance", icon: ClipboardList },
  { label: "Emploi du temps", path: "/admin/schedule", icon: Calendar },
  { label: "Messages", path: "/admin/messages", icon: MessageSquare },
  { label: "Notifications", path: "/admin/notifications", icon: Bell },
  { label: "Admissions", path: "/admin/admissions", icon: UserPlus },
  { label: "Rapports", path: "/admin/reports", icon: FileText },
  { label: "Finance", path: "/admin/finance", icon: DollarSign },
  { label: "Paramètres", path: "/admin/settings", icon: Settings },
];

interface StudentResult {
  id: string;
  first_name: string;
  last_name: string;
  class_name?: string;
}

export function CommandPalette() {
  const { isOpen, close } = useCommandPaletteStore();
  const navigate = useNavigate();
  const { getTenantUrl } = useTenantUrl();
  const [search, setSearch] = useState("");
  const [students, setStudents] = useState<StudentResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const debouncedSearch = useDebounce(search, 300);

  // Search students
  useEffect(() => {
    if (!debouncedSearch || debouncedSearch.length < 2) {
      setStudents([]);
      return;
    }
    let cancelled = false;
    setIsSearching(true);

    apiClient
      .get<{ data: StudentResult[]; items?: StudentResult[] }>(
        `/students?search=${encodeURIComponent(debouncedSearch)}&limit=5`
      )
      .then((res) => {
        if (!cancelled) {
          const results = res.data?.data ?? res.data?.items ?? [];
          setStudents(Array.isArray(results) ? results.slice(0, 5) : []);
        }
      })
      .catch(() => {
        if (!cancelled) setStudents([]);
      })
      .finally(() => {
        if (!cancelled) setIsSearching(false);
      });

    return () => {
      cancelled = true;
    };
  }, [debouncedSearch]);

  const handleSelect = useCallback(
    (path: string) => {
      close();
      setSearch("");
      navigate(getTenantUrl(path));
    },
    [close, navigate, getTenantUrl]
  );

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        close();
        setSearch("");
      }
    },
    [close]
  );

  // Filter nav items
  const filteredNav = search
    ? NAV_ITEMS.filter((item) =>
        item.label.toLowerCase().includes(search.toLowerCase())
      )
    : NAV_ITEMS;

  return (
    <CommandDialog open={isOpen} onOpenChange={handleOpenChange}>
      <CommandInput
        placeholder="Rechercher une page, un élève… (⌘K)"
        value={search}
        onValueChange={setSearch}
      />
      <CommandList>
        <CommandEmpty>
          {isSearching ? "Recherche en cours…" : "Aucun résultat trouvé."}
        </CommandEmpty>

        {filteredNav.length > 0 && (
          <CommandGroup heading="Navigation">
            {filteredNav.map((item) => (
              <CommandItem
                key={item.path}
                value={item.label}
                onSelect={() => handleSelect(item.path)}
              >
                <item.icon className="mr-2 h-4 w-4 shrink-0" />
                <span>{item.label}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {students.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Élèves">
              {students.map((student) => (
                <CommandItem
                  key={student.id}
                  value={`${student.first_name} ${student.last_name}`}
                  onSelect={() => handleSelect(`/admin/students/${student.id}`)}
                >
                  <GraduationCap className="mr-2 h-4 w-4 shrink-0" />
                  <span>
                    {student.first_name} {student.last_name}
                  </span>
                  {student.class_name && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      — {student.class_name}
                    </span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}

export default CommandPalette;
