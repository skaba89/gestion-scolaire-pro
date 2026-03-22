import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { AlignLeft } from "lucide-react";
import { useTenant } from "@/contexts/TenantContext";
import { BrandingSectionProps } from "./BrandingTypes";

export function TerminologySection({ formData, setFormData }: BrandingSectionProps) {
    const { tenant } = useTenant();

    return (
        <Card>
            <CardHeader>
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                        <AlignLeft className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                        <CardTitle>Terminologie</CardTitle>
                        <CardDescription>Comment appelez-vous vos apprenants ?</CardDescription>
                    </div>
                </div>
            </CardHeader>
            <CardContent>
                <div className="space-y-4">
                    <div className="flex items-center gap-4">
                        <select
                            value={formData.student_label_mode}
                            onChange={(e) => setFormData(p => ({ ...p, student_label_mode: e.target.value as any }))}
                            className="w-full p-2 rounded-md border border-input bg-background"
                        >
                            <option value="automatic">Automatique (basé sur le type d'établissement)</option>
                            <option value="student">Toujours "Étudiant"</option>
                            <option value="pupil">Toujours "Élève"</option>
                        </select>
                    </div>
                    <p className="text-sm text-muted-foreground">
                        Option actuelle : <strong>{tenant?.type === 'UNIVERSITY' ? 'Université' : 'École'}</strong>
                        (affichera par défaut : {tenant?.type === 'UNIVERSITY' ? 'Étudiants' : 'Élèves'})
                    </p>
                </div>
            </CardContent>
        </Card>
    );
}
