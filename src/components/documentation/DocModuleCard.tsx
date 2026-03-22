import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ModuleDoc } from "@/data/documentation";

interface DocModuleCardProps {
    module: ModuleDoc;
}

export function DocModuleCard({ module }: DocModuleCardProps) {
    return (
        <Card>
            <CardHeader>
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-primary/10 rounded-lg text-primary">
                        {module.icon}
                    </div>
                    <div>
                        <CardTitle>{module.title}</CardTitle>
                        <CardDescription>{module.description}</CardDescription>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="space-y-6">
                {/* Prerequis */}
                {module.prerequisites && (
                    <div className="bg-amber-50 dark:bg-amber-950/30 rounded-lg p-4 border border-amber-200 dark:border-amber-800">
                        <h4 className="font-semibold text-sm text-amber-700 dark:text-amber-400 mb-2 flex items-center gap-2">
                            ⚠️ Prérequis
                        </h4>
                        <ul className="space-y-1">
                            {module.prerequisites.map((prereq, i) => (
                                <li key={i} className="text-sm text-amber-800 dark:text-amber-300 flex items-start gap-2">
                                    <span>•</span>
                                    {prereq}
                                </li>
                            ))}
                        </ul>
                    </div>
                )}

                {/* Fonctionnalités */}
                <div>
                    <h4 className="font-semibold text-sm text-primary mb-3 flex items-center gap-2">
                        ✨ Fonctionnalités
                    </h4>
                    <ul className="grid sm:grid-cols-2 gap-2">
                        {module.features.map((feature, i) => (
                            <li key={i} className="flex items-start gap-2 text-sm">
                                <Badge variant="outline" className="mt-0.5 h-5 w-5 p-0 justify-center shrink-0">
                                    {i + 1}
                                </Badge>
                                {feature}
                            </li>
                        ))}
                    </ul>
                </div>

                <Separator />

                {/* Guide étape par étape détaillé */}
                {module.stepByStep ? (
                    <div className="bg-green-50 dark:bg-green-950/30 rounded-lg p-4 border border-green-200 dark:border-green-800">
                        <h4 className="font-semibold text-sm text-green-700 dark:text-green-400 mb-4 flex items-center gap-2">
                            📋 Guide détaillé étape par étape
                        </h4>
                        <div className="space-y-6">
                            {module.stepByStep.map((guide, idx) => (
                                <div key={idx}>
                                    <h5 className="font-medium text-green-800 dark:text-green-300 mb-3 pb-2 border-b border-green-200 dark:border-green-700 flex items-center gap-2">
                                        <span className="bg-green-600 text-white rounded-full h-5 w-5 flex items-center justify-center text-xs">
                                            {idx + 1}
                                        </span>
                                        {guide.title}
                                    </h5>
                                    <ol className="space-y-2 ml-2">
                                        {guide.steps.map((step, stepIdx) => (
                                            <li key={stepIdx} className="flex items-start gap-3 text-sm text-green-700 dark:text-green-300">
                                                <span className="bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 rounded-full h-5 w-5 flex items-center justify-center text-xs shrink-0 mt-0.5">
                                                    {stepIdx + 1}
                                                </span>
                                                {step}
                                            </li>
                                        ))}
                                    </ol>
                                </div>
                            ))}
                        </div>
                    </div>
                ) : (
                    <div>
                        <h4 className="font-semibold text-sm text-primary mb-3 flex items-center gap-2">
                            📝 Comment utiliser
                        </h4>
                        <ol className="space-y-2">
                            {module.howToUse.map((step, i) => (
                                <li key={i} className="flex items-start gap-3 text-sm">
                                    <span className="bg-primary/10 text-primary rounded-full h-5 w-5 flex items-center justify-center text-xs shrink-0 mt-0.5">
                                        {i + 1}
                                    </span>
                                    {step}
                                </li>
                            ))}
                        </ol>
                    </div>
                )}

                {/* Conseils */}
                <div className="bg-blue-50 dark:bg-blue-950/30 border-l-4 border-blue-500 rounded-r-lg p-4">
                    <h4 className="font-semibold text-sm text-blue-700 dark:text-blue-400 mb-2 flex items-center gap-2">
                        💡 Conseils pratiques
                    </h4>
                    <ul className="space-y-1">
                        {module.tips.map((t, i) => (
                            <li key={i} className="text-sm text-blue-800 dark:text-blue-300 flex items-start gap-2">
                                <span>•</span>
                                {t}
                            </li>
                        ))}
                    </ul>
                </div>
            </CardContent>
        </Card>
    );
}
