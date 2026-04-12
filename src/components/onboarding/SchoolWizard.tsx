import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SchoolInfoStep } from "./steps/SchoolInfoStep";
import { StructureStep } from "./steps/StructureStep";
import { YearStep } from "./steps/YearStep";
import { TeamStep } from "./steps/TeamStep";
import { FinalStep } from "./steps/FinalStep";
import { CheckCircle2 } from "lucide-react";

export interface WizardData {
    school: {
        name?: string;
        type?: 'primary' | 'middle' | 'high' | 'university';
        country?: string;
        currency?: string;
        logo?: File;
        address?: string;
        phone?: string;
        email?: string;
    };
    structure: {
        levels?: Array<{ name: string; order: number }>;
        classes?: Array<{ name: string; level_id: string }>;
        useTemplate?: boolean;
        templateType?: string;
    };
    year: {
        start_date?: string;
        end_date?: string;
        terms?: Array<{ name: string; start_date: string; end_date: string }>;
        holidays?: Array<{ name: string; start_date: string; end_date: string }>;
    };
    team: {
        admins?: Array<{ email: string; role: string }>;
        teachers?: Array<{ email: string; name: string }>;
    };
}

const steps = [
    { id: 1, title: 'Informations Générales', component: SchoolInfoStep },
    { id: 2, title: 'Structure', component: StructureStep },
    { id: 3, title: 'Année Scolaire', component: YearStep },
    { id: 4, title: 'Équipe', component: TeamStep },
    { id: 5, title: 'Finalisation', component: FinalStep }
];

export const SchoolWizard = () => {
    const navigate = useNavigate();
    const [currentStep, setCurrentStep] = useState(1);
    const [data, setData] = useState<WizardData>({
        school: {},
        structure: {},
        year: {},
        team: {}
    });
    const [isSubmitting, setIsSubmitting] = useState(false);

    const updateData = (section: keyof WizardData, newData: any) => {
        setData(prev => ({
            ...prev,
            [section]: { ...prev[section], ...newData }
        }));
    };

    const handleNext = () => {
        if (currentStep < steps.length) {
            setCurrentStep(currentStep + 1);
        }
    };

    const handlePrevious = () => {
        if (currentStep > 1) {
            setCurrentStep(currentStep - 1);
        }
    };

    const handleFinish = async () => {
        setIsSubmitting(true);
        try {
            // La logique de création sera gérée par FinalStep
            console.log("Wizard completed with data:", data);
            // Redirection sera gérée par FinalStep après succès
        } catch (error) {
            console.error("Error completing wizard:", error);
        } finally {
            setIsSubmitting(false);
        }
    };

    const CurrentStepComponent = steps[currentStep - 1].component;
    const sectionKey = ['school', 'structure', 'year', 'team', 'final'][currentStep - 1] as keyof WizardData;

    return (
        <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/5 py-12">
            <div className="max-w-5xl mx-auto px-4">
                {/* Header */}
                <div className="text-center mb-8">
                    <h1 className="text-4xl font-display font-bold text-foreground mb-2">
                        Bienvenue sur votre plateforme
                    </h1>
                    <p className="text-lg text-muted-foreground">
                        Configurons votre établissement en quelques étapes simples
                    </p>
                </div>

                {/* Progress Bar */}
                <div className="mb-8">
                    <div className="flex justify-between mb-4">
                        {steps.map((step) => (
                            <div
                                key={step.id}
                                className={cn(
                                    "flex flex-col items-center flex-1",
                                    currentStep >= step.id ? "text-primary" : "text-muted-foreground"
                                )}
                            >
                                <div
                                    className={cn(
                                        "w-10 h-10 rounded-full flex items-center justify-center mb-2 font-semibold transition-all",
                                        currentStep > step.id && "bg-primary text-primary-foreground",
                                        currentStep === step.id && "bg-primary text-primary-foreground ring-4 ring-primary/20",
                                        currentStep < step.id && "bg-muted text-muted-foreground"
                                    )}
                                >
                                    {currentStep > step.id ? (
                                        <CheckCircle2 className="w-6 h-6" />
                                    ) : (
                                        step.id
                                    )}
                                </div>
                                <span className={cn(
                                    "text-sm font-medium text-center hidden md:block",
                                    currentStep >= step.id && "font-semibold"
                                )}>
                                    {step.title}
                                </span>
                            </div>
                        ))}
                    </div>
                    <Progress value={(currentStep / steps.length) * 100} className="h-2" />
                </div>

                {/* Current Step */}
                <Card className="border-2 shadow-lg">
                    <CardContent className="p-8">
                        <CurrentStepComponent
                            data={sectionKey === 'final' ? data : data[sectionKey]}
                            allData={data}
                            onUpdate={(newData) => sectionKey !== 'final' && updateData(sectionKey, newData)}
                            onNext={handleNext}
                            onFinish={handleFinish}
                        />
                    </CardContent>
                </Card>

                {/* Navigation */}
                <div className="flex justify-between mt-6">
                    <Button
                        variant="outline"
                        onClick={handlePrevious}
                        disabled={currentStep === 1 || isSubmitting}
                        size="lg"
                    >
                        Précédent
                    </Button>

                    {currentStep < steps.length ? (
                        <Button
                            onClick={handleNext}
                            disabled={isSubmitting}
                            size="lg"
                        >
                            Suivant
                        </Button>
                    ) : (
                        <Button
                            onClick={handleFinish}
                            disabled={isSubmitting}
                            size="lg"
                            className="bg-green-600 hover:bg-green-700"
                        >
                            {isSubmitting ? "Création en cours..." : "Terminer"}
                        </Button>
                    )}
                </div>

                {/* Help Text */}
                <p className="text-center text-sm text-muted-foreground mt-6">
                    Étape {currentStep} sur {steps.length} • Vous pouvez revenir en arrière à tout moment
                </p>
            </div>
        </div>
    );
};
