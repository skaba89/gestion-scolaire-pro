import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { Building2, Search, Plus, Users, Eye, Settings, CheckCircle, XCircle } from "lucide-react";
import { useTenantUrl } from "@/hooks/useTenantUrl";

const SuperAdminTenants = () => {
  const { hasRole } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { getTenantUrl } = useTenantUrl();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedTenant, setSelectedTenant] = useState<any>(null);

  // Tous les hooks doivent être appelés avant tout return conditionnel
  const { data: tenants = [], isLoading } = useQuery({
    queryKey: ["all-tenants"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenants")
        .select("*")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: tenantStats } = useQuery({
    queryKey: ["tenant-stats", selectedTenant?.id],
    queryFn: async () => {
      if (!selectedTenant?.id) return null;

      const [studentsResult, usersResult, classroomsResult] = await Promise.all([
        supabase.from("students").select("id", { count: "exact" }).eq("tenant_id", selectedTenant.id),
        supabase.from("profiles").select("id", { count: "exact" }).eq("tenant_id", selectedTenant.id),
        supabase.from("classrooms").select("id", { count: "exact" }).eq("tenant_id", selectedTenant.id),
      ]);

      return {
        students: studentsResult.count || 0,
        users: usersResult.count || 0,
        classrooms: classroomsResult.count || 0,
      };
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const { error } = await supabase
        .from("tenants")
        .update({ is_active: isActive })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["all-tenants"] });
      toast.success("Statut mis à jour");
    },
    onError: () => {
      toast.error("Erreur lors de la mise à jour");
    },
  });

  const updateTypeMutation = useMutation({
    mutationFn: async ({ id, type }: { id: string; type: string }) => {
      const { error } = await supabase
        .from("tenants")
        .update({ type })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["all-tenants"] });
      toast.success("Type d'établissement mis à jour");
    },
    onError: () => {
      toast.error("Erreur lors de la mise à jour du type");
    },
  });

  // Garde d'accès — après les hooks
  if (!hasRole("SUPER_ADMIN")) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Card className="max-w-md">
          <CardContent className="pt-6 text-center">
            <XCircle className="w-12 h-12 text-destructive mx-auto mb-4" />
            <h2 className="text-xl font-bold mb-2">Accès refusé</h2>
            <p className="text-muted-foreground">
              Vous n'avez pas les droits pour accéder à cette page.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isUniversity = selectedTenant?.type === "university";
  const selectedStudentLabel = isUniversity ? "Étudiants" : "Élèves";

  const filteredTenants = tenants.filter((tenant) =>
    tenant.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    tenant.slug?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getTenantTypeBadge = (type: string) => {
    const types: Record<string, { label: string; variant: "default" | "secondary" | "outline" }> = {
      primary: { label: "Primaire", variant: "default" },
      middle: { label: "Collège", variant: "secondary" },
      high: { label: "Lycée", variant: "outline" },
      university: { label: "Université", variant: "default" },
      training: { label: "Formation", variant: "secondary" },
    };
    const config = types[type] || { label: type, variant: "outline" as const };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground">
            Gestion des Établissements
          </h1>
          <p className="text-muted-foreground">
            Vue d'ensemble de tous les établissements de la plateforme
          </p>
        </div>
        <Button onClick={() => navigate(getTenantUrl("/admin/create-tenant"))}>
          <Plus className="w-4 h-4 mr-2" />
          Nouvel établissement
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Building2 className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{tenants.length}</p>
                <p className="text-xs text-muted-foreground">Total établissements</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
                <CheckCircle className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{tenants.filter(t => t.is_active).length}</p>
                <p className="text-xs text-muted-foreground">Actifs</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-red-100 flex items-center justify-center">
                <XCircle className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{tenants.filter(t => !t.is_active).length}</p>
                <p className="text-xs text-muted-foreground">Inactifs</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <Card>
        <CardContent className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Rechercher par nom ou slug..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardContent>
      </Card>

      {/* Tenants Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="w-5 h-5" />
            Établissements ({filteredTenants.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Chargement...</div>
          ) : filteredTenants.length === 0 ? (
            <div className="text-center py-12">
              <Building2 className="w-12 h-12 text-muted-foreground/50 mx-auto mb-4" />
              <p className="text-muted-foreground">Aucun établissement trouvé</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nom</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Slug</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead>Créé le</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTenants.map((tenant) => (
                    <TableRow key={tenant.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          {tenant.logo_url ? (
                            <img
                              src={tenant.logo_url}
                              alt={tenant.name}
                              className="w-8 h-8 rounded object-cover"
                            />
                          ) : (
                            <div className="w-8 h-8 rounded bg-primary/10 flex items-center justify-center">
                              <Building2 className="w-4 h-4 text-primary" />
                            </div>
                          )}
                          <div>
                            <p className="font-medium">{tenant.name}</p>
                            {tenant.email && (
                              <p className="text-xs text-muted-foreground">{tenant.email}</p>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>{getTenantTypeBadge(tenant.type || "training")}</TableCell>
                      <TableCell>
                        <code className="text-xs bg-muted px-2 py-1 rounded">{tenant.slug}</code>
                      </TableCell>
                      <TableCell>
                        <Badge variant={tenant.is_active ? "default" : "secondary"}>
                          {tenant.is_active ? "Actif" : "Inactif"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {tenant.created_at
                          ? format(new Date(tenant.created_at), "dd MMM yyyy", { locale: fr })
                          : "-"
                        }
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Dialog>
                            <DialogTrigger asChild>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setSelectedTenant(tenant)}
                              >
                                <Eye className="w-4 h-4" />
                              </Button>
                            </DialogTrigger>
                            <DialogContent className="max-w-lg">
                              <DialogHeader>
                                <DialogTitle className="flex items-center gap-2">
                                  <Building2 className="w-5 h-5" />
                                  {selectedTenant?.name}
                                </DialogTitle>
                              </DialogHeader>
                              <div className="space-y-4">
                                <div className="grid grid-cols-3 gap-4">
                                  <Card>
                                    <CardContent className="p-4 text-center">
                                      <Users className="w-6 h-6 mx-auto mb-2 text-primary" />
                                      <p className="text-2xl font-bold">{tenantStats?.users || 0}</p>
                                      <p className="text-xs text-muted-foreground">Utilisateurs</p>
                                    </CardContent>
                                  </Card>
                                  <Card>
                                    <CardContent className="p-4 text-center">
                                      <Users className="w-6 h-6 mx-auto mb-2 text-primary" />
                                      <p className="text-2xl font-bold">{tenantStats?.students || 0}</p>
                                      <p className="text-xs text-muted-foreground">{selectedStudentLabel}</p>
                                    </CardContent>
                                  </Card>
                                  <Card>
                                    <CardContent className="p-4 text-center">
                                      <Building2 className="w-6 h-6 mx-auto mb-2 text-primary" />
                                      <p className="text-2xl font-bold">{tenantStats?.classrooms || 0}</p>
                                      <p className="text-xs text-muted-foreground">Classes</p>
                                    </CardContent>
                                  </Card>
                                </div>
                                <div className="space-y-2 text-sm">
                                  <p><strong>Email:</strong> {selectedTenant?.email || "-"}</p>
                                  <p><strong>Téléphone:</strong> {selectedTenant?.phone || "-"}</p>
                                  <p><strong>Adresse:</strong> {selectedTenant?.address || "-"}</p>
                                  <p><strong>Site web:</strong> {selectedTenant?.website || "-"}</p>
                                  <div className="pt-4 border-t space-y-2">
                                    <Label>Type d'établissement</Label>
                                    <Select
                                      defaultValue={selectedTenant?.type || "training"}
                                      onValueChange={(value) => updateTypeMutation.mutate({
                                        id: selectedTenant.id,
                                        type: value
                                      })}
                                    >
                                      <SelectTrigger>
                                        <SelectValue placeholder="Sélectionner le type" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="primary">École Primaire</SelectItem>
                                        <SelectItem value="middle">Collège</SelectItem>
                                        <SelectItem value="high">Lycée</SelectItem>
                                        <SelectItem value="university">Université</SelectItem>
                                        <SelectItem value="training">Centre de Formation</SelectItem>
                                      </SelectContent>
                                    </Select>
                                    <p className="text-[10px] text-muted-foreground italic">
                                      Le changement de type impacte la terminologie utilisée (ex: Étudiant vs Élève).
                                    </p>
                                  </div>
                                </div>
                              </div>
                            </DialogContent>
                          </Dialog>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => toggleActiveMutation.mutate({
                              id: tenant.id,
                              isActive: !tenant.is_active,
                            })}
                          >
                            {tenant.is_active ? (
                              <XCircle className="w-4 h-4 text-destructive" />
                            ) : (
                              <CheckCircle className="w-4 h-4 text-green-600" />
                            )}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default SuperAdminTenants;
