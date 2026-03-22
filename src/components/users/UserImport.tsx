import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { Upload, FileSpreadsheet, Loader2, CheckCircle, XCircle, Download, AlertTriangle } from "lucide-react";
import { getRoleLabel, getInvitableRoles } from "@/lib/permissions";
import { useStudentLabel } from "@/hooks/useStudentLabel";

import { AppRole } from "@/lib/types";

interface ParsedUser {
  firstName: string;
  lastName: string;
  email: string;
  role: AppRole;
  password: string;
  status: "pending" | "success" | "error";
  error?: string;
}

interface UserImportProps {
  onImportComplete: () => void;
}

export const UserImport = ({ onImportComplete }: UserImportProps) => {
  const { tenant } = useTenant();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [parsedUsers, setParsedUsers] = useState<ParsedUser[]>([]);
  const [defaultRole, setDefaultRole] = useState<AppRole>("TEACHER");
  const [importProgress, setImportProgress] = useState(0);
  const [importResults, setImportResults] = useState<{ success: number; failed: number }>({ success: 0, failed: 0 });
  const { StudentLabel } = useStudentLabel();

  const generatePassword = () => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
    let password = "";
    for (let i = 0; i < 10; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
  };

  const parseCSV = (content: string): ParsedUser[] => {
    const lines = content.trim().split("\n");
    if (lines.length < 2) return [];

    const headers = lines[0].toLowerCase().split(/[,;]/).map(h => h.trim());
    const firstNameIdx = headers.findIndex(h => h.includes("prénom") || h.includes("prenom") || h.includes("first"));
    const lastNameIdx = headers.findIndex(h => h.includes("nom") || h.includes("last"));
    const emailIdx = headers.findIndex(h => h.includes("email") || h.includes("mail"));
    const roleIdx = headers.findIndex(h => h.includes("rôle") || h.includes("role"));

    if (emailIdx === -1) {
      toast({
        title: "Erreur de format",
        description: "La colonne email est requise",
        variant: "destructive",
      });
      return [];
    }

    const users: ParsedUser[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(/[,;]/).map(v => v.trim().replace(/^["']|["']$/g, ""));
      if (values.length < 2) continue;

      const email = values[emailIdx] || "";
      if (!email || !email.includes("@")) continue;

      const roleValue = roleIdx !== -1 ? values[roleIdx]?.toUpperCase() : "";
      const validRoles = getInvitableRoles();
      const role = validRoles.includes(roleValue as AppRole) ? (roleValue as AppRole) : defaultRole;

      users.push({
        firstName: firstNameIdx !== -1 ? values[firstNameIdx] || "" : "",
        lastName: lastNameIdx !== -1 ? values[lastNameIdx] || "" : "",
        email,
        role,
        password: generatePassword(),
        status: "pending",
      });
    }

    return users;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      const users = parseCSV(content);
      setParsedUsers(users);
    };
    reader.readAsText(file);
  };

  const handleImport = async () => {
    if (!tenant || parsedUsers.length === 0) return;

    setIsImporting(true);
    setImportProgress(0);
    setImportResults({ success: 0, failed: 0 });

    const updatedUsers = [...parsedUsers];
    let successCount = 0;
    let failedCount = 0;

    for (let i = 0; i < updatedUsers.length; i++) {
      const user = updatedUsers[i];

      try {
        const { error } = await supabase.functions.invoke("create-user-account", {
          body: {
            email: user.email,
            password: user.password,
            firstName: user.firstName,
            lastName: user.lastName,
            role: user.role,
            tenantId: tenant.id,
            tenantName: tenant.name,
          },
        });

        if (error) throw error;

        updatedUsers[i] = { ...user, status: "success" };
        successCount++;
      } catch (error: any) {
        updatedUsers[i] = {
          ...user,
          status: "error",
          error: error.message || "Erreur inconnue"
        };
        failedCount++;
      }

      setImportProgress(Math.round(((i + 1) / updatedUsers.length) * 100));
      setParsedUsers([...updatedUsers]);
    }

    setImportResults({ success: successCount, failed: failedCount });
    setIsImporting(false);

    toast({
      title: "Import terminé",
      description: `${successCount} comptes créés, ${failedCount} erreurs`,
    });

    if (successCount > 0) {
      onImportComplete();
    }
  };

  const downloadTemplate = () => {
    const template = "Prénom;Nom;Email;Rôle\nJean;Dupont;jean.dupont@email.com;TEACHER\nMarie;Martin;marie.martin@email.com;PARENT";
    const blob = new Blob([template], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "modele_import_utilisateurs.csv";
    link.click();
  };

  const resetImport = () => {
    setParsedUsers([]);
    setImportProgress(0);
    setImportResults({ success: 0, failed: 0 });
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
      setIsOpen(open);
      if (!open) resetImport();
    }}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Upload className="w-4 h-4" />
          Importer CSV
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5" />
            Importer des utilisateurs
          </DialogTitle>
          <DialogDescription>
            Importez plusieurs utilisateurs depuis un fichier CSV. Les identifiants seront envoyés par email.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 flex-1 overflow-hidden flex flex-col">
          {/* Upload section */}
          <div className="flex flex-wrap gap-4 items-end">
            <div className="flex-1 min-w-[200px]">
              <Label>Fichier CSV</Label>
              <Input
                ref={fileInputRef}
                type="file"
                accept=".csv,.txt"
                onChange={handleFileChange}
                disabled={isImporting}
              />
            </div>
            <div className="w-40">
              <Label>Rôle par défaut</Label>
              <Select value={defaultRole} onValueChange={(v) => setDefaultRole(v as AppRole)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {getInvitableRoles().map((role) => (
                    <SelectItem key={role} value={role}>
                      {getRoleLabel(role, StudentLabel)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" onClick={downloadTemplate}>
              <Download className="w-4 h-4 mr-2" />
              Modèle
            </Button>
          </div>

          {/* Format info */}
          <div className="bg-muted p-3 rounded-lg text-sm">
            <p className="font-medium mb-1">Format attendu :</p>
            <p className="text-muted-foreground">
              Colonnes : <code className="bg-background px-1 rounded">Prénom</code>,
              <code className="bg-background px-1 rounded ml-1">Nom</code>,
              <code className="bg-background px-1 rounded ml-1">Email</code> (requis),
              <code className="bg-background px-1 rounded ml-1">Rôle</code> (optionnel)
            </p>
          </div>

          {/* Progress */}
          {isImporting && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Import en cours...</span>
                <span>{importProgress}%</span>
              </div>
              <Progress value={importProgress} />
            </div>
          )}

          {/* Results summary */}
          {importResults.success > 0 || importResults.failed > 0 ? (
            <div className="flex gap-4">
              <Badge className="bg-green-500 text-white">
                <CheckCircle className="w-3 h-3 mr-1" />
                {importResults.success} créés
              </Badge>
              {importResults.failed > 0 && (
                <Badge variant="destructive">
                  <XCircle className="w-3 h-3 mr-1" />
                  {importResults.failed} erreurs
                </Badge>
              )}
            </div>
          ) : null}

          {/* Preview table */}
          {parsedUsers.length > 0 && (
            <div className="flex-1 overflow-hidden border rounded-lg">
              <ScrollArea className="h-[300px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Statut</TableHead>
                      <TableHead>Prénom</TableHead>
                      <TableHead>Nom</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Rôle</TableHead>
                      <TableHead>Mot de passe</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {parsedUsers.map((user, index) => (
                      <TableRow key={index}>
                        <TableCell>
                          {user.status === "pending" && (
                            <Badge variant="outline">En attente</Badge>
                          )}
                          {user.status === "success" && (
                            <Badge className="bg-green-500 text-white">
                              <CheckCircle className="w-3 h-3 mr-1" />
                              Créé
                            </Badge>
                          )}
                          {user.status === "error" && (
                            <Badge variant="destructive" title={user.error}>
                              <XCircle className="w-3 h-3 mr-1" />
                              Erreur
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>{user.firstName || "—"}</TableCell>
                        <TableCell>{user.lastName || "—"}</TableCell>
                        <TableCell>{user.email}</TableCell>
                        <TableCell>
                          <Badge variant="secondary">{getRoleLabel(user.role, StudentLabel)}</Badge>
                        </TableCell>
                        <TableCell>
                          <code className="text-xs bg-muted px-1 rounded">{user.password}</code>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setIsOpen(false)}>
              Fermer
            </Button>
            {parsedUsers.length > 0 && !isImporting && importResults.success === 0 && (
              <Button onClick={handleImport}>
                <Upload className="w-4 h-4 mr-2" />
                Créer {parsedUsers.length} comptes
              </Button>
            )}
            {isImporting && (
              <Button disabled>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Import en cours...
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
