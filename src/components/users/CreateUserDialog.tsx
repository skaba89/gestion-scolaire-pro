import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";

import { AppRole } from "@/lib/types";

interface CreateUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: string;
  onUserCreated: () => void;
}

const AVAILABLE_ROLES: AppRole[] = [
  "TENANT_ADMIN",
  "DIRECTOR",
  "DEPARTMENT_HEAD",
  "TEACHER",
  "STUDENT",
  "PARENT",
  "ACCOUNTANT",
  "STAFF",
];

export function CreateUserDialog({
  open,
  onOpenChange,
  tenantId,
  onUserCreated,
}: CreateUserDialogProps) {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    email: "",
    firstName: "",
    lastName: "",
    role: "STUDENT" as AppRole,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.email || !formData.firstName || !formData.lastName) {
      toast({
        variant: "destructive",
        title: "Erreur",
        description: "Veuillez remplir tous les champs obligatoires",
      });
      return;
    }

    setIsLoading(true);
    try {
      // Generate temporary password
      const tempPassword = Math.random().toString(36).slice(-12);

      // Create user in auth.users using admin API
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email: formData.email,
        password: tempPassword,
        email_confirm: true, // Auto-confirm email
      });

      if (authError) {
        throw new Error(`Erreur lors de la création de l'utilisateur: ${authError.message}`);
      }

      if (!authData.user) {
        throw new Error("Erreur lors de la création de l'utilisateur: pas d'utilisateur retourné");
      }

      const userId = authData.user.id;

      // Create profile
      const { error: profileError } = await supabase
        .from("profiles")
        .insert({
          id: userId,
          email: formData.email,
          first_name: formData.firstName,
          last_name: formData.lastName,
          tenant_id: tenantId,
          is_active: true,
        });

      if (profileError) {
        // If profile creation fails, delete the auth user
        await supabase.auth.admin.deleteUser(userId);
        throw new Error(`Erreur lors de la création du profil: ${profileError.message}`);
      }

      // Assign role
      const { error: roleError } = await supabase
        .from("user_roles")
        .upsert({
          user_id: userId,
          tenant_id: tenantId,
          role: formData.role,
          created_at: new Date().toISOString(),
        }, {
          onConflict: "user_id,tenant_id",
        });

      if (roleError) {
        throw new Error(`Erreur lors de l'assignation du rôle: ${roleError.message}`);
      }

      toast({
        title: "Succès",
        description: `Utilisateur ${formData.firstName} ${formData.lastName} créé avec succès`,
      });

      // Reset form
      setFormData({
        email: "",
        firstName: "",
        lastName: "",
        role: "STUDENT",
      });

      onOpenChange(false);
      onUserCreated();
    } catch (error) {
      console.error("Error creating user:", error);
      toast({
        variant: "destructive",
        title: "Erreur",
        description: error instanceof Error ? error.message : "Erreur lors de la création de l'utilisateur",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Créer un nouvel utilisateur</DialogTitle>
          <DialogDescription>
            Remplissez le formulaire pour ajouter un nouvel utilisateur au tenant
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="email">Email *</Label>
            <Input
              id="email"
              type="email"
              placeholder="utilisateur@example.com"
              value={formData.email}
              onChange={(e) =>
                setFormData({ ...formData, email: e.target.value })
              }
              disabled={isLoading}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="firstName">Prénom *</Label>
              <Input
                id="firstName"
                placeholder="Jean"
                value={formData.firstName}
                onChange={(e) =>
                  setFormData({ ...formData, firstName: e.target.value })
                }
                disabled={isLoading}
                required
              />
            </div>

            <div>
              <Label htmlFor="lastName">Nom *</Label>
              <Input
                id="lastName"
                placeholder="Dupont"
                value={formData.lastName}
                onChange={(e) =>
                  setFormData({ ...formData, lastName: e.target.value })
                }
                disabled={isLoading}
                required
              />
            </div>
          </div>

          <div>
            <Label htmlFor="role">Rôle *</Label>
            <Select
              value={formData.role}
              onValueChange={(value) =>
                setFormData({ ...formData, role: value as AppRole })
              }
              disabled={isLoading}
            >
              <SelectTrigger id="role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AVAILABLE_ROLES.map((role) => (
                  <SelectItem key={role} value={role}>
                    {role}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex gap-2 pt-4">
            <Button
              type="submit"
              disabled={isLoading}
              className="flex-1"
            >
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isLoading ? "Création..." : "Créer l'utilisateur"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
            >
              Annuler
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
