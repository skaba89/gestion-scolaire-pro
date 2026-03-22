import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Layout, LayoutTemplate, AlignLeft, AlignRight } from "lucide-react";
import { BrandingSectionProps } from "./BrandingTypes";

export function LayoutSection({ formData, setFormData }: BrandingSectionProps) {
    return (
        <Card>
            <CardHeader>
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Layout className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                        <CardTitle>Mise en page</CardTitle>
                        <CardDescription>Personnalisez la disposition de votre interface</CardDescription>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <div className="space-y-3">
                        <Label className="text-base font-semibold">Position du menu</Label>
                        <div className="grid grid-cols-2 gap-3">
                            <Button
                                type="button"
                                variant={formData.sidebar_position === "left" ? "default" : "outline"}
                                className="flex flex-col h-20 gap-2"
                                onClick={() => setFormData(p => ({ ...p, sidebar_position: "left" }))}
                            >
                                <AlignLeft className="w-6 h-6" />
                                <span>Gauche</span>
                            </Button>
                            <Button
                                type="button"
                                variant={formData.sidebar_position === "right" ? "default" : "outline"}
                                onClick={() => setFormData(p => ({ ...p, sidebar_position: "right" }))}
                                className="flex flex-col h-20 gap-2"
                            >
                                <AlignRight className="w-6 h-6" />
                                <span>Droite</span>
                            </Button>
                        </div>
                        <p className="text-xs text-muted-foreground">
                            Définit si le menu latéral apparaît à gauche ou à droite de l'écran.
                        </p>
                    </div>

                    <div className="space-y-3">
                        <Label className="text-base font-semibold">Style du menu</Label>
                        <div className="grid grid-cols-2 gap-3">
                            <Button
                                type="button"
                                variant={formData.sidebar_layout === "standard" ? "default" : "outline"}
                                className="flex flex-col h-20 gap-2"
                                onClick={() => setFormData(p => ({ ...p, sidebar_layout: "standard" }))}
                            >
                                <LayoutTemplate className="w-6 h-6" />
                                <span>Standard</span>
                            </Button>
                            <Button
                                type="button"
                                variant={formData.sidebar_layout === "compact" ? "default" : "outline"}
                                className="flex flex-col h-20 gap-2"
                                onClick={() => setFormData(p => ({ ...p, sidebar_layout: "compact" }))}
                            >
                                <Layout className="w-6 h-6" />
                                <span>Compact</span>
                            </Button>
                        </div>
                        <p className="text-xs text-muted-foreground">
                            Le mode compact réduit l'espacement pour afficher plus d'éléments.
                        </p>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
