import { useState, useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { useStudentLabel } from "@/hooks/useStudentLabel";
import { getMatriculeConfig } from "@/lib/matricule";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import { Upload, FileSpreadsheet, Check, AlertCircle, X } from "lucide-react";
import { toast } from "sonner";

interface ParsedRow {
  [key: string]: string;
}

interface ColumnMapping {
  csvColumn: string;
  dbColumn: string;
}

const DB_COLUMNS = [
  { value: "first_name", label: "Prénom" },
  { value: "last_name", label: "Nom" },
  { value: "email", label: "Email" },
  { value: "date_of_birth", label: "Date de naissance" },
  { value: "gender", label: "Genre" },
  { value: "phone", label: "Téléphone" },
  { value: "address", label: "Adresse" },
  { value: "emergency_contact", label: "Contact d'urgence" },
  { value: "emergency_phone", label: "Téléphone d'urgence" },
  { value: "registration_number", label: "N° Étudiant" },
  { value: "skip", label: "— Ignorer —" },
];

const AUTO_MAPPING: Record<string, string> = {
  prenom: "first_name",
  prénom: "first_name",
  firstname: "first_name",
  "first name": "first_name",
  nom: "last_name",
  lastname: "last_name",
  "last name": "last_name",
  email: "email",
  "e-mail": "email",
  courriel: "email",
  "date de naissance": "date_of_birth",
  "date naissance": "date_of_birth",
  dob: "date_of_birth",
  dateofbirth: "date_of_birth",
  birthdate: "date_of_birth",
  naissance: "date_of_birth",
  genre: "gender",
  sexe: "gender",
  gender: "gender",
  sex: "gender",
  telephone: "phone",
  téléphone: "phone",
  phone: "phone",
  tel: "phone",
  adresse: "address",
  address: "address",
  "contact urgence": "emergency_contact",
  "emergency contact": "emergency_contact",
  "tel urgence": "emergency_phone",
  "téléphone urgence": "emergency_phone",
  matricule: "registration_number",
  "numéro étudiant": "registration_number",
  "numero etudiant": "registration_number",
  "registration number": "registration_number",
  "n° étudiant": "registration_number",
  "n° etudiant": "registration_number",
  "no etudiant": "registration_number",
};

export const StudentImport = () => {
  const { tenant } = useTenant();
  const { studentsLabel, StudentsLabel } = useStudentLabel();
  const studentsLabelLower = studentsLabel.toLowerCase();
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState<"upload" | "mapping" | "preview" | "result">("upload");
  const [csvData, setCsvData] = useState<ParsedRow[]>([]);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [columnMappings, setColumnMappings] = useState<ColumnMapping[]>([]);
  const [importResult, setImportResult] = useState<{ success: number; errors: string[] }>({ success: 0, errors: [] });

  const parseCSV = (text: string): { headers: string[]; data: ParsedRow[] } => {
    const lines = text.split(/\r?\n/).filter(line => line.trim());
    if (lines.length === 0) return { headers: [], data: [] };

    // Detect delimiter
    const firstLine = lines[0];
    const delimiter = firstLine.includes(";") ? ";" : ",";

    const headers = firstLine.split(delimiter).map(h => h.trim().replace(/^["']|["']$/g, ""));
    const data: ParsedRow[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(delimiter).map(v => v.trim().replace(/^["']|["']$/g, ""));
      const row: ParsedRow = {};
      headers.forEach((header, index) => {
        row[header] = values[index] || "";
      });
      data.push(row);
    }

    return { headers, data };
  };

  const handleFileUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const { headers, data } = parseCSV(text);

      if (headers.length === 0 || data.length === 0) {
        toast.error("Fichier vide ou format invalide");
        return;
      }

      setCsvHeaders(headers);
      setCsvData(data);

      // Auto-map columns
      const mappings: ColumnMapping[] = headers.map(header => {
        const normalizedHeader = header.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const autoMatch = AUTO_MAPPING[normalizedHeader] || "skip";
        return { csvColumn: header, dbColumn: autoMatch };
      });
      setColumnMappings(mappings);
      setStep("mapping");
    };
    reader.readAsText(file);
  }, []);

  const updateMapping = (csvColumn: string, dbColumn: string) => {
    setColumnMappings(prev =>
      prev.map(m => m.csvColumn === csvColumn ? { ...m, dbColumn } : m)
    );
  };

  const getMappedData = (): Partial<any>[] => {
    return csvData.map(row => {
      const mappedRow: Record<string, string> = {};
      columnMappings.forEach(({ csvColumn, dbColumn }) => {
        if (dbColumn !== "skip" && row[csvColumn]) {
          mappedRow[dbColumn] = row[csvColumn];
        }
      });
      return mappedRow;
    });
  };

  const importMutation = useMutation({
    mutationFn: async (students: Partial<any>[]) => {
      const results = { success: 0, errors: [] as string[] };

      // Fetch current matricule config
      const { data: tenantData } = await supabase
        .from("tenants")
        .select("settings")
        .eq("id", tenant?.id)
        .single();

      const settings = tenantData?.settings as Record<string, unknown> | null;
      const matriculeConfig = getMatriculeConfig(settings);

      for (let i = 0; i < students.length; i++) {
        const student = students[i];

        // Validate required fields
        if (!student.first_name || !student.last_name) {
          results.errors.push(`Ligne ${i + 2}: Prénom et nom requis`);
          continue;
        }

        // Generate registration_number using config
        let registrationNumber = student.registration_number; // Use provided registration_number if exists

        if (!registrationNumber) {
          const year = matriculeConfig.includeYear
            ? matriculeConfig.yearFormat === "full"
              ? new Date().getFullYear().toString()
              : new Date().getFullYear().toString().slice(-2)
            : "";

          const sequence = matriculeConfig.currentSequence
            .toString()
            .padStart(matriculeConfig.sequenceLength, "0");

          registrationNumber = `${matriculeConfig.prefix}${year}${sequence}`;

          // Increment local sequence
          matriculeConfig.currentSequence++;
        }

        const insertData = {
          first_name: student.first_name as string,
          last_name: student.last_name as string,
          email: student.email || null,
          date_of_birth: student.date_of_birth || null,
          gender: student.gender || null,
          phone: student.phone || null,
          address: student.address || null,
          emergency_contact: student.emergency_contact || null,
          emergency_phone: student.emergency_phone || null,
          tenant_id: tenant?.id as string,
          registration_number: registrationNumber,
        };

        const { error } = await supabase.from("students").insert(insertData);

        if (error) {
          results.errors.push(`Ligne ${i + 2}: ${error.message}`);
        } else {
          results.success++;
        }
      }

      // Update tenant settings with new sequence if any students were imported
      if (results.success > 0) {
        const updatedSettings = {
          ...settings,
          matricule: matriculeConfig,
        };

        await supabase
          .from("tenants")
          .update({ settings: updatedSettings })
          .eq("id", tenant?.id);
      }

      return results;
    },
    onSuccess: (results) => {
      setImportResult(results);
      setStep("result");
      queryClient.invalidateQueries({ queryKey: ["students"] });

      if (results.success > 0) {
        toast.success(`${results.success} ${studentsLabelLower} importé(s) avec succès`);
      }
    },
    onError: () => {
      toast.error("Erreur lors de l'import");
    },
  });

  const handleImport = () => {
    const mappedData = getMappedData();
    importMutation.mutate(mappedData);
  };

  const resetImport = () => {
    setCsvData([]);
    setCsvHeaders([]);
    setColumnMappings([]);
    setStep("upload");
    setImportResult({ success: 0, errors: [] });
  };

  const previewData = getMappedData().slice(0, 5);
  const hasRequiredFields = columnMappings.some(m => m.dbColumn === "first_name") &&
    columnMappings.some(m => m.dbColumn === "last_name");

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { setIsOpen(open); if (!open) resetImport(); }}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Upload className="w-4 h-4 mr-2" />
          Importer CSV
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5" />
            Import en masse des {studentsLabelLower}
          </DialogTitle>
        </DialogHeader>

        {step === "upload" && (
          <div className="space-y-4">
            <Card className="border-dashed">
              <CardContent className="p-8">
                <div className="text-center">
                  <Upload className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-lg font-medium mb-2">Glissez un fichier CSV ou Excel</p>
                  <p className="text-sm text-muted-foreground mb-4">
                    Format supporté: CSV (séparateur virgule ou point-virgule)
                  </p>
                  <input
                    type="file"
                    accept=".csv,.txt"
                    onChange={handleFileUpload}
                    className="hidden"
                    id="csv-upload"
                  />
                  <label htmlFor="csv-upload">
                    <Button asChild>
                      <span>Sélectionner un fichier</span>
                    </Button>
                  </label>
                </div>
              </CardContent>
            </Card>
            <div className="bg-muted/50 p-4 rounded-lg">
              <p className="text-sm font-medium mb-2">Colonnes recommandées:</p>
              <p className="text-xs text-muted-foreground">
                Prénom, Nom, Email, Date de naissance, Genre, Téléphone, Adresse
              </p>
            </div>
          </div>
        )}

        {step === "mapping" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Associez les colonnes de votre fichier aux champs de la base de données.
              {csvData.length} lignes détectées.
            </p>

            <div className="grid gap-3">
              {columnMappings.map((mapping) => (
                <div key={mapping.csvColumn} className="flex items-center gap-4">
                  <div className="w-1/3">
                    <Label className="text-sm font-medium">{mapping.csvColumn}</Label>
                    <p className="text-xs text-muted-foreground truncate">
                      Ex: {csvData[0]?.[mapping.csvColumn] || "—"}
                    </p>
                  </div>
                  <span className="text-muted-foreground">→</span>
                  <Select
                    value={mapping.dbColumn}
                    onValueChange={(value) => updateMapping(mapping.csvColumn, value)}
                  >
                    <SelectTrigger className="flex-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DB_COLUMNS.map((col) => (
                        <SelectItem key={col.value} value={col.value}>
                          {col.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>

            {!hasRequiredFields && (
              <div className="flex items-center gap-2 text-destructive text-sm">
                <AlertCircle className="w-4 h-4" />
                Vous devez mapper au moins le Prénom et le Nom
              </div>
            )}

            <div className="flex justify-between pt-4">
              <Button variant="outline" onClick={resetImport}>
                Retour
              </Button>
              <Button onClick={() => setStep("preview")} disabled={!hasRequiredFields}>
                Prévisualiser
              </Button>
            </div>
          </div>
        )}

        {step === "preview" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Aperçu des 5 premières lignes. Total: {csvData.length} {studentsLabelLower} à importer.
            </p>

            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {columnMappings
                      .filter(m => m.dbColumn !== "skip")
                      .map(m => (
                        <TableHead key={m.dbColumn}>
                          {DB_COLUMNS.find(c => c.value === m.dbColumn)?.label}
                        </TableHead>
                      ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {previewData.map((row, index) => (
                    <TableRow key={index}>
                      {columnMappings
                        .filter(m => m.dbColumn !== "skip")
                        .map(m => (
                          <TableCell key={m.dbColumn}>
                            {row[m.dbColumn] || "—"}
                          </TableCell>
                        ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="flex justify-between pt-4">
              <Button variant="outline" onClick={() => setStep("mapping")}>
                Modifier le mapping
              </Button>
              <Button onClick={handleImport} disabled={importMutation.isPending}>
                {importMutation.isPending ? "Import en cours..." : `Importer ${csvData.length} ${studentsLabelLower}`}
              </Button>
            </div>
          </div>
        )}

        {step === "result" && (
          <div className="space-y-4">
            <div className="flex items-center gap-4 p-4 bg-success/10 rounded-lg">
              <Check className="w-8 h-8 text-success" />
              <div>
                <p className="font-medium">{importResult.success} {studentsLabelLower} importé(s) avec succès</p>
                {importResult.errors.length > 0 && (
                  <p className="text-sm text-muted-foreground">
                    {importResult.errors.length} erreur(s)
                  </p>
                )}
              </div>
            </div>

            {importResult.errors.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2 text-destructive">
                    <AlertCircle className="w-4 h-4" />
                    Erreurs d'import
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="text-sm space-y-1">
                    {importResult.errors.slice(0, 10).map((error, i) => (
                      <li key={i} className="text-muted-foreground">{error}</li>
                    ))}
                    {importResult.errors.length > 10 && (
                      <li className="text-muted-foreground">
                        ... et {importResult.errors.length - 10} autres erreurs
                      </li>
                    )}
                  </ul>
                </CardContent>
              </Card>
            )}

            <div className="flex justify-end">
              <Button onClick={() => { setIsOpen(false); resetImport(); }}>
                Fermer
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
