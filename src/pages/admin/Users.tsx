import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTenant } from "@/contexts/TenantContext";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Settings2 } from "lucide-react";

import { AdminMessageComposer } from "@/components/messages/AdminMessageComposer";
import { UserImport } from "@/components/users/UserImport";
import { PendingUsersList } from "@/components/users/PendingUsersList";
import { useStudentLabel } from "@/hooks/useStudentLabel";
import {
  userQueries,
  useUpdateUserStatus,
  useDeleteUserAccount,
  AppRole,
  UserWithRoles
} from "@/queries/users";

// Modular Components
import { UserStats } from "@/components/admin/users/UserStats";
import { UserFilters } from "@/components/admin/users/UserFilters";
import { UserTable } from "@/components/admin/users/UserTable";
import { UserSecuritySettings } from "@/components/admin/users/UserSecuritySettings";
import { UserRoles } from "@/components/admin/users/UserRoles";
import { UserCreateDialog } from "@/components/admin/users/UserCreateDialog";
import { UserManagementDialogs } from "@/components/admin/users/UserManagementDialogs";
import { AppRole as AppRoleType } from "@/lib/types";
import { hasPermission } from "@/lib/permissions";
import { supabase } from "@/integrations/supabase/client";
import { useTenantUrl } from "@/hooks/useTenantUrl";
import { toast } from "sonner";

const UsersPage = () => {
  const { tenant } = useTenant();
  const { hasRole, user: currentUser, roles } = useAuth(); // Destructure roles
  const { studentLabel, studentsLabel } = useStudentLabel();
  const navigate = useNavigate();
  const { getTenantUrl } = useTenantUrl();

  // State
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, roleFilter]);

  // Dialog Control States (passed to UserManagementDialogs)
  const [selectedUser, setSelectedUser] = useState<UserWithRoles | null>(null);
  const [isAddRoleOpen, setIsAddRoleOpen] = useState(false);
  const [isEditUserOpen, setIsEditUserOpen] = useState(false);
  const [isResetPasswordOpen, setIsResetPasswordOpen] = useState(false);
  const [resetPasswordUser, setResetPasswordUser] = useState<UserWithRoles | null>(null);

  // Queries & Mutations
  const { data, isLoading } = useQuery(userQueries.all(tenant?.id || "", {
    page: currentPage,
    pageSize,
    role: roleFilter,
    search: searchQuery
  }));

  const users = data?.users || [];
  const totalCount = data?.totalCount || 0;

  const updateStatusMutation = useUpdateUserStatus(tenant?.id || "");
  const deleteAccountMutation = useDeleteUserAccount(tenant?.id || "");

  // Computed & Filtered Data - Still used for SuperAdmin filtering which is complex for server
  const finalUsers = useMemo(() => {
    return users.filter((user) => {
      // Hide SUPER_ADMIN users if current user is not SUPER_ADMIN
      const isSuperAdmin = hasRole("SUPER_ADMIN");
      if (!isSuperAdmin && user.roles.includes("SUPER_ADMIN")) return false;

      return true;
    });
  }, [users, hasRole]);

  const isAdmin = hasRole("TENANT_ADMIN") || hasRole("SUPER_ADMIN");

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground">
            Gestion des Utilisateurs
          </h1>
          <p className="text-muted-foreground">
            Gérez les enseignants, les {studentsLabel} et le personnel de votre établissement
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <AdminMessageComposer />
          <UserImport onImportComplete={() => { }} />
          <UserCreateDialog />
          {isAdmin && (
            <Button
              variant="outline"
              onClick={() => {
                const tabsTrigger = document.querySelector('[value="security"]') as HTMLElement;
                tabsTrigger?.click();
              }}
              className="gap-2"
            >
              <Settings2 className="w-4 h-4" />
              Configuration
            </Button>
          )}
        </div>
      </div>

      <UserStats
        users={users}
        roleFilter={roleFilter}
        setRoleFilter={setRoleFilter}
      />

      <Tabs defaultValue="users" className="w-full">
        <TabsList className="bg-muted/50 p-1 mb-8">
          <TabsTrigger value="users">Utilisateurs actifs</TabsTrigger>
          <TabsTrigger value="pending" className="relative">
            Comptes en attente
            <Badge className="ml-2 bg-primary text-[10px] h-4 px-1">Nouveau</Badge>
          </TabsTrigger>
          <TabsTrigger value="roles">Rôles & Permissions</TabsTrigger>
          {hasPermission(roles, "users:assign_roles") && <TabsTrigger value="security">Sécurité & Privilèges</TabsTrigger>}
        </TabsList>

        <TabsContent value="users" className="space-y-4">
          <UserFilters
            userCount={totalCount}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            roleFilter={roleFilter}
            setRoleFilter={setRoleFilter}
          />

          <UserTable
            users={finalUsers}
            isLoading={isLoading}
            totalCount={totalCount}
            currentPage={currentPage}
            pageSize={pageSize}
            onPageChange={setCurrentPage}
            onPageSizeChange={setPageSize}
            onEdit={async (user) => {
              if (user.roles.includes("STUDENT")) {
                const { data } = await supabase
                  .from("students")
                  .select("id")
                  .eq("user_id", user.id)
                  .single();

                if (data) {
                  navigate(getTenantUrl(`/admin/students/${data.id}`));
                  return;
                }
              }

              if (user.roles.includes("TEACHER")) {
                // Teachers are in the profiles table, and the Teachers page shows all users with TEACHER role.
                navigate(getTenantUrl(`/admin/teachers`));
                toast.info("Veuillez utiliser l'action modifier sur la ligne de l'enseignant.");
                return;
              }

              setSelectedUser(user);
              setIsEditUserOpen(true);
            }}
            onDelete={(user) => {
              if (confirm("Confirmer la suppression définitive ?")) {
                deleteAccountMutation.mutate(user.id);
              }
            }}
            onToggleStatus={(user) => {
              updateStatusMutation.mutate({ userId: user.id, isActive: !user.is_active });
            }}
            onManageRoles={(user) => {
              setSelectedUser(user);
              setIsAddRoleOpen(true);
            }}
            onResetPassword={(user) => {
              setResetPasswordUser(user);
              setIsResetPasswordOpen(true);
            }}
            currentUserId={currentUser?.id}
            isSuperAdmin={hasRole("SUPER_ADMIN")}
          />
        </TabsContent>

        <TabsContent value="pending">
          <PendingUsersList />
        </TabsContent>

        <TabsContent value="roles">
          <UserRoles />
        </TabsContent>

        {isAdmin && (
          <TabsContent value="security">
            <UserSecuritySettings tenantId={tenant?.id} />
          </TabsContent>
        )}
      </Tabs>

      {/* Extracted Dialogs */}
      <UserManagementDialogs
        selectedUser={selectedUser}
        isAddRoleOpen={isAddRoleOpen}
        setIsAddRoleOpen={setIsAddRoleOpen}
        isResetPasswordOpen={isResetPasswordOpen}
        setIsResetPasswordOpen={setIsResetPasswordOpen}
        resetPasswordUser={resetPasswordUser}
        setResetPasswordUser={setResetPasswordUser}
        isEditUserOpen={isEditUserOpen}
        setIsEditUserOpen={setIsEditUserOpen}
      />
    </div>
  );
};

export default UsersPage;
