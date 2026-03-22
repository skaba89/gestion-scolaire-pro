import { useState } from "react";
import { useTenant } from "@/contexts/TenantContext";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { UserPlus, Mail, Shield, Loader2 } from "lucide-react";
import { useCreateUser, AppRole } from "@/queries/users";
import { getRoleLabel as getRoleLabelBase, getRoleDescription, getInvitableRoles } from "@/lib/permissions";
import { useStudentLabel } from "@/hooks/useStudentLabel";

export function UserCreateDialog() {
    const { tenant } = useTenant();
    const { hasRole } = useAuth();
    const { studentLabel, StudentLabel, studentsLabel, StudentsLabel } = useStudentLabel();
    const [isOpen, setIsOpen] = useState(false);

    const [formData, setFormData] = useState({
        email: "",
        firstName: "",
        lastName: "",
        password: "",
        role: "TEACHER" as AppRole,
    });

    const createUserMutation = useCreateUser(tenant?.id || "");

    const getRoleLabel = (role: AppRole) => {
        return getRoleLabelBase(role, StudentLabel);
    };

    const generatePassword = () => {
        const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
        let password = "";
        for (let i = 0; i < 10; i++) {
            password += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        setFormData({ ...formData, password });
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!tenant) return;

        createUserMutation.mutate({
            ...formData,
            tenant: {
                id: tenant.id,
                name: tenant.name,
                slug: tenant.slug,
                logo_url: tenant.logo_url
            }
        }, {
            onSuccess: () => {
                setIsOpen(false);
                setFormData({ email: "", firstName: "", lastName: "", password: "", role: "TEACHER" });
            }
        });
    };

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
                <Button className="gap-2">
                    <UserPlus className="w-4 h-4" />
                    Ajouter un utilisateur
                </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md max-h-[95vh] flex flex-col p-6">
                <DialogHeader>
                    <DialogTitle>Créer un compte utilisateur</DialogTitle>
                    <DialogDescription>
                        Créez un compte et envoyez les identifiants par email
                    </DialogDescription>
                </DialogHeader>
                <ScrollArea className="flex-1 px-1 overflow-y-auto">
                    <form onSubmit={handleSubmit} className="space-y-4 py-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="firstName">Prénom *</Label>
                                <Input
                                    id="firstName"
                                    placeholder="Jean"
                                    value={formData.firstName}
                                    onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                                    required
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="lastName">Nom *</Label>
                                <Input
                                    id="lastName"
                                    placeholder="Dupont"
                                    value={formData.lastName}
                                    onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                                    required
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="email">
                                <Mail className="w-4 h-4 inline mr-2" />
                                Email *
                            </Label>
                            <Input
                                id="email"
                                type="email"
                                placeholder="utilisateur@email.com"
                                value={formData.email}
                                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                required
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="password">Mot de passe temporaire *</Label>
                            <div className="flex gap-2">
                                <Input
                                    id="password"
                                    type="text"
                                    placeholder="Mot de passe"
                                    value={formData.password}
                                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                    required
                                />
                                <Button type="button" variant="outline" onClick={generatePassword}>
                                    Générer
                                </Button>
                            </div>
                            <p className="text-xs text-muted-foreground">
                                L'utilisateur devra changer ce mot de passe à la première connexion
                            </p>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="role">
                                <Shield className="w-4 h-4 inline mr-2" />
                                Rôle *
                            </Label>
                            <Select
                                value={formData.role}
                                onValueChange={(v) => setFormData({ ...formData, role: v as AppRole })}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {getInvitableRoles()
                                        .filter(role => hasRole("SUPER_ADMIN") || role !== "SUPER_ADMIN")
                                        .map((role) => (
                                            <SelectItem key={role} value={role}>
                                                {getRoleLabel(role)}
                                            </SelectItem>
                                        ))}
                                </SelectContent>
                            </Select>
                            <p className="text-xs text-muted-foreground">
                                {getRoleDescription(formData.role, studentLabel, studentsLabel)}
                            </p>
                        </div>

                        <Button type="submit" className="w-full" disabled={createUserMutation.isPending}>
                            {createUserMutation.isPending ? (
                                <>
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    Création en cours...
                                </>
                            ) : (
                                "Créer le compte et envoyer les identifiants"
                            )}
                        </Button>
                    </form>
                </ScrollArea>
            </DialogContent>
        </Dialog>
    );
}
