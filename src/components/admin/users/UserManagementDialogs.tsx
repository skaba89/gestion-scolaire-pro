import { useState, useEffect } from "react";
import { useTenant } from "@/contexts/TenantContext";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2 } from "lucide-react";
import { useAddRole, useUpdateUser, UserWithRoles, AppRole } from "@/queries/users";
import { getRoleLabel as getRoleLabelBase, getInvitableRoles } from "@/lib/permissions";
import { useStudentLabel } from "@/hooks/useStudentLabel";
import { apiClient } from "@/api/client";
import { toast } from "sonner";

interface UserManagementDialogsProps {
    selectedUser: UserWithRoles | null;
    isAddRoleOpen: boolean;
    setIsAddRoleOpen: (open: boolean) => void;
    isResetPasswordOpen: boolean;
    setIsResetPasswordOpen: (open: boolean) => void;
    resetPasswordUser: UserWithRoles | null;
    setResetPasswordUser: (user: UserWithRoles | null) => void;
    isEditUserOpen: boolean;
    setIsEditUserOpen: (open: boolean) => void;
    onEditSuccess?: () => void;
}

export function UserManagementDialogs({
    selectedUser,
    isAddRoleOpen,
    setIsAddRoleOpen,
    isResetPasswordOpen,
    setIsResetPasswordOpen,
    resetPasswordUser,
    setResetPasswordUser,
    isEditUserOpen,
    setIsEditUserOpen,
    onEditSuccess
}: UserManagementDialogsProps) {
    const { tenant } = useTenant();
    const { StudentLabel } = useStudentLabel();

    // Add Role Logic
    const [newRoleForUser, setNewRoleForUser] = useState<AppRole>("TEACHER");
    const addRoleMutation = useAddRole(tenant?.id || "");

    const handleAddRoleToUser = () => {
        if (!selectedUser) return;
        addRoleMutation.mutate({ userId: selectedUser.id, role: newRoleForUser }, {
            onSuccess: () => setIsAddRoleOpen(false)
        });
    };

    // Reset Password Logic
    const [newPassword, setNewPassword] = useState("");
    const [isResettingPassword, setIsResettingPassword] = useState(false);

    const generateResetPassword = () => {
        const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
        let password = "";
        for (let i = 0; i < 10; i++) {
            password += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        setNewPassword(password);
    };

    const handleResetPassword = async () => {
        if (!tenant || !resetPasswordUser || !newPassword) return;
        setIsResettingPassword(true);
        try {
            await apiClient.post("/auth/reset-user-password/", {
                userId: resetPasswordUser.id,
                newPassword: newPassword,
                userEmail: resetPasswordUser.email,
                userName: `${resetPasswordUser.first_name || ""} ${resetPasswordUser.last_name || ""}`.trim() || resetPasswordUser.email,
                tenantName: tenant.name,
                tenantSlug: tenant.slug,
                tenantLogo: tenant.logo_url,
                appUrl: window.location.origin,
            });
            toast.success(`Le nouveau mot de passe a été envoyé à ${resetPasswordUser.email}`);
            setIsResetPasswordOpen(false);
            setResetPasswordUser(null);
            setNewPassword("");
        } catch (error: any) {
            toast.error(error.message || "Impossible de réinitialiser le mot de passe");
        } finally {
            setIsResettingPassword(false);
        }
    };

    const getRoleLabel = (role: AppRole) => {
        return getRoleLabelBase(role, StudentLabel);
    };

    // Edit User Logic
    const [editFirstName, setEditFirstName] = useState(selectedUser?.first_name || "");
    const [editLastName, setEditLastName] = useState(selectedUser?.last_name || "");
    const [editEmail, setEditEmail] = useState(selectedUser?.email || "");

    // Update form when selectedUser changes
    useEffect(() => {
        if (selectedUser) {
            setEditFirstName(selectedUser.first_name || "");
            setEditLastName(selectedUser.last_name || "");
            setEditEmail(selectedUser.email || "");
        }
    }, [selectedUser]);

    const updateUserMutation = useUpdateUser(tenant?.id || "");

    const handleUpdateUser = () => {
        if (!selectedUser) return;
        updateUserMutation.mutate({
            userId: selectedUser.id,
            data: {
                first_name: editFirstName,
                last_name: editLastName,
                email: editEmail
            }
        }, {
            onSuccess: () => {
                setIsEditUserOpen(false);
                if (onEditSuccess) onEditSuccess();
            }
        });
    };

    return (
        <>
            {/* Add Role Dialog */}
            <Dialog open={isAddRoleOpen} onOpenChange={setIsAddRoleOpen}>
                <DialogContent className="max-w-md max-h-[95vh] flex flex-col p-6">
                    <DialogHeader>
                        <DialogTitle>Ajouter un rôle</DialogTitle>
                        <DialogDescription>
                            Ajouter un rôle à {selectedUser?.first_name} {selectedUser?.last_name}
                        </DialogDescription>
                    </DialogHeader>
                    <ScrollArea className="flex-1 px-1 overflow-y-auto">
                        <div className="space-y-4 py-4">
                            <div className="space-y-2">
                                <Label>Nouveau rôle</Label>
                                <Select value={newRoleForUser} onValueChange={(v) => setNewRoleForUser(v as AppRole)}>
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {getInvitableRoles()
                                            .filter((role) => !selectedUser?.roles.includes(role))
                                            .map((role) => (
                                                <SelectItem key={role} value={role}>
                                                    {getRoleLabel(role)}
                                                </SelectItem>
                                            ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <Button onClick={handleAddRoleToUser} className="w-full" disabled={addRoleMutation.isPending}>
                                {addRoleMutation.isPending ? <Loader2 className="animate-spin w-4 h-4 mr-2" /> : null}
                                Ajouter le rôle
                            </Button>
                        </div>
                    </ScrollArea>
                </DialogContent>
            </Dialog>

            {/* Reset Password Dialog */}
            <Dialog open={isResetPasswordOpen} onOpenChange={setIsResetPasswordOpen}>
                <DialogContent className="max-h-[95vh] flex flex-col p-6">
                    <DialogHeader>
                        <DialogTitle>Réinitialiser le mot de passe</DialogTitle>
                        <DialogDescription>
                            Le nouveau mot de passe sera envoyé par email à l'utilisateur
                        </DialogDescription>
                    </DialogHeader>
                    <ScrollArea className="flex-1 px-1 overflow-y-auto">
                        <div className="space-y-4 py-4">
                            <div className="p-3 bg-muted rounded-lg">
                                <p className="text-sm font-medium">{resetPasswordUser?.first_name} {resetPasswordUser?.last_name}</p>
                                <p className="text-sm text-muted-foreground">{resetPasswordUser?.email}</p>
                            </div>
                            <div className="space-y-2">
                                <Label>Nouveau mot de passe</Label>
                                <div className="flex gap-2">
                                    <Input
                                        type="text"
                                        value={newPassword}
                                        onChange={(e) => setNewPassword(e.target.value)}
                                        placeholder="Mot de passe"
                                    />
                                    <Button type="button" variant="outline" onClick={generateResetPassword}>
                                        Générer
                                    </Button>
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    L'utilisateur devra changer ce mot de passe à la prochaine connexion
                                </p>
                            </div>
                            <div className="flex gap-2">
                                <Button variant="outline" className="flex-1" onClick={() => setIsResetPasswordOpen(false)}>
                                    Annuler
                                </Button>
                                <Button className="flex-1" onClick={handleResetPassword} disabled={!newPassword || isResettingPassword}>
                                    {isResettingPassword ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                                    Réinitialiser et envoyer
                                </Button>
                            </div>
                        </div>
                    </ScrollArea>
                </DialogContent>
            </Dialog>

            {/* Edit User Dialog */}
            <Dialog open={isEditUserOpen} onOpenChange={setIsEditUserOpen}>
                <DialogContent className="max-w-md max-h-[95vh] flex flex-col p-6">
                    <DialogHeader>
                        <DialogTitle>Modifier l'utilisateur</DialogTitle>
                        <DialogDescription>
                            Modifier les informations de base de l'utilisateur
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="edit-first-name">Prénom</Label>
                                <Input
                                    id="edit-first-name"
                                    value={editFirstName}
                                    onChange={(e) => setEditFirstName(e.target.value)}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="edit-last-name">Nom</Label>
                                <Input
                                    id="edit-last-name"
                                    value={editLastName}
                                    onChange={(e) => setEditLastName(e.target.value)}
                                />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="edit-email">Email</Label>
                                <Input
                                    id="edit-email"
                                    type="email"
                                    value={editEmail}
                                    onChange={(e) => setEditEmail(e.target.value)}
                                />
                        </div>
                        <div className="flex gap-2 pt-2">
                            <Button variant="outline" className="flex-1" onClick={() => setIsEditUserOpen(false)}>
                                Annuler
                            </Button>
                            <Button className="flex-1" onClick={handleUpdateUser} disabled={updateUserMutation.isPending}>
                                {updateUserMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                                Enregistrer
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
}
