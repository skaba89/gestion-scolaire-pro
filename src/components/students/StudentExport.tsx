import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/api/client";
import { useTenant } from "@/contexts/TenantContext";
import { useStudentLabel } from "@/hooks/useStudentLabel";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Download, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";

interface ExportColumn {
  key: string;
  label: string;
  selected: boolean;
}

const DEFAULT_COLUMNS: ExportColumn[] = [
  { key: "registration_number", label: "N° Étudiant", selected: true },
  { key: "last_name", label: "Nom", selected: true },
  { key: "first_name", label: "Prénom", selected: true },
  { key: "email", label: "Email", selected: true },
  { key: "date_of_birth", label: "Date de naissance", selected: true },
  { key: "gender", label: "Genre", selected: true },
  { key: "phone", label: "Téléphone", selected: false },
  { key: "address", label: "Adresse", selected: false },
  { key: "emergency_contact", label: "Contact d'urgence", selected: false },
  { key: "emergency_phone", label: "Téléphone d'urgence", selected: false },
  { key: "created_at", label: "Date d'inscription", selected: false },
];

export const StudentExport = () => {
  const { tenant } = useTenant();
  const { studentsLabel, StudentsLabel } = useStudentLabel();
  const studentsLabelLower = studentsLabel.toLowerCase();

  const [isOpen, setIsOpen] = useState(false);
  const [columns, setColumns] = useState<ExportColumn[]>(DEFAULT_COLUMNS);
  const [format, setFormat] = useState<"csv" | "excel">("csv");
  const [includeArchived, setIncludeArchived] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const { data: students, isLoading, refetch } = useQuery({
    queryKey: ["students-export", tenant?.id, includeArchived, isOpen],
    queryFn: async () => {
      if (!tenant?.id) return [];
      const params: Record<string, string> = { tenant_id: tenant.id };
      if (!includeArchived) params.is_archived = 'false';
      const { data } = await apiClient.get('/students/', { params });
      return data.data || data || [];
    },
    enabled: !!tenant?.id && isOpen,
  });

  // Refetch when dialog opens
  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (open && tenant?.id) {
      refetch();
    }
  };

  const toggleColumn = (key: string) => {
    setColumns(prev =>
      prev.map(col => col.key === key ? { ...col, selected: !col.selected } : col)
    );
  };

  const selectAll = () => {
    setColumns(prev => prev.map(col => ({ ...col, selected: true })));
  };

  const deselectAll = () => {
    setColumns(prev => prev.map(col => ({ ...col, selected: false })));
  };

  const formatValue = (value: any, key: string): string => {
    if (value === null || value === undefined) return "";
    if (key === "date_of_birth" || key === "created_at") {
      try {
        return new Date(value).toLocaleDateString("fr-FR");
      } catch {
        return String(value);
      }
    }
    return String(value);
  };

  const exportToCSV = () => {
    if (!students || students.length === 0) {
      toast.error("Aucune donnée à exporter");
      return;
    }

    const selectedColumns = columns.filter(col => col.selected);
    if (selectedColumns.length === 0) {
      toast.error("Sélectionnez au moins une colonne");
      return;
    }

    setIsExporting(true);

    try {
      // Build CSV content
      const headers = selectedColumns.map(col => col.label).join(";");
      const rows = students.map(student =>
        selectedColumns
          .map(col => {
            const value = formatValue(student[col.key as keyof typeof student], col.key);
            // Escape quotes and wrap in quotes if contains separator
            if (value.includes(";") || value.includes('"') || value.includes("\n")) {
              return `"${value.replace(/"/g, '""')}"`;
            }
            return value;
          })
          .join(";")
      );

      const csvContent = "\uFEFF" + [headers, ...rows].join("\n"); // BOM for Excel

      // Create download
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${studentsLabelLower.replace(/\s+/g, "_")}_${tenant?.name?.replace(/\s+/g, "_") || "export"}_${new Date().toISOString().split("T")[0]}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success(`${students.length} ${studentsLabelLower} exporté(s)`);
      setIsOpen(false);
    } catch (error) {
      console.error("Export error:", error);
      toast.error("Erreur lors de l'export");
    } finally {
      setIsExporting(false);
    }
  };

  const selectedCount = columns.filter(c => c.selected).length;

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Download className="w-4 h-4 mr-2" />
          Exporter
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5" />
            Exporter les {StudentsLabel}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Options */}
          <div className="flex items-center space-x-2">
            <Checkbox
              id="includeArchived"
              checked={includeArchived}
              onCheckedChange={(checked) => setIncludeArchived(!!checked)}
            />
            <Label htmlFor="includeArchived" className="text-sm">
              Inclure les {studentsLabelLower} archivés
            </Label>
          </div>

          {/* Column Selection */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Colonnes à exporter</Label>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={selectAll}>
                  Tout
                </Button>
                <Button variant="ghost" size="sm" onClick={deselectAll}>
                  Aucun
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto p-2 border rounded-lg">
              {columns.map((col) => (
                <div key={col.key} className="flex items-center space-x-2">
                  <Checkbox
                    id={col.key}
                    checked={col.selected}
                    onCheckedChange={() => toggleColumn(col.key)}
                  />
                  <Label htmlFor={col.key} className="text-sm cursor-pointer">
                    {col.label}
                  </Label>
                </div>
              ))}
            </div>
          </div>

          {/* Summary */}
          <div className="text-sm text-muted-foreground bg-muted/50 p-3 rounded-lg">
            {isLoading ? (
              <p>Chargement des données...</p>
            ) : (
              <p>{students?.length || 0} {studentsLabelLower} • {selectedCount} colonne(s)</p>
            )}
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => handleOpenChange(false)}>
              Annuler
            </Button>
            <Button
              onClick={exportToCSV}
              disabled={isExporting || selectedCount === 0 || isLoading || !students?.length}
            >
              {isExporting ? "Export..." : isLoading ? "Chargement..." : "Télécharger CSV"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
