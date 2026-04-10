import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Users, Plus, Trash2, Mail } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface TeamStepProps {
    data: any;
    onUpdate: (data: any) => void;
}

export const TeamStep = ({ data, onUpdate }: TeamStepProps) => {
    const [admins, setAdmins] = useState(data.admins || []);
    const [newAdmin, setNewAdmin] = useState({ email: '', role: 'ADMIN' });

    const handleAddAdmin = () => {
        if (newAdmin.email.trim()) {
            const newAdmins = [...admins, newAdmin];
            setAdmins(newAdmins);
            onUpdate({ ...data, admins: newAdmins });
            setNewAdmin({ email: '', role: 'ADMIN' });
        }
    };

    const handleRemoveAdmin = (index: number) => {
        const newAdmins = admins.filter((_: any, i: number) => i !== index);
        setAdmins(newAdmins);
        onUpdate({ ...data, admins: newAdmins });
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                    <Users className="w-6 h-6 text-primary" />
                </div>
                <div>
                    <h2 className="text-2xl font-bold">Inviter votre Équipe</h2>
                    <p className="text-muted-foreground">Ajoutez les administrateurs et enseignants</p>
                </div>
            </div>

            <Alert>
                <Mail className="w-4 h-4" />
                <AlertDescription>
                    Les invitations seront envoyées par email après la création de l'établissement. Cette étape est optionnelle.
                </AlertDescription>
            </Alert>

            <div className="space-y-4">
                <Label>Administrateurs</Label>

                <div className="flex gap-2">
                    <Input
                        type="email"
                        value={newAdmin.email}
                        onChange={(e) => setNewAdmin({ ...newAdmin, email: e.target.value })}
                        placeholder="email@exemple.fr"
                        onKeyPress={(e) => e.key === 'Enter' && handleAddAdmin()}
                        className="flex-1"
                    />
                    <Select
                        value={newAdmin.role}
                        onValueChange={(v) => setNewAdmin({ ...newAdmin, role: v })}
                    >
                        <SelectTrigger className="w-40">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="TENANT_ADMIN">Admin Principal</SelectItem>
                            <SelectItem value="ADMIN">Administrateur</SelectItem>
                            <SelectItem value="DIRECTOR">Directeur</SelectItem>
                        </SelectContent>
                    </Select>
                    <Button onClick={handleAddAdmin} className="gap-2">
                        <Plus className="w-4 h-4" />
                        Ajouter
                    </Button>
                </div>

                {admins.length > 0 && (
                    <div className="space-y-2">
                        {admins.map((admin: any, index: number) => (
                            <div
                                key={index}
                                className="flex items-center justify-between p-3 bg-muted rounded-lg"
                            >
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center">
                                        <Mail className="w-4 h-4 text-primary" />
                                    </div>
                                    <div>
                                        <p className="font-medium">{admin.email}</p>
                                        <p className="text-xs text-muted-foreground">
                                            {admin.role === 'TENANT_ADMIN' && 'Admin Principal'}
                                            {admin.role === 'ADMIN' && 'Administrateur'}
                                            {admin.role === 'DIRECTOR' && 'Directeur'}
                                        </p>
                                    </div>
                                </div>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleRemoveAdmin(index)}
                                    className="text-destructive hover:text-destructive"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </Button>
                            </div>
                        ))}
                    </div>
                )}

                {admins.length === 0 && (
                    <div className="text-center py-8 text-muted-foreground border-2 border-dashed rounded-lg">
                        Aucun administrateur ajouté. Vous pouvez passer cette étape et inviter votre équipe plus tard.
                    </div>
                )}
            </div>

            <Alert className="bg-blue-50 border-blue-200">
                <AlertDescription className="text-blue-800">
                    💡 Astuce : Vous pourrez inviter des enseignants et d'autres membres de l'équipe après la création de l'établissement.
                </AlertDescription>
            </Alert>
        </div>
    );
};
