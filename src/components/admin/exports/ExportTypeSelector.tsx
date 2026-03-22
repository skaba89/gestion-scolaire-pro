import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

interface ExportTypeConfig {
    label: string;
    icon: React.ElementType;
    description: string;
    fields: string[];
}

interface ExportTypeSelectorProps {
    configs: Record<string, ExportTypeConfig>;
    selectedType: string;
    onTypeChange: (type: any) => void;
}

export const ExportTypeSelector = ({
    configs,
    selectedType,
    onTypeChange,
}: ExportTypeSelectorProps) => {
    return (
        <Card>
            <CardHeader>
                <CardTitle>Type d'export</CardTitle>
                <CardDescription>Sélectionnez les données à exporter</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
                {(Object.keys(configs)).map((type) => {
                    const config = configs[type];
                    const Icon = config.icon;
                    return (
                        <button
                            key={type}
                            onClick={() => onTypeChange(type)}
                            className={`w-full flex items-center gap-3 p-3 rounded-lg text-left transition-colors ${selectedType === type
                                ? "bg-primary text-primary-foreground"
                                : "hover:bg-muted"
                                }`}
                        >
                            <Icon className="h-5 w-5" />
                            <div>
                                <p className="font-medium">{config.label}</p>
                                <p className={`text-xs ${selectedType === type ? "text-primary-foreground/80" : "text-muted-foreground"}`}>
                                    {config.description}
                                </p>
                            </div>
                        </button>
                    );
                })}
            </CardContent>
        </Card>
    );
};
