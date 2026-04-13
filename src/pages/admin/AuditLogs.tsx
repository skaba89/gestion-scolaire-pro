import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { fr } from "date-fns/locale";
import {
  Activity,
  LogIn,
  LogOut,
  UserPlus,
  Edit,
  Trash2,
  RefreshCw,
} from "lucide-react";
import { useAuditLogs } from "@/hooks/queries/useAuditLogs";
import { useStudentLabel } from "@/hooks/useStudentLabel";
import { escapeHTML } from '@/lib/security';

// Modular components
import { AuditLogHeader } from "@/components/admin/audit/AuditLogHeader";
import { AuditLogFilters } from "@/components/admin/audit/AuditLogFilters";
import { AuditLogTable } from "@/components/admin/audit/AuditLogTable";

import { DataTablePagination } from "@/components/ui/DataTablePagination";

const ACTION_LABELS: Record<string, { label: string; icon: any; color: string }> = {
  LOGIN: { label: "Connexion", icon: LogIn, color: "bg-green-500" },
  LOGOUT: { label: "Déconnexion", icon: LogOut, color: "bg-gray-500" },
  CREATE: { label: "Création", icon: UserPlus, color: "bg-blue-500" },
  INSERT: { label: "Insertion", icon: UserPlus, color: "bg-blue-500" },
  UPDATE: { label: "Modification", icon: Edit, color: "bg-amber-500" },
  DELETE: { label: "Suppression", icon: Trash2, color: "bg-red-500" },
  SOFT_DELETE: { label: "Suppression (Soft)", icon: Trash2, color: "bg-orange-500" },
  PASSWORD_RESET: { label: "Réinit. mot de passe", icon: RefreshCw, color: "bg-purple-500" },
};

const SEVERITY_COLORS: Record<string, string> = {
  INFO: "bg-blue-500/10 text-blue-600 border-blue-200",
  WARNING: "bg-amber-500/10 text-amber-600 border-amber-200",
  CRITICAL: "bg-red-500/10 text-red-600 border-red-200",
};

const AuditLogs = () => {
  const { studentLabel, StudentsLabel } = useStudentLabel();
  const { toast } = useToast();

  const TABLE_LABELS: Record<string, string> = {
    profiles: "Profils",
    user_roles: "Rôles",
    students: StudentsLabel,
    teachers: "Enseignants",
    classrooms: "Classes",
    grades: "Notes",
    attendance: "Présences",
    invoices: "Factures",
    payments: "Paiements",
    homework: "Devoirs",
    messages: "Messages",
    enrollments: "Inscriptions",
    assessments: "Évaluations",
  };

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [tableFilter, setTableFilter] = useState<string>("all");

  // Date filters - default to current month
  const [startDate, setStartDate] = useState<string>(
    format(startOfMonth(new Date()), "yyyy-MM-dd")
  );
  const [endDate, setEndDate] = useState<string>(
    format(endOfMonth(new Date()), "yyyy-MM-dd")
  );

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const { data, isLoading, refetch } = useAuditLogs({
    action: actionFilter,
    table: tableFilter,
    startDate,
    endDate,
    searchQuery,
    page: currentPage,
    pageSize
  });

  useEffect(() => {
    setCurrentPage(1);
  }, [actionFilter, tableFilter, startDate, endDate, searchQuery]);

  const logs = data?.logs || [];
  const totalCount = data?.totalCount || 0;
  const totalPages = Math.ceil(totalCount / pageSize);

  const uniqueActions = ["LOGIN", "LOGOUT", "CREATE", "UPDATE", "DELETE"];
  // Since uniqueTables depends on data, let's derive it or use a fixed list
  const uniqueTables = Object.keys(TABLE_LABELS);

  const getActionInfo = (action: string) => {
    return ACTION_LABELS[action] || { label: action, icon: Activity, color: "bg-gray-500" };
  };

  const exportToCSV = () => {
    const headers = ["Date", "Utilisateur", "Email", "Action", "Table", "Niveau", "Détails"];
    const rows = logs.map(log => [
      log.created_at ? format(new Date(log.created_at), "dd/MM/yyyy HH:mm", { locale: fr }) : "",
      log.user_name || "",
      log.user_email || "Système",
      getActionInfo(log.action_type || log.action).label,
      TABLE_LABELS[log.entity_type || ""] || log.entity_type || "",
      log.severity || "INFO",
      log.new_values ? JSON.stringify(log.new_values).replace(/"/g, '""') : "",
    ]);

    const csvContent = [
      headers.join(";"),
      ...rows.map(row => row.map(cell => `"${String(cell)}"`).join(";"))
    ].join("\n");

    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `historique_actions_${format(new Date(), "yyyy-MM-dd")}.csv`;
    link.click();
    toast({ title: "Export CSV téléchargé" });
  };

  const exportToPDF = () => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    const htmlContent = `
          <html>
          <head>
            <title>Historique des Actions</title>
            <style>
              body { font-family: sans-serif; padding: 20px; font-size: 10px; }
              table { width: 100%; border-collapse: collapse; margin-top: 20px; }
              th, td { border: 1px solid #eee; padding: 8px; text-align: left; }
              th { background: #f9f9f9; }
            </style>
          </head>
          <body>
            <h2>Historique des Actions</h2>
            <p>Généré le ${format(new Date(), "dd/MM/yyyy à HH:mm", { locale: fr })}</p>
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Utilisateur</th>
                  <th>Action</th>
                  <th>Table</th>
                  <th>Détails</th>
                </tr>
              </thead>
              <tbody>
                ${logs.map(log => `
                  <tr>
                    <td>${log.created_at ? escapeHTML(format(new Date(log.created_at), "dd/MM/yyyy HH:mm")) : "-"}</td>
                    <td>${escapeHTML(log.user_name || log.user_email || "Système")}</td>
                    <td>${escapeHTML(getActionInfo(log.action_type || log.action).label)}</td>
                    <td>${escapeHTML(TABLE_LABELS[log.entity_type || ""] || log.entity_type || "-")}</td>
                    <td>${escapeHTML(JSON.stringify(log.new_values || {}).slice(0, 50))}...</td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </body>
          </html>
        `;

    printWindow.document.write(htmlContent);
    printWindow.document.close();
    printWindow.print();
  };

  return (
    <div className="space-y-6">
      <AuditLogHeader
        onExportCSV={exportToCSV}
        onExportPDF={exportToPDF}
        onRefresh={() => refetch()}
        isLoading={isLoading}
      />

      <AuditLogFilters
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        actionFilter={actionFilter}
        onActionChange={setActionFilter}
        tableFilter={tableFilter}
        onTableChange={setTableFilter}
        startDate={startDate}
        onStartDateChange={setStartDate}
        endDate={endDate}
        onEndDateChange={setEndDate}
        uniqueActions={uniqueActions}
        uniqueTables={uniqueTables}
        tableLabels={TABLE_LABELS}
        getActionInfo={getActionInfo}
        totalEntries={totalCount}
      />

      <AuditLogTable
        logs={logs}
        isLoading={isLoading}
        getActionInfo={getActionInfo}
        tableLabels={TABLE_LABELS}
        severityColors={SEVERITY_COLORS}
      />

      <DataTablePagination
        currentPage={currentPage}
        onPageChange={setCurrentPage}
        pageSize={pageSize}
        onPageSizeChange={setPageSize}
        totalCount={totalCount}
      />
    </div>
  );
};

export default AuditLogs;
