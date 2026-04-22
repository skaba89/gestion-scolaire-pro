import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/api/client";
import { useTenant } from "@/contexts/TenantContext";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { format as formatDate } from "date-fns";
import { fr } from "date-fns/locale";
import { Users, GraduationCap, CreditCard, BarChart3, Calendar } from "lucide-react";
import { sanitizeForCSV, escapeHTML } from "@/lib/security";

import { adminQueries } from "@/queries/admin";

// Modular components
import { AdvancedExportHeader } from "@/components/admin/exports/AdvancedExportHeader";
import { ExportTypeSelector } from "@/components/admin/exports/ExportTypeSelector";
import { ExportFieldSelector } from "@/components/admin/exports/ExportFieldSelector";
import { ExportFilters } from "@/components/admin/exports/ExportFilters";
import { ExportActionButtons } from "@/components/admin/exports/ExportActionButtons";
import { ExportHistory } from "@/components/admin/exports/ExportHistory";

type ExportType = "students" | "teachers" | "grades" | "attendance" | "finances" | "schedule";

const exportConfigs: Record<ExportType, { label: string; icon: React.ElementType; description: string; fields: string[] }> = {
  students: {
    label: "Étudiants",
    icon: Users,
    description: "Liste des étudiants avec leurs informations",
    fields: ["N° Étudiant", "Prénom", "Nom", "Date de naissance", "Genre", "Classe", "Tuteur", "Tél. Tuteur", "Email Tuteur"]
  },
  teachers: {
    label: "Enseignants",
    icon: GraduationCap,
    description: "Liste des enseignants et leurs affectations",
    fields: ["Prénom", "Nom", "Email", "Téléphone", "Matières", "Classes"]
  },
  grades: {
    label: "Notes",
    icon: BarChart3,
    description: "Relevés de notes par classe et matière",
    fields: ["N° Étudiant", "Étudiant", "Classe", "Matière", "Évaluation", "Trimestre", "Note", "Note max", "Commentaire"]
  },
  attendance: {
    label: "Présences",
    icon: Users,
    description: "Statistiques de présence par période",
    fields: ["Date", "N° Étudiant", "Étudiant", "Classe", "Statut", "Remarques"]
  },
  finances: {
    label: "Finances",
    icon: CreditCard,
    description: "Factures et paiements",
    fields: ["N° Facture", "N° Étudiant", "Étudiant", "Montant total", "Montant payé", "Solde", "Statut", "Échéance", "Date création"]
  },
  schedule: {
    label: "Emplois du temps",
    icon: Calendar,
    description: "Plannings des cours par classe",
    fields: ["Classe", "Jour", "Heure début", "Heure fin", "Matière", "Enseignant", "Salle"]
  },
};

export default function AdvancedExports() {
  const { tenant } = useTenant();
  const [exportType, setExportType] = useState<ExportType>("students");
  const [selectedClassroom, setSelectedClassroom] = useState<string>("");
  const [selectedTerm, setSelectedTerm] = useState<string>("");
  const [selectedFields, setSelectedFields] = useState<string[]>(exportConfigs.students.fields);
  const [isExporting, setIsExporting] = useState(false);
  const [exportHistory, setExportHistory] = useState<{ type: string; format: string; date: Date; rows: number }[]>([]);

  // Use centralized queries
  const { data: classrooms = [] } = useQuery({
    ...adminQueries.classrooms(tenant?.id || ""),
    enabled: !!tenant?.id,
  });

  const { data: terms = [] } = useQuery({
    ...adminQueries.terms(tenant?.id || ""),
    enabled: !!tenant?.id,
  });

  // Update selected fields when export type changes
  const handleExportTypeChange = (type: ExportType) => {
    setExportType(type);
    setSelectedFields(exportConfigs[type].fields);
  };

  const toggleField = (field: string) => {
    setSelectedFields(prev =>
      prev.includes(field)
        ? prev.filter(f => f !== field)
        : [...prev, field]
    );
  };

  const exportToCSV = (data: Record<string, unknown>[], filename: string) => {
    if (!data || data.length === 0) {
      toast.error("Aucune donnée à exporter");
      return 0;
    }

    const headers = selectedFields.filter(h => Object.keys(data[0]).includes(h));
    const csvContent = [
      headers.join(","),
      ...data.map((row) =>
        headers.map((h) => {
          const value = row[h];
          const sanitized = sanitizeForCSV(value);
          return sanitized.includes(",") || sanitized.includes("\n") || sanitized.includes('"')
            ? `"${sanitized.replace(/"/g, '""')}"`
            : sanitized;
        }).join(",")
      ),
    ].join("\n");

    const blob = new Blob(["\ufeff" + csvContent], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${filename}_${formatDate(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    return data.length;
  };

  const exportToJSON = (data: Record<string, unknown>[], filename: string) => {
    if (!data || data.length === 0) {
      toast.error("Aucune donnée à exporter");
      return 0;
    }

    const filteredData = data.map(row => {
      const filtered: Record<string, unknown> = {};
      selectedFields.forEach(field => {
        if (field in row) filtered[field] = row[field];
      });
      return filtered;
    });

    const jsonContent = JSON.stringify(filteredData, null, 2);
    const blob = new Blob([jsonContent], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${filename}_${formatDate(new Date(), "yyyy-MM-dd")}.json`;
    a.click();
    URL.revokeObjectURL(url);
    return data.length;
  };

  const handleExport = async (format: "csv" | "pdf" | "json") => {
    if (!tenant?.id) return;

    setIsExporting(true);

    try {
      let data: Record<string, unknown>[] = [];
      let filename = "";

      switch (exportType) {
        case "students": {
          let params: Record<string, string> = {};

          if (selectedClassroom && selectedClassroom !== "all") {
            const { data: enrollmentData } = await apiClient.get("/admissions/enrollments/", {
              params: { class_id: selectedClassroom },
            });
            const studentIds = (enrollmentData as any[])?.map((e) => e.student_id) || [];
            if (studentIds.length > 0) {
              params.student_ids = studentIds.join(",");
            }
          }

          const { data: studentsData } = await apiClient.get("/students/", {
            params,
          });
          data = (studentsData || []).map((s: any) => ({
            "N° Étudiant": s.registration_number || "",
            Prénom: s.first_name,
            Nom: s.last_name,
            Email: s.email || "",
            Téléphone: s.phone || "",
            "Date de naissance": s.date_of_birth || "",
            Genre: s.gender === "M" ? "Masculin" : s.gender === "F" ? "Féminin" : "",
            Nationalité: s.nationality || "",
            Adresse: s.address || "",
            Ville: s.city || "",
            Pays: s.country || "",
            Classe: s.enrollments?.[0]?.classroom?.name || s.classroom_name || "",
          }));
          filename = "etudiants";
          break;
        }

        case "teachers": {
          const { data: teachersData } = await apiClient.get("/hr/staff/", {
            params: { role: "TEACHER" },
          });
          data = ((teachersData as any[]) || []).map((t: any) => ({
            Prénom: t.first_name || "",
            Nom: t.last_name || "",
            Email: t.email,
            Téléphone: t.phone || "",
          }));
          filename = "enseignants";
          break;
        }

        case "grades": {
          let params: Record<string, string> = {};

          if (selectedTerm && selectedTerm !== "all") {
            const { data: assessmentIds } = await apiClient.get("/assessments/", {
              params: { term_id: selectedTerm, fields: "id" },
            });
            const ids = (assessmentIds as any[]) || [];
            if (ids.length > 0) {
              params.assessment_ids = ids.map((a: any) => a.id).join(",");
            }
          }

          const { data: gradesData } = await apiClient.get("/grades/", { params });
          data = (gradesData || []).map((g: any) => ({
            "N° Étudiant": g.student?.registration_number || "",
            Étudiant: `${g.student?.first_name || ""} ${g.student?.last_name || ""}`,
            Classe: g.assessment?.classroom?.name || "",
            Matière: g.assessment?.subject?.name || "",
            Évaluation: g.assessment?.name || "",
            Trimestre: g.assessment?.term?.name || "",
            Note: g.score || 0,
            "Note max": g.assessment?.max_score || 20,
            Commentaire: g.comment || "",
          }));
          filename = "notes";
          break;
        }

        case "attendance": {
          const params: Record<string, string> = {
            ordering: "-date",
            limit: "1000",
          };

          if (selectedClassroom && selectedClassroom !== "all") {
            params.class_id = selectedClassroom;
          }

          const { data: attendanceData } = await apiClient.get("/attendance/", { params });
          data = (attendanceData || []).map((a: any) => ({
            Date: a.date,
            "N° Étudiant": a.student?.registration_number || "",
            Étudiant: `${a.student?.first_name || ""} ${a.student?.last_name || ""}`,
            Classe: a.classroom?.name || "",
            Statut: a.status === "PRESENT" ? "Présent" : a.status === "ABSENT" ? "Absent" : a.status === "LATE" ? "Retard" : a.status,
            Remarques: a.notes || "",
          }));
          filename = "presences";
          break;
        }

        case "finances": {
          const { data: invoicesData } = await apiClient.get("/invoices/", {
            params: {
              ordering: "-created_at",
              expand: "student",
            },
          });

          data = (invoicesData || []).map((i: any) => ({
            "N° Facture": i.invoice_number,
            "N° Étudiant": i.student?.registration_number || "",
            Étudiant: `${i.student?.first_name || ""} ${i.student?.last_name || ""}`,
            "Montant total": i.total_amount,
            "Montant payé": i.paid_amount || 0,
            Solde: i.total_amount - (i.paid_amount || 0),
            Statut: i.status === "PAID" ? "Payée" : i.status === "PARTIAL" ? "Partielle" : i.status === "OVERDUE" ? "En retard" : "En attente",
            Échéance: i.due_date || "",
            "Date création": formatDate(new Date(i.created_at), "dd/MM/yyyy", { locale: fr }),
          }));
          filename = "factures";
          break;
        }
      }

      let rowCount = 0;
      if (format === "csv") {
        rowCount = exportToCSV(data, filename);
        toast.success(`Export ${exportConfigs[exportType].label} réussi (${rowCount} lignes)`);
      } else if (format === "json") {
        rowCount = exportToJSON(data, filename);
        toast.success(`Export JSON ${exportConfigs[exportType].label} réussi (${rowCount} lignes)`);
      } else {
        const headers = selectedFields.filter(h => data.length > 0 && Object.keys(data[0]).includes(h));
        rowCount = data.length;
        const htmlContent = `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <title>Export ${exportConfigs[exportType].label}</title>
            <style>
              body { font-family: Arial, sans-serif; margin: 20px; }
              h1 { color: #333; margin-bottom: 20px; }
              table { border-collapse: collapse; width: 100%; margin-top: 20px; }
              th, td { border: 1px solid #ddd; padding: 8px; text-align: left; font-size: 11px; }
              th { background-color: #4f46e5; color: white; }
              tr:nth-child(even) { background-color: #f9fafb; }
              .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #4f46e5; padding-bottom: 10px; margin-bottom: 20px; }
              .date { color: #666; font-size: 14px; }
              .stats { margin-top: 20px; padding: 10px; background: #f3f4f6; border-radius: 8px; }
              @media print { .no-print { display: none; } }
            </style>
          </head>
          <body>
            <div class="header">
              <h1>${escapeHTML(tenant?.name || "Export")} - ${exportConfigs[exportType].label}</h1>
              <span class="date">Généré le ${formatDate(new Date(), "dd MMMM yyyy à HH:mm", { locale: fr })}</span>
            </div>
            <div class="stats">
              <strong>Total: ${data.length} enregistrements</strong> | 
              Colonnes exportées: ${headers.length}
            </div>
            <table>
              <thead>
                <tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr>
              </thead>
              <tbody>
                ${data.map((row) => `<tr>${headers.map((h) => `<td>${escapeHTML(String(row[h] ?? ""))}</td>`).join("")}</tr>`).join("")}
              </tbody>
            </table>
          </body>
          </html>
        `;

        const printWindow = window.open("", "_blank");
        if (printWindow) {
          printWindow.document.write(htmlContent);
          printWindow.document.close();
          printWindow.onload = () => { printWindow.print(); };
        }
        toast.success("Document prêt pour impression/PDF");
      }

      if (rowCount > 0) {
        setExportHistory(prev => [
          { type: exportConfigs[exportType].label, format, date: new Date(), rows: rowCount },
          ...prev.slice(0, 9)
        ]);
      }
    } catch (error) {
      toast.error("Erreur lors de l'export");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <AdvancedExportHeader
        title="Exports Avancés"
        description="Exportez vos données en CSV, JSON ou PDF"
      />

      <Tabs defaultValue="export" className="space-y-6">
        <TabsList className="bg-muted/50 p-1">
          <TabsTrigger value="export" className="px-6">Nouvel Export</TabsTrigger>
          <TabsTrigger value="history" className="px-6">Historique</TabsTrigger>
        </TabsList>

        <TabsContent value="export">
          <div className="grid lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1 space-y-4">
              <ExportTypeSelector
                configs={exportConfigs}
                selectedType={exportType}
                onTypeChange={handleExportTypeChange}
              />
            </div>

            <div className="lg:col-span-2 space-y-6 focus-visible:outline-none">
              <ExportFieldSelector
                fields={exportConfigs[exportType].fields}
                selectedFields={selectedFields}
                onToggleField={toggleField}
                onSelectAll={() => setSelectedFields(exportConfigs[exportType].fields)}
                onSelectNone={() => setSelectedFields([])}
              />

              <ExportFilters
                exportType={exportType}
                classrooms={classrooms}
                terms={terms}
                selectedClassroom={selectedClassroom}
                selectedTerm={selectedTerm}
                onClassroomChange={setSelectedClassroom}
                onTermChange={setSelectedTerm}
              />

              <ExportActionButtons
                isExporting={isExporting}
                selectedFieldsCount={selectedFields.length}
                onExport={handleExport}
                label={exportConfigs[exportType].label}
              />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="history">
          <ExportHistory history={exportHistory} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
