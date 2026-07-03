import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Trash2, Layers, Sparkles } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface StructureStepProps {
    data: any;
    onUpdate: (data: any) => void;
}

// Presets du système éducatif guinéen — modifiables après sélection
const TEMPLATES = {
    guinea_primary: {
        name: "École Primaire (Guinée)",
        levels: [
            { name: "CP1", order: 1 },
            { name: "CP2", order: 2 },
            { name: "CE1", order: 3 },
            { name: "CE2", order: 4 },
            { name: "CM1", order: 5 },
            { name: "CM2", order: 6 }
        ]
    },
    guinea_middle: {
        name: "Collège (Guinée)",
        levels: [
            { name: "7ème", order: 1 },
            { name: "8ème", order: 2 },
            { name: "9ème", order: 3 },
            { name: "10ème", order: 4 }
        ]
    },
    guinea_high: {
        name: "Lycée (Guinée)",
        levels: [
            { name: "11ème", order: 1 },
            { name: "12ème", order: 2 },
            { name: "Terminale", order: 3 }
        ]
    },
    guinea_full: {
        name: "École complète (Primaire → Lycée)",
        levels: [
            { name: "CP1", order: 1 },
            { name: "CP2", order: 2 },
            { name: "CE1", order: 3 },
            { name: "CE2", order: 4 },
            { name: "CM1", order: 5 },
            { name: "CM2", order: 6 },
            { name: "7ème", order: 7 },
            { name: "8ème", order: 8 },
            { name: "9ème", order: 9 },
            { name: "10ème", order: 10 },
            { name: "11ème", order: 11 },
            { name: "12ème", order: 12 },
            { name: "Terminale", order: 13 }
        ]
    },
    university: {
        name: "Université (LMD)",
        levels: [
            { name: "Licence 1", order: 1 },
            { name: "Licence 2", order: 2 },
            { name: "Licence 3", order: 3 },
            { name: "Master 1", order: 4 },
            { name: "Master 2", order: 5 }
        ]
    },
    training: {
        name: "Centre de formation",
        levels: [
            { name: "Année 1", order: 1 },
            { name: "Année 2", order: 2 },
            { name: "Année 3", order: 3 }
        ]
    }
};

export const StructureStep = ({ data, onUpdate }: StructureStepProps) => {
    const [levels, setLevels] = useState(data.levels || []);
    const [newLevel, setNewLevel] = useState("");

    const handleUseTemplate = (templateKey: string) => {
        const template = TEMPLATES[templateKey as keyof typeof TEMPLATES];
        setLevels(template.levels);
        onUpdate({ ...data, levels: template.levels, useTemplate: true, templateType: templateKey });
    };

    const handleAddLevel = () => {
        if (newLevel.trim()) {
            const newLevels = [...levels, { name: newLevel, order: levels.length + 1 }];
            setLevels(newLevels);
            onUpdate({ ...data, levels: newLevels });
            setNewLevel("");
        }
    };

    const handleRemoveLevel = (index: number) => {
        const newLevels = levels.filter((_: any, i: number) => i !== index);
        setLevels(newLevels);
        onUpdate({ ...data, levels: newLevels });
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                    <Layers className="w-6 h-6 text-primary" />
                </div>
                <div>
                    <h2 className="text-2xl font-bold">Structure de l'Établissement</h2>
                    <p className="text-muted-foreground">Définissez les niveaux et classes</p>
                </div>
            </div>

            <Tabs defaultValue="template" className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="template" className="gap-2">
                        <Sparkles className="w-4 h-4" />
                        Utiliser un modèle
                    </TabsTrigger>
                    <TabsTrigger value="custom">Personnalisé</TabsTrigger>
                </TabsList>

                <TabsContent value="template" className="space-y-4 mt-6">
                    <Alert>
                        <AlertDescription>
                            Choisissez un modèle prédéfini pour gagner du temps. Vous pourrez le personnaliser plus tard.
                        </AlertDescription>
                    </Alert>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {Object.entries(TEMPLATES).map(([key, template]) => (
                            <Card
                                key={key}
                                className="cursor-pointer hover:border-primary transition-all"
                                onClick={() => handleUseTemplate(key)}
                            >
                                <CardContent className="p-6">
                                    <h3 className="font-semibold mb-3">{template.name}</h3>
                                    <div className="space-y-1">
                                        {template.levels.map((level, i) => (
                                            <div key={i} className="text-sm text-muted-foreground flex items-center gap-2">
                                                <div className="w-6 h-6 bg-primary/10 rounded flex items-center justify-center text-xs font-semibold">
                                                    {level.order}
                                                </div>
                                                {level.name}
                                            </div>
                                        ))}
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                </TabsContent>

                <TabsContent value="custom" className="space-y-4 mt-6">
                    <div className="flex gap-2">
                        <Input
                            value={newLevel}
                            onChange={(e) => setNewLevel(e.target.value)}
                            placeholder="Nom du niveau (ex: 6ème, Licence 1)"
                            onKeyPress={(e) => e.key === 'Enter' && handleAddLevel()}
                        />
                        <Button onClick={handleAddLevel} className="gap-2">
                            <Plus className="w-4 h-4" />
                            Ajouter
                        </Button>
                    </div>

                    {levels.length > 0 && (
                        <div className="space-y-2">
                            <Label>Niveaux créés ({levels.length})</Label>
                            {levels.map((level: any, index: number) => (
                                <div
                                    key={index}
                                    className="flex items-center justify-between p-3 bg-muted rounded-lg"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 bg-primary/10 rounded flex items-center justify-center text-sm font-semibold">
                                            {level.order}
                                        </div>
                                        <span className="font-medium">{level.name}</span>
                                    </div>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => handleRemoveLevel(index)}
                                        className="text-destructive hover:text-destructive"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </Button>
                                </div>
                            ))}
                        </div>
                    )}
                </TabsContent>
            </Tabs>

            {levels.length > 0 && (
                <Alert className="bg-green-50 border-green-200">
                    <AlertDescription className="text-green-800">
                        ✓ {levels.length} niveau(x) configuré(s). Les classes seront créées automatiquement après validation.
                    </AlertDescription>
                </Alert>
            )}
        </div>
    );
};
