import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { apiClient } from "@/api/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
  DialogFooter, DialogClose
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import { toast } from "sonner";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { useTenant } from "@/contexts/TenantContext";
import {
  Building2, Search, Plus, Users, GraduationCap, CheckCircle, XCircle,
  Eye, UserPlus, Shield, ExternalLink, School, Power, Trash2, AlertTriangle
} from "lucide-react";

interface TenantStat {
  id: string;
  name: string;
  slug: string;
  type: string;
  is_active: boolean;
  email: string | null;
  phone: string | null;
  address: string | null;
  website: string | null;
  created_at: string | null;
  student_count: number;
  user_count: number;
  admin_count: number;
}

const getTypeLabel = (type: string) => {
  const map: Record<string, string> = {
    primary: "École Primaire",
    middle: "Collège",
    high: "Lycée",
    university: "Université",
    school: "École",
    training: "Centre de Formation",
  };
  return map[type] || type;
};

const getTypeBadge = (type: string) => {
  const active = ["primary", "middle", "high", "university", "school", "training"].includes(type);
  return <Badge variant={active ? "default" : "outline"}>{getTypeLabel(type)}</Badge>;
};

// ─── Main Component ─────────────────────────────────────────────────────────

const SuperAdminDashboard = () => {
  const { hasRole } = useAuth();
  const navigate = useNavigate();
  const { switchTenant } = useTenant();
  const [searchTerm, setSearchTerm] = useState("");

  const { data: tenants = [], isLoading, refetch } = useQuery<TenantStat[]>({
    queryKey: ["super-admin-tenants"],
    queryFn: async () => {
      const { data } = await apiClient.get("/tenants/super-admin/stats/");
      return data;
    },
  });

  if (!hasRole("SUPER_ADMIN")) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Card className="max-w-md">
          <CardContent className="pt-6 text-center">
            <Shield className="w-12 h-12 text-destructive mx-auto mb-4" />
            <h2 className="text-xl font-bold mb-2">Accès refusé</h2>
            <p className="text-muted-foreground">Cette page est réservée au Super Administrateur.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const filteredTenants = tenants.filter((t) =>
    t.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    t.slug.toLowerCase().includes(searchTerm.toLowerCase()) ||
    t.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalStudents = tenants.reduce((a, t) => a + t.student_count, 0);
  const totalUsers = tenants.reduce((a, t) => a + t.user_count, 0);
  const activeCount = tenants.filter((t) => t.is_active).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="w-6 h-6 text-primary" />
            Super Admin
          </h1>
          <p className="text-muted-foreground">
            Gestion de tous les établissements de la plateforme
          </p>
        </div>
        <Button onClick={() => navigate("/super-admin/create-tenant")}>
          <Plus className="w-4 h-4 mr-2" />
          Nouvel établissement
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Building2 className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{tenants.length}</p>
                <p className="text-xs text-muted-foreground">Établissements</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <CheckCircle className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{activeCount}</p>
                <p className="text-xs text-muted-foreground">Actifs</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                <Users className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{totalUsers}</p>
                <p className="text-xs text-muted-foreground">Utilisateurs</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                <GraduationCap className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{totalStudents}</p>
                <p className="text-xs text-muted-foreground">{totalStudents > 1 ? "Élèves" : "Élève"}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Empty state */}
      {!isLoading && tenants.length === 0 && (
        <Card className="text-center py-16">
          <CardContent>
            <School className="w-16 h-16 text-muted-foreground/30 mx-auto mb-4" />
            <h2 className="text-xl font-bold mb-2">Aucun établissement</h2>
            <p className="text-muted-foreground mb-6">
              Commencez par créer votre premier établissement. Vous pourrez ensuite créer les utilisateurs admin pour chaque établissement.
            </p>
            <Button onClick={() => navigate("/super-admin/create-tenant")}>
              <Plus className="w-4 h-4 mr-2" />
              Créer un établissement
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Search + Table */}
      {tenants.length > 0 && (
        <>
          <Card>
            <CardContent className="p-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Rechercher par nom, slug ou email..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </CardContent>
          </Card>

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
                <div className="text-center py-8 text-muted-foreground">Aucun résultat</div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nom</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Slug</TableHead>
                        <TableHead>Admins</TableHead>
                        <TableHead>Utilisateurs</TableHead>
                        <TableHead>Élèves</TableHead>
                        <TableHead>Statut</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredTenants.map((tenant) => (
                        <TableRow key={tenant.id}>
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded bg-primary/10 flex items-center justify-center">
                                <Building2 className="w-4 h-4 text-primary" />
                              </div>
                              <div>
                                <p className="font-medium">{tenant.name}</p>
                                {tenant.email && (
                                  <p className="text-xs text-muted-foreground">{tenant.email}</p>
                                )}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>{getTypeBadge(tenant.type)}</TableCell>
                          <TableCell>
                            <code className="text-xs bg-muted px-2 py-1 rounded">{tenant.slug}</code>
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary">{tenant.admin_count}</Badge>
                          </TableCell>
                          <TableCell>{tenant.user_count}</TableCell>
                          <TableCell>{tenant.student_count}</TableCell>
                          <TableCell>
                            <Badge variant={tenant.is_active ? "default" : "secondary"}>
                              {tenant.is_active ? "Actif" : "Inactif"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <TenantDetailDialog tenant={tenant} />
                              <AddAdminDialog tenant={tenant} onSuccess={() => refetch()} />
                              <TenantToggleDialog tenant={tenant} onSuccess={() => refetch()} />
                              <TenantDeleteDialog tenant={tenant} onSuccess={() => refetch()} />
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={async () => {
                                  await switchTenant(tenant.id);
                                  window.open(
                                    window.location.origin + `/${tenant.slug}/admin`,
                                    "_blank",
                                    "noopener"
                                  );
                                }}
                                title="Ouvrir l'établissement dans un nouvel onglet"
                              >
                                <ExternalLink className="w-4 h-4" />
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
        </>
      )}
    </div>
  );
};

// ─── Tenant Detail Dialog ────────────────────────────────────────────────────

function TenantDetailDialog({ tenant }: { tenant: TenantStat }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost">
          <Eye className="w-4 h-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="w-5 h-5" />
            {tenant.name}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <Card>
              <CardContent className="p-4 text-center">
                <Users className="w-6 h-6 mx-auto mb-2 text-primary" />
                <p className="text-2xl font-bold">{tenant.user_count}</p>
                <p className="text-xs text-muted-foreground">Utilisateurs</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <GraduationCap className="w-6 h-6 mx-auto mb-2 text-primary" />
                <p className="text-2xl font-bold">{tenant.student_count}</p>
                <p className="text-xs text-muted-foreground">Élèves</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <Shield className="w-6 h-6 mx-auto mb-2 text-primary" />
                <p className="text-2xl font-bold">{tenant.admin_count}</p>
                <p className="text-xs text-muted-foreground">Admins</p>
              </CardContent>
            </Card>
          </div>
          <div className="space-y-2 text-sm">
            <p><strong>Type:</strong> {getTypeLabel(tenant.type)}</p>
            <p><strong>Slug:</strong> <code className="bg-muted px-2 py-0.5 rounded">{tenant.slug}</code></p>
            <p><strong>Email:</strong> {tenant.email || "-"}</p>
            <p><strong>Téléphone:</strong> {tenant.phone || "-"}</p>
            <p><strong>Adresse:</strong> {tenant.address || "-"}</p>
            <p><strong>Site web:</strong> {tenant.website || "-"}</p>
            <p><strong>Statut:</strong> {tenant.is_active ? "Actif" : "Inactif"}</p>
            {tenant.created_at && (
              <p><strong>Créé le:</strong> {format(new Date(tenant.created_at), "dd MMM yyyy à HH:mm", { locale: fr })}</p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Add Admin Dialog ────────────────────────────────────────────────────────

function AddAdminDialog({ tenant, onSuccess }: { tenant: TenantStat; onSuccess: () => void }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("TENANT_ADMIN");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !firstName || !lastName || !password) {
      toast.error("Veuillez remplir tous les champs");
      return;
    }
    setLoading(true);
    try {
      await apiClient.post(`/tenants/${tenant.id}/create-admin/`, {
        email,
        first_name: firstName,
        last_name: lastName,
        password,
        role,
      });
      toast.success(`Utilisateur ${email} créé avec succès pour ${tenant.name}`);
      setOpen(false);
      setEmail("");
      setFirstName("");
      setLastName("");
      setPassword("");
      onSuccess();
    } catch (err: any) {
      const detail = err?.response?.data?.detail || "Erreur lors de la création";
      toast.error(detail);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost" title="Ajouter un utilisateur">
          <UserPlus className="w-4 h-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="w-5 h-5" />
            Ajouter un utilisateur — {tenant.name}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Prénom *</Label>
              <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label>Nom *</Label>
              <Input value={lastName} onChange={(e) => setLastName(e.target.value)} required />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Email *</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label>Mot de passe *</Label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required placeholder="Minimum 8 caractères" />
          </div>
          <div className="space-y-1.5">
            <Label>Rôle</Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="TENANT_ADMIN">Administrateur de l'établissement</SelectItem>
                <SelectItem value="DIRECTOR">Directeur</SelectItem>
                <SelectItem value="TEACHER">Enseignant</SelectItem>
                <SelectItem value="STAFF">Personnel</SelectItem>
                <SelectItem value="ACCOUNTANT">Comptable</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">Annuler</Button>
            </DialogClose>
            <Button type="submit" disabled={loading}>
              {loading ? "Création..." : "Créer l'utilisateur"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Tenant Toggle Status Dialog ────────────────────────────────────────────

function TenantToggleDialog({ tenant, onSuccess }: { tenant: TenantStat; onSuccess: () => void }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleToggle = async () => {
    setLoading(true);
    try {
      await apiClient.patch(`/tenants/${tenant.id}/toggle-status/`);
      toast.success(
        tenant.is_active
          ? `Établissement ${tenant.name} désactivé. Toutes les sessions ont été révoquées.`
          : `Établissement ${tenant.name} réactivé.`
      );
      setOpen(false);
      onSuccess();
    } catch (err: any) {
      const detail = err?.response?.data?.detail || "Erreur lors du changement de statut";
      toast.error(detail);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          size="sm"
          variant="ghost"
          title={tenant.is_active ? "Désactiver l'établissement" : "Réactiver l'établissement"}
        >
          <Power className={`w-4 h-4 ${tenant.is_active ? "text-orange-500" : "text-green-500"}`} />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Power className={`w-5 h-5 ${tenant.is_active ? "text-orange-500" : "text-green-500"}`} />
            {tenant.is_active ? "Désactiver" : "Réactiver"} l'établissement
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {tenant.is_active ? (
            <>
              <div className="flex items-start gap-3 p-4 bg-orange-50 dark:bg-orange-950/30 rounded-lg border border-orange-200 dark:border-orange-800">
                <AlertTriangle className="w-5 h-5 text-orange-500 mt-0.5 shrink-0" />
                <div className="text-sm">
                  <p className="font-medium text-orange-800 dark:text-orange-200">Attention</p>
                  <p className="text-orange-700 dark:text-orange-300 mt-1">
                    Tous les utilisateurs de l'établissement <strong>{tenant.name}</strong> seront
                    immédiatement déconnectés et ne pourront plus se reconnecter tant que l'établissement
                    est désactivé.
                  </p>
                </div>
              </div>
              <div className="text-sm text-muted-foreground">
                <p><strong>Établissement :</strong> {tenant.name}</p>
                <p><strong>Utilisateurs concernés :</strong> {tenant.user_count}</p>
                <p><strong>Élèves concernés :</strong> {tenant.student_count}</p>
              </div>
              <p className="text-sm text-muted-foreground">
                Vous pourrez réactiver cet établissement à tout moment depuis ce tableau de bord.
              </p>
            </>
          ) : (
            <div className="text-sm text-muted-foreground">
              <p>
                Voulez-vous réactiver l'établissement <strong>{tenant.name}</strong> ?
                Les utilisateurs pourront à nouveau se connecter.
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Annuler</Button>
            <Button
              variant={tenant.is_active ? "destructive" : "default"}
              disabled={loading}
              onClick={handleToggle}
            >
              {loading
                ? "Chargement..."
                : tenant.is_active
                  ? "Désactiver"
                  : "Réactiver"}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Tenant Delete Dialog ────────────────────────────────────────────────────

function TenantDeleteDialog({ tenant, onSuccess }: { tenant: TenantStat; onSuccess: () => void }) {
  const [open, setOpen] = useState(false);
  const [confirmStep, setConfirmStep] = useState(0); // 0 = not confirmed, 1 = first confirm, 2 = second confirm
  const [loading, setLoading] = useState(false);

  const handleDelete = async () => {
    setLoading(true);
    try {
      await apiClient.delete(`/tenants/${tenant.id}/`);
      toast.success(`Établissement ${tenant.name} supprimé définitivement.`);
      setOpen(false);
      setConfirmStep(0);
      onSuccess();
    } catch (err: any) {
      const detail = err?.response?.data?.detail || "Erreur lors de la suppression";
      toast.error(detail);
    } finally {
      setLoading(false);
    }
  };

  const resetAndClose = () => {
    setOpen(false);
    setConfirmStep(0);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) resetAndClose(); else setOpen(true); }}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost" title="Supprimer l'établissement">
          <Trash2 className="w-4 h-4 text-red-500" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trash2 className="w-5 h-5 text-red-500" />
            Supprimer l'établissement
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {confirmStep === 0 && (
            <>
              <div className="flex items-start gap-3 p-4 bg-red-50 dark:bg-red-950/30 rounded-lg border border-red-200 dark:border-red-800">
                <AlertTriangle className="w-5 h-5 text-red-500 mt-0.5 shrink-0" />
                <div className="text-sm">
                  <p className="font-medium text-red-800 dark:text-red-200">Action irréversible</p>
                  <p className="text-red-700 dark:text-red-300 mt-1">
                    La suppression de l'établissement <strong>{tenant.name}</strong> entraînera
                    la suppression définitive de toutes les données associées.
                  </p>
                </div>
              </div>
              <div className="text-sm text-muted-foreground space-y-1">
                <p><strong>Établissement :</strong> {tenant.name}</p>
                <p><strong>Utilisateurs :</strong> {tenant.user_count}</p>
                <p><strong>Élèves :</strong> {tenant.student_count}</p>
              </div>
              <ul className="text-sm text-red-600 dark:text-red-400 list-disc list-inside space-y-1">
                <li>Tous les utilisateurs et leurs comptes</li>
                <li>Toutes les notes et évaluations</li>
                <li>Tous les paiements et factures</li>
                <li>Toutes les données de présence</li>
                <li>Tous les messages et annonces</li>
              </ul>
              <Button
                variant="destructive"
                className="w-full"
                onClick={() => setConfirmStep(1)}
              >
                Je comprends les risques — Continuer
              </Button>
            </>
          )}
          {confirmStep === 1 && (
            <>
              <div className="flex items-start gap-3 p-4 bg-red-50 dark:bg-red-950/30 rounded-lg border border-red-200 dark:border-red-800">
                <AlertTriangle className="w-5 h-5 text-red-500 mt-0.5 shrink-0" />
                <p className="text-sm text-red-700 dark:text-red-300">
                  Veuillez taper le nom de l'établissement pour confirmer.
                </p>
              </div>
              <div className="space-y-2">
                <Label>Tapez <strong>{tenant.name}</strong> pour confirmer :</Label>
                <Input
                  placeholder={tenant.name}
                  onChange={(e) => {
                    if (e.target.value === tenant.name) setConfirmStep(2);
                    else setConfirmStep(1);
                  }}
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={resetAndClose}>Annuler</Button>
              </DialogFooter>
            </>
          )}
          {confirmStep === 2 && (
            <>
              <div className="flex items-start gap-3 p-4 bg-red-50 dark:bg-red-950/30 rounded-lg border border-red-200 dark:border-red-800">
                <AlertTriangle className="w-5 h-5 text-red-500 mt-0.5 shrink-0" />
                <p className="text-sm font-medium text-red-700 dark:text-red-300">
                  Dernière chance — Cette action est irréversible.
                </p>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={resetAndClose}>Annuler</Button>
                <Button
                  variant="destructive"
                  disabled={loading}
                  onClick={handleDelete}
                >
                  {loading ? "Suppression en cours..." : "Supprimer définitivement"}
                </Button>
              </DialogFooter>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default SuperAdminDashboard;
