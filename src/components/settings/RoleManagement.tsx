import { useState, useEffect } from "react";
import { useTenant } from "@/contexts/TenantContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Shield, Plus, Trash2, Search } from "lucide-react";
import { AppRole } from "@/lib/types";
import { useStudentLabel } from "@/hooks/useStudentLabel";
import { getRoleLabel as getRoleLabelBase, getRoleDescription } from "@/lib/permissions";

interface Profile {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
}

interface UserRole {
  id: string;
  user_id: string;
  role: AppRole;
  profile?: Profile;
}

const RoleManagement = () => {
  const { tenant } = useTenant();
  const { hasRole } = useAuth();
  const { StudentLabel, studentLabel, studentsLabel } = useStudentLabel();

  const ROLES: { value: AppRole; label: string; description: string }[] = [
    { value: "SUPER_ADMIN", label: "Super Admin", description: getRoleDescription("SUPER_ADMIN") },
    { value: "TENANT_ADMIN", label: "Admin Établissement", description: getRoleDescription("TENANT_ADMIN") },
    { value: "DIRECTOR", label: "Directeur", description: getRoleDescription("DIRECTOR") },
    { value: "TEACHER", label: "Professeur", description: getRoleDescription("TEACHER", studentLabel, studentsLabel) },
    { value: "PARENT", label: "Parent", description: getRoleDescription("PARENT") },
    { value: "STUDENT", label: StudentLabel, description: getRoleDescription("STUDENT") },
    { value: "ACCOUNTANT", label: "Comptable", description: getRoleDescription("ACCOUNTANT") },
    { value: "STAFF", label: "Personnel", description: getRoleDescription("STAFF", studentLabel, studentsLabel) },
  ];
  const isSuperAdmin = hasRole("SUPER_ADMIN");
  const { toast } = useToast();
  const [userRoles, setUserRoles] = useState<UserRole[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState("");
  const [selectedRole, setSelectedRole] = useState<AppRole | "">("");
  const [searchEmail, setSearchEmail] = useState("");
  const [filterRole, setFilterRole] = useState<string>("");

  const fetchUserRoles = async () => {
    if (!tenant) return;
    setLoading(true);

    try {
      const { data: rolesData, error } = await supabase
        .from("user_roles")
        .select(`
          id,
          user_id,
          role,
          profiles!user_roles_user_id_fkey (
            id,
            email,
            first_name,
            last_name
          )
        `)
        .eq("tenant_id", tenant.id);

      if (error) throw error;

      const formattedRoles = (rolesData || []).map((r: any) => ({
        id: r.id,
        user_id: r.user_id,
        role: r.role,
        profile: r.profiles,
      }));

      setUserRoles(formattedRoles);
    } catch (error) {
      console.error("Erreur:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchProfiles = async () => {
    if (!tenant) return;

    const { data } = await supabase
      .from("profiles")
      .select("id, email, first_name, last_name")
      .eq("tenant_id", tenant.id);

    setProfiles(data || []);
  };

  useEffect(() => {
    fetchUserRoles();
    fetchProfiles();
  }, [tenant]);

  const searchUserByEmail = async () => {
    if (!searchEmail.trim()) return;

    const { data } = await supabase
      .from("profiles")
      .select("id, email, first_name, last_name")
      .ilike("email", `%${searchEmail}%`)
      .limit(10);

    if (data && data.length > 0) {
      setProfiles(data);
    }
  };

  const assignRole = async () => {
    if (!selectedUser || !selectedRole || !tenant) return;

    try {
      const { data: existingRole } = await supabase
        .from("user_roles")
        .select("id")
        .eq("user_id", selectedUser)
        .eq("role", selectedRole)
        .eq("tenant_id", tenant.id)
        .maybeSingle();

      if (existingRole) {
        toast({
          title: "Rôle existant",
          description: "Cet utilisateur possède déjà ce rôle.",
          variant: "destructive",
        });
        return;
      }

      const { error } = await supabase.from("user_roles").insert({
        user_id: selectedUser,
        role: selectedRole,
        tenant_id: tenant.id,
      });

      if (error) throw error;

      toast({
        title: "Rôle assigné",
        description: "Le rôle a été assigné avec succès.",
      });

      setDialogOpen(false);
      setSelectedUser("");
      setSelectedRole("");
      fetchUserRoles();
    } catch (error: any) {
      toast({
        title: "Erreur",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const removeRole = async (roleId: string) => {
    try {
      const { error } = await supabase
        .from("user_roles")
        .delete()
        .eq("id", roleId);

      if (error) throw error;

      toast({
        title: "Rôle supprimé",
        description: "Le rôle a été retiré avec succès.",
      });

      fetchUserRoles();
    } catch (error: any) {
      toast({
        title: "Erreur",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const getRoleLabel = (role: AppRole) => {
    return getRoleLabelBase(role, StudentLabel);
  };

  const filteredRoles = filterRole
    ? userRoles.filter((ur) => ur.role === filterRole)
    : userRoles;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Shield className="w-5 h-5 text-primary" />
            </div>
            <div>
              <CardTitle>Gestion des Rôles</CardTitle>
              <CardDescription>Assignez des rôles et permissions aux utilisateurs</CardDescription>
            </div>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                Assigner un rôle
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Assigner un rôle</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Rechercher un utilisateur</Label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Email de l'utilisateur"
                      value={searchEmail}
                      onChange={(e) => setSearchEmail(e.target.value)}
                    />
                    <Button variant="outline" onClick={searchUserByEmail}>
                      <Search className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Utilisateur</Label>
                  <Select value={selectedUser} onValueChange={setSelectedUser}>
                    <SelectTrigger>
                      <SelectValue placeholder="Sélectionner un utilisateur" />
                    </SelectTrigger>
                    <SelectContent>
                      {profiles.map((profile) => (
                        <SelectItem key={profile.id} value={profile.id}>
                          {profile.first_name} {profile.last_name} ({profile.email})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Rôle</Label>
                  <Select value={selectedRole} onValueChange={(v) => setSelectedRole(v as AppRole)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Sélectionner un rôle" />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLES.filter(r => isSuperAdmin || r.value !== "SUPER_ADMIN").map((role) => (
                        <SelectItem key={role.value} value={role.value}>
                          <div>
                            <div className="font-medium">{role.label}</div>
                            <div className="text-xs text-muted-foreground">{role.description}</div>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <Button className="w-full" onClick={assignRole} disabled={!selectedUser || !selectedRole}>
                  Assigner le rôle
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {/* Filter */}
        <div className="flex items-center gap-4 mb-4">
          <div className="flex-1">
            <Select value={filterRole || "all"} onValueChange={(v) => setFilterRole(v === "all" ? "" : v)}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Filtrer par rôle" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les rôles</SelectItem>
                {ROLES.filter(r => isSuperAdmin || r.value !== "SUPER_ADMIN").map((role) => (
                  <SelectItem key={role.value} value={role.value}>
                    {role.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <span className="text-sm text-muted-foreground">
            {filteredRoles.length} rôle(s) assigné(s)
          </span>
        </div>

        {loading ? (
          <div className="text-center py-8 text-muted-foreground">Chargement...</div>
        ) : filteredRoles.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            Aucun rôle assigné pour le moment
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Utilisateur</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Rôle</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRoles.map((ur) => (
                <TableRow key={ur.id}>
                  <TableCell className="font-medium">
                    {ur.profile?.first_name} {ur.profile?.last_name}
                  </TableCell>
                  <TableCell>{ur.profile?.email}</TableCell>
                  <TableCell>
                    <span className="px-2 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary">
                      {getRoleLabel(ur.role)}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeRole(ur.id)}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
};

export default RoleManagement;
