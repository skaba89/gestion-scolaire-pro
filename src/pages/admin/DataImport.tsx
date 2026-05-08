import { useState, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { apiClient } from "@/api/client";
import { PlanGate } from "@/components/ui/PlanGate";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  Upload, FileSpreadsheet, CheckCircle2, XCircle, AlertTriangle,
  Download, ArrowRight, RefreshCcw, Users, ChevronRight,
  Table, Info
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────

interface PreviewRow {
  first_name: string;
  last_name: string;
  date_of_birth: string;
  gender: string;
  registration_number: string;
  level: string;
  class_name: string;
  academic_year: string;
  email: string;
  parent_name: string;
  parent_phone: string;
  _errors: string[];
}

interface PreviewResult {
  total_rows: number;
  headers: string[];
  mapping: Record<string, string | null>;
  preview: PreviewRow[];
  validation_errors: string[];
  has_errors: boolean;
  required_missing: string[];
}

interface ImportResult {
  created: number;
  skipped: number;
  errors: Array<{ row: number; error: string }>;
  total: number;
  message: string;
}

type Step = "upload" | "preview" | "importing" | "done";

// ── Step indicator ─────────────────────────────────────────────────────────────

// STEPS labels are set dynamically inside component using t()
const STEP_IDS = ["upload", "preview", "importing", "done"];

const StepBar = ({ current, steps }: { current: Step; steps: { id: string; label: string }[] }) => {
  const idx = steps.findIndex(s => s.id === current);
  return (
    <div className="flex items-center gap-0 mb-8">
      {steps.map((step, i) => (
        <div key={step.id} className="flex items-center">
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-colors
            ${i < idx ? "bg-green-100 text-green-700" :
              i === idx ? "bg-primary text-white" : "bg-muted text-muted-foreground"}`}>
            {i < idx
              ? <CheckCircle2 className="w-4 h-4" />
              : <span className="w-4 h-4 inline-flex items-center justify-center rounded-full border border-current text-xs font-bold">{i + 1}</span>
            }
            <span className="hidden sm:inline">{step.label}</span>
          </div>
          {i < STEPS.length - 1 && (
            <ChevronRight className="w-4 h-4 text-muted-foreground mx-1" />
          )}
        </div>
      ))}
    </div>
  );
};

// ── Main component ─────────────────────────────────────────────────────────────

function DataImportContent() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const STEPS = [
    { id: "upload", label: t("dataImport.stepUpload") },
    { id: "preview", label: t("dataImport.stepPreview") },
    { id: "importing", label: t("dataImport.stepImporting") },
    { id: "done", label: t("dataImport.stepDone") },
  ];
  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [skipErrors, setSkipErrors] = useState(false);
  const [defaultYear, setDefaultYear] = useState(`${new Date().getFullYear()}-${new Date().getFullYear() + 1}`);

  // ── Drag-and-drop ────────────────────────────────────────────────────────────

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) acceptFile(dropped);
  }, []);

  const acceptFile = (f: File) => {
    const ext = f.name.split(".").pop()?.toLowerCase();
    if (!["csv", "txt"].includes(ext || "")) {
      toast({
        title: t("dataImport.unsupportedFormat"),
        description: t("dataImport.unsupportedFormatDesc"),
        variant: "destructive",
      });
      return;
    }
    setFile(f);
    setPreview(null);
    setResult(null);
    setStep("upload");
  };

  // ── Preview ──────────────────────────────────────────────────────────────────

  const handlePreview = async () => {
    if (!file) return;
    setLoading(true);
    setProgress(30);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await apiClient.post<PreviewResult>("/import/students/preview/", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setPreview(res.data);
      setProgress(100);
      setStep("preview");
    } catch (err: any) {
      toast({
        title: t("dataImport.analysisError"),
        description: err.response?.data?.detail || err.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      setProgress(0);
    }
  };

  // ── Confirm import ────────────────────────────────────────────────────────────

  const handleConfirm = async () => {
    if (!file) return;
    setStep("importing");
    setLoading(true);
    setProgress(10);

    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("skip_errors", String(skipErrors));
      fd.append("default_academic_year", defaultYear);

      // Simulate progress
      const interval = setInterval(() => {
        setProgress(p => Math.min(p + 8, 85));
      }, 400);

      const res = await apiClient.post<ImportResult>("/import/students/confirm/", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      clearInterval(interval);
      setProgress(100);
      setResult(res.data);
      setStep("done");

      toast({
        title: t("dataImport.importDone"),
        description: res.data.message,
      });
    } catch (err: any) {
      toast({
        title: t("dataImport.importError"),
        description: err.response?.data?.detail || err.message,
        variant: "destructive",
      });
      setStep("preview");
    } finally {
      setLoading(false);
    }
  };

  // ── Template download ─────────────────────────────────────────────────────────

  const downloadTemplate = async () => {
    try {
      const res = await apiClient.get("/import/students/template/", { responseType: "blob" });
      const url = URL.createObjectURL(new Blob([res.data], { type: "text/csv;charset=utf-8;" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = "modele_import_eleves.csv";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      toast({ title: t("dataImport.downloadError"), description: t("dataImport.downloadErrorDesc"), variant: "destructive" });
    }
  };

  const reset = () => {
    setFile(null);
    setPreview(null);
    setResult(null);
    setStep("upload");
    setProgress(0);
  };

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Upload className="w-6 h-6 text-primary" />
            {t("dataImport.pageTitle")}
          </h1>
          <p className="text-muted-foreground mt-1">
            {t("dataImport.pageSubtitle")}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={downloadTemplate} className="gap-2 shrink-0">
          <Download className="w-4 h-4" />
          {t("dataImport.downloadTemplate")}
        </Button>
      </div>

      <StepBar current={step} steps={STEPS} />

      {/* ── Step 1 : Upload ─────────────────────────────────────────────── */}
      {(step === "upload") && (
        <div className="space-y-4">
          <Alert className="border-blue-200 bg-blue-50">
            <Info className="w-4 h-4 text-blue-600" />
            <AlertDescription className="text-blue-700 text-sm">
              <strong>Depuis Excel :</strong> Fichier → Enregistrer sous → CSV (séparateur point-virgule) (.csv)
              <br />
              Colonnes reconnues automatiquement en français et en anglais. Téléchargez le modèle pour voir le format attendu.
            </AlertDescription>
          </Alert>

          {/* Drop zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors
              ${dragging ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/30"}
              ${file ? "border-green-500 bg-green-50" : ""}`}
          >
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.txt"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) acceptFile(f); }}
            />
            {file ? (
              <div className="space-y-2">
                <FileSpreadsheet className="w-12 h-12 text-green-600 mx-auto" />
                <p className="font-semibold text-green-700">{file.name}</p>
                <p className="text-sm text-green-600">
                  {(file.size / 1024).toFixed(1)} Ko · Cliquez pour changer de fichier
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <Upload className="w-12 h-12 text-muted-foreground mx-auto" />
                <div>
                  <p className="text-base font-medium">{t("dataImport.dropHere")}</p>
                  <p className="text-sm text-muted-foreground">{t("dataImport.clickToSelect")}</p>
                </div>
                <p className="text-xs text-muted-foreground">{t("dataImport.csvOnly")}</p>
              </div>
            )}
          </div>

          {progress > 0 && <Progress value={progress} className="h-2" />}

          <div className="flex justify-end">
            <Button onClick={handlePreview} disabled={!file || loading} className="gap-2">
              {loading ? <RefreshCcw className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
              {loading ? t("dataImport.analyzing") : t("dataImport.analyze")}
            </Button>
          </div>
        </div>
      )}

      {/* ── Step 2 : Preview ────────────────────────────────────────────── */}
      {step === "preview" && preview && (
        <div className="space-y-6">
          {/* Summary */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Card className="text-center">
              <CardContent className="pt-4">
                <p className="text-2xl font-bold text-primary">{preview.total_rows}</p>
                <p className="text-xs text-muted-foreground">{t("dataImport.detectedRows")}</p>
              </CardContent>
            </Card>
            <Card className="text-center">
              <CardContent className="pt-4">
                <p className="text-2xl font-bold text-green-600">
                  {Object.values(preview.mapping).filter(Boolean).length}
                </p>
                <p className="text-xs text-muted-foreground">{t("dataImport.recognizedColumns")}</p>
              </CardContent>
            </Card>
            <Card className="text-center">
              <CardContent className="pt-4">
                <p className="text-2xl font-bold text-orange-500">{preview.validation_errors.length}</p>
                <p className="text-xs text-muted-foreground">{t("dataImport.warnings")}</p>
              </CardContent>
            </Card>
            <Card className="text-center">
              <CardContent className="pt-4">
                <p className="text-2xl font-bold text-red-500">{preview.required_missing.length}</p>
                <p className="text-xs text-muted-foreground">{t("dataImport.missingColumns")}</p>
              </CardContent>
            </Card>
          </div>

          {/* Missing required columns */}
          {preview.required_missing.length > 0 && (
            <Alert variant="destructive">
              <XCircle className="w-4 h-4" />
              <AlertDescription>
                <strong>Colonnes obligatoires non trouvées :</strong>{" "}
                {preview.required_missing.join(", ")}.
                {" "}Vérifiez les entêtes de votre fichier ou téléchargez le modèle.
              </AlertDescription>
            </Alert>
          )}

          {/* Column mapping */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Table className="w-4 h-4" />
                Correspondance des colonnes
              </CardTitle>
              <CardDescription>Colonnes reconnues automatiquement dans votre fichier</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {Object.entries(preview.mapping).map(([field, col]) => (
                  <div key={field} className="flex items-center gap-2 p-2 rounded-md bg-muted/30 border text-sm">
                    {col
                      ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />
                      : <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                    }
                    <span className="text-muted-foreground font-mono text-xs">{field}</span>
                    <ArrowRight className="w-3 h-3 text-muted-foreground shrink-0" />
                    <span className="font-medium truncate">{col || "—"}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Data preview table */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Aperçu des données (10 premières lignes)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b">
                      {["Prénom", "Nom", "Naissance", "Sexe", "Niveau", "Classe", "Parent"].map(h => (
                        <th key={h} className="text-left py-2 px-3 font-medium text-muted-foreground">{h}</th>
                      ))}
                      <th className="text-left py-2 px-3 font-medium text-muted-foreground">Statut</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.preview.map((row, i) => (
                      <tr key={i} className={`border-b last:border-0 ${row._errors.length ? "bg-orange-50" : ""}`}>
                        <td className="py-2 px-3">{row.first_name || <span className="text-red-400">—</span>}</td>
                        <td className="py-2 px-3">{row.last_name || <span className="text-red-400">—</span>}</td>
                        <td className="py-2 px-3 font-mono">{row.date_of_birth}</td>
                        <td className="py-2 px-3">
                          <Badge variant="outline" className={
                            row.gender === "MALE" ? "border-blue-400 text-blue-700" :
                            row.gender === "FEMALE" ? "border-pink-400 text-pink-700" :
                            "text-muted-foreground"
                          }>
                            {row.gender === "MALE" ? "M" : row.gender === "FEMALE" ? "F" : "?"}
                          </Badge>
                        </td>
                        <td className="py-2 px-3">{row.level}</td>
                        <td className="py-2 px-3">{row.class_name}</td>
                        <td className="py-2 px-3">{row.parent_name}</td>
                        <td className="py-2 px-3">
                          {row._errors.length > 0
                            ? <Badge variant="outline" className="border-orange-400 text-orange-700 text-xs">
                                {row._errors.length} avert.
                              </Badge>
                            : <CheckCircle2 className="w-4 h-4 text-green-500" />
                          }
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Import options */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Options d'import</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-3 rounded-lg border">
                <div>
                  <Label className="font-medium">Ignorer les lignes avec erreurs</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Si désactivé, l'import s'arrête sur la première erreur de validation
                  </p>
                </div>
                <Switch checked={skipErrors} onCheckedChange={setSkipErrors} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="defaultYear">Année scolaire par défaut</Label>
                <Input
                  id="defaultYear"
                  value={defaultYear}
                  onChange={(e) => setDefaultYear(e.target.value)}
                  placeholder="2024-2025"
                  className="w-48"
                />
                <p className="text-xs text-muted-foreground">
                  Utilisée pour les lignes sans année scolaire dans le fichier
                </p>
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-between">
            <Button variant="outline" onClick={reset} className="gap-2">
              <RefreshCcw className="w-4 h-4" />
              {t("dataImport.restart")}
            </Button>
            <Button
              onClick={handleConfirm}
              disabled={preview.required_missing.length > 0}
              className="gap-2"
            >
              <Users className="w-4 h-4" />
              {t("dataImport.importCount", { count: preview.total_rows })}
            </Button>
          </div>
        </div>
      )}

      {/* ── Step 3 : Importing ──────────────────────────────────────────── */}
      {step === "importing" && (
        <Card>
          <CardContent className="py-16 text-center space-y-6">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto animate-pulse">
              <Upload className="w-8 h-8 text-primary" />
            </div>
            <div>
              <p className="text-lg font-semibold">{t("dataImport.importing")}</p>
              <p className="text-sm text-muted-foreground mt-1">
                {t("dataImport.importingDesc")}
              </p>
            </div>
            <div className="max-w-sm mx-auto">
              <Progress value={progress} className="h-3" />
              <p className="text-xs text-muted-foreground mt-2">{progress}%</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Step 4 : Done ──────────────────────────────────────────────── */}
      {step === "done" && result && (
        <div className="space-y-6">
          <Card className="border-green-200 bg-green-50">
            <CardContent className="py-10 text-center space-y-4">
              <CheckCircle2 className="w-16 h-16 text-green-600 mx-auto" />
              <div>
                <p className="text-2xl font-bold text-green-800">{result.message}</p>
              </div>
              <div className="flex justify-center gap-8">
                <div className="text-center">
                  <p className="text-3xl font-bold text-green-600">{result.created}</p>
                  <p className="text-sm text-green-700">{t("dataImport.imported")}</p>
                </div>
                <div className="text-center">
                  <p className="text-3xl font-bold text-orange-500">{result.skipped}</p>
                  <p className="text-sm text-orange-600">{t("dataImport.skipped")}</p>
                </div>
                <div className="text-center">
                  <p className="text-3xl font-bold text-muted-foreground">{result.total}</p>
                  <p className="text-sm text-muted-foreground">{t("dataImport.total")}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Error details */}
          {result.errors.length > 0 && (
            <Card className="border-orange-200">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2 text-orange-700">
                  <AlertTriangle className="w-4 h-4" />
                  Lignes ignorées ({result.errors.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {result.errors.map((e, i) => (
                    <div key={i} className="flex items-start gap-2 text-sm p-2 rounded bg-orange-50 border border-orange-200">
                      <XCircle className="w-4 h-4 text-orange-500 shrink-0 mt-0.5" />
                      <span><strong>Ligne {e.row} :</strong> {e.error}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <div className="flex justify-between">
            <Button variant="outline" onClick={reset} className="gap-2">
              <Upload className="w-4 h-4" />
              {t("dataImport.newImport")}
            </Button>
            <Button onClick={() => window.location.href = "../students"} className="gap-2">
              <Users className="w-4 h-4" />
              {t("dataImport.viewStudents")}
            </Button>
          </div>
        </div>
      )}

      {/* ── How-to guide ─────────────────────────────────────────────────── */}
      {step === "upload" && (
        <Card className="bg-muted/30">
          <CardHeader>
            <CardTitle className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
              <Info className="w-4 h-4" />
              Comment préparer votre fichier ?
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid sm:grid-cols-3 gap-4 text-sm">
              <div className="space-y-2">
                <p className="font-medium">1. Téléchargez le modèle</p>
                <p className="text-muted-foreground text-xs">
                  Cliquez sur "Télécharger le modèle CSV" pour obtenir un fichier exemple
                  avec toutes les colonnes supportées.
                </p>
              </div>
              <div className="space-y-2">
                <p className="font-medium">2. Remplissez vos données</p>
                <p className="text-muted-foreground text-xs">
                  Ouvrez le modèle dans Excel ou LibreOffice. Remplissez les données de
                  vos élèves. Supprimez les lignes exemple.
                </p>
              </div>
              <div className="space-y-2">
                <p className="font-medium">3. Exportez en CSV</p>
                <p className="text-muted-foreground text-xs">
                  Dans Excel : Fichier → Enregistrer sous → CSV (séparateur point-virgule).
                  Glissez le fichier ici.
                </p>
              </div>
            </div>
            <div className="mt-4 p-3 rounded-md bg-amber-50 border border-amber-200 text-xs text-amber-700">
              <strong>Colonnes obligatoires :</strong> prenom, nom, date_naissance
              <br />
              <strong>Formats date acceptés :</strong> DD/MM/YYYY · YYYY-MM-DD · DD-MM-YYYY
              <br />
              <strong>Valeurs sexe :</strong> M / F · Male / Female · Masculin / Féminin
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function DataImport() {
  return (
    <PlanGate minPlan="pro">
      <DataImportContent />
    </PlanGate>
  );
}
