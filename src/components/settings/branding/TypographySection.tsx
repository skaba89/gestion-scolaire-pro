import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { BrandingSectionProps } from "./BrandingTypes";

export function TypographySection({ formData, setFormData }: BrandingSectionProps) {
    return (
        <Card>
            <CardHeader>
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                        <span className="font-bold text-lg">Ag</span>
                    </div>
                    <div>
                        <CardTitle>Typographie</CardTitle>
                        <CardDescription>Choisissez la police de caractères de l'application</CardDescription>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="space-y-2">
                    <Label htmlFor="font_family">Police de caractères</Label>
                    <select
                        id="font_family"
                        value={formData.font_family}
                        onChange={(e) => setFormData(p => ({ ...p, font_family: e.target.value }))}
                        className="w-full p-2 rounded-md border border-input bg-background"
                    >
                        <option value="Inter">Inter (Sans-serif)</option>
                        <option value="Roboto">Roboto</option>
                        <option value="Poppins">Poppins</option>
                        <option value="Montserrat">Montserrat</option>
                        <option value="Open Sans">Open Sans</option>
                        <option value="Outfit">Outfit</option>
                    </select>
                </div>
            </CardContent>
        </Card>
    );
}
