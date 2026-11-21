import { useState } from "react";
import { apiClient } from "@/api/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { format, startOfDay, addDays } from "date-fns";
import { fr } from "date-fns/locale";
import { Search, CalendarIcon, ArrowRightCircle, ArrowLeftCircle, Download } from "lucide-react";
import { cn } from "@/lib/utils";
import { useStudentLabel } from "@/hooks/useStudentLabel";

interface CheckIn {
  id: string;
  student_id: string;
  check_in_type: "ENTRY" | "EXIT" | null;
  checked_at: string;
  source: string | null;
  student?: {
    id: string;
    first_name: string;
    last_name: string;
    registration_number: string | null;
  };
}

interface CheckInHistoryProps {
  tenantId: string;
  userId: string;
}

export default function CheckInHistory({ tenantId, userId }: CheckInHistoryProps) {
  const { t } = useTranslation();
  const { StudentLabel, studentsLabel } = useStudentLabel();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const dayStart = startOfDay(selectedDate).toISOString();
  const nextDay = startOfDay(addDays(selectedDate, 1)).toISOString();
  const history = useQuery({
    queryKey: ["badge-check-in-history", tenantId, userId, dayStart, nextDay],
    queryFn: async ({ signal }) => {
      const response = await apiClient.get<CheckIn[]>("/student-check-ins/", {
        params: { tenant_id: tenantId, checked_at_gte: dayStart, checked_at_lt: nextDay, complete_day: true },
        signal,
      });
      return response.data;
    },
    retry: false,
    gcTime: 0,
    staleTime: 0,
    placeholderData: undefined,
  });
  const ready = history.isSuccess && !history.isFetching;
  const checkIns = ready ? history.data : [];

  const filteredCheckIns = checkIns.filter(checkIn => {
    const studentName = `${checkIn.student?.first_name} ${checkIn.student?.last_name}`.toLowerCase();
    const search = searchTerm.toLowerCase();
    return studentName.includes(search) ||
      checkIn.student?.registration_number?.toLowerCase().includes(search);
  });

  // Pagination logic
  const totalItems = filteredCheckIns.length;
  const totalPages = Math.ceil(totalItems / pageSize);
  const paginatedCheckIns = filteredCheckIns.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  // Stats for the day
  const totalEntries = checkIns.filter(c => c.check_in_type === "ENTRY").length;
  const totalExits = checkIns.filter(c => c.check_in_type === "EXIT").length;
  const uniqueStudents = new Set(checkIns.map(c => c.student_id)).size;

  const exportToCSV = () => {
    if (filteredCheckIns.length === 0) return;

    const headers = ["Heure", "Nom", "Prénom", "N° Étudiant", "Type", "Source"];
    const rows = filteredCheckIns.map(checkIn => [
      format(new Date(checkIn.checked_at), "HH:mm:ss"),
      checkIn.student?.last_name || "",
      checkIn.student?.first_name || "",
      checkIn.student?.registration_number || "",
      checkIn.check_in_type === "ENTRY" ? "Entrée" : checkIn.check_in_type === "EXIT" ? "Sortie" : "—",
      checkIn.source || "—"
    ]);

    const quote = (value: string) => {
      const safe = /^\s*[=+@-]/.test(value) ? "'" + value : value;
      return '"' + safe.replace(/"/g, '""') + '"';
    };
    const csvContent = [headers, ...rows].map(row => row.map(quote).join(";")).join("\r\n");

    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `pointages-${format(selectedDate, "yyyy-MM-dd")}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between flex-wrap gap-2">
          <span>Historique des pointages</span>
          <div className="flex items-center gap-4 text-sm font-normal">
            {ready && (
              <>
                <span className="flex items-center gap-1">
                  <ArrowRightCircle className="h-4 w-4 text-green-600" />
                  {totalEntries} entrées
                </span>
                <span className="flex items-center gap-1">
                  <ArrowLeftCircle className="h-4 w-4 text-orange-600" />
                  {totalExits} sorties
                </span>
                <span>{uniqueStudents} {studentsLabel.toLowerCase()}</span>
              </>
            )}
            <Button variant="outline" size="sm" onClick={exportToCSV} disabled={filteredCheckIns.length === 0}>
              <Download className="h-4 w-4 mr-1" />
              CSV
            </Button>
          </div>
        </CardTitle>
        <div className="flex flex-col sm:flex-row gap-4 pt-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Rechercher par nom ou numéro..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              className="pl-10"
            />
          </div>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "justify-start text-left font-normal min-w-[200px]",
                  !selectedDate && "text-muted-foreground"
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {format(selectedDate, "EEEE d MMMM yyyy", { locale: fr })}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={(date) => {
                  if (date) {
                    setSelectedDate(date);
                    setCurrentPage(1);
                  }
                }}
                locale={fr}
                initialFocus
              />
            </PopoverContent>
          </Popover>
        </div>
      </CardHeader>
      <CardContent>
        {history.isError && !history.isFetching ? (
          <div role="alert" className="text-center py-8">
            <p>{t("badges.historyLoadError")}</p>
            <Button variant="outline" onClick={() => history.refetch()}>{t("badges.historyRetry")}</Button>
          </div>
        ) : !ready ? (
          <div className="text-center py-8">Chargement...</div>
        ) : filteredCheckIns.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            Aucun pointage pour cette date
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Heure</TableHead>
                <TableHead>{StudentLabel}</TableHead>
                <TableHead>N° Étudiant</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Source</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedCheckIns.map((checkIn) => (
                <TableRow key={checkIn.id}>
                  <TableCell className="font-mono">
                    {format(new Date(checkIn.checked_at), "HH:mm:ss", { locale: fr })}
                  </TableCell>
                  <TableCell className="font-medium">
                    {checkIn.student?.first_name} {checkIn.student?.last_name}
                  </TableCell>
                  <TableCell>{checkIn.student?.registration_number || "-"}</TableCell>
                  <TableCell>
                    {checkIn.check_in_type === "ENTRY" ? (
                      <Badge className="bg-green-100 text-green-800">
                        <ArrowRightCircle className="h-3 w-3 mr-1" />
                        Entrée
                      </Badge>
                    ) : checkIn.check_in_type === "EXIT" ? (
                      <Badge className="bg-orange-100 text-orange-800">
                        <ArrowLeftCircle className="h-3 w-3 mr-1" />
                        Sortie
                      </Badge>
                    ) : "—"}
                  </TableCell>
                  <TableCell>
                    {checkIn.source || "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {/* Pagination Controls */}
        {totalItems > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-6 px-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>Afficher</span>
              <Select
                value={pageSize.toString()}
                onValueChange={(v) => {
                  setPageSize(parseInt(v));
                  setCurrentPage(1);
                }}
              >
                <SelectTrigger className="h-8 w-[70px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="20">20</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                </SelectContent>
              </Select>
              <span>par page</span>
              <span className="ml-4">
                {(currentPage - 1) * pageSize + 1}-{Math.min(currentPage * pageSize, totalItems)} sur {totalItems}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
              >
                Précédent
              </Button>
              <div className="flex items-center gap-1">
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter(p => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
                  .map((p, i, arr) => (
                    <div key={p} className="flex items-center gap-1">
                      {i > 0 && arr[i - 1] !== p - 1 && <span className="text-muted-foreground">...</span>}
                      <Button
                        variant={currentPage === p ? "default" : "outline"}
                        size="sm"
                        className="w-8 h-8 p-0"
                        onClick={() => setCurrentPage(p)}
                      >
                        {p}
                      </Button>
                    </div>
                  ))}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages || totalPages === 0}
              >
                Suivant
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
