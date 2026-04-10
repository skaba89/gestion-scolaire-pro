import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useTenant } from "@/contexts/TenantContext";
import { apiClient } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, School, GraduationCap, BookOpen, CheckCircle, PenTool } from "lucide-react";
import { CURRENCIES } from "@/hooks/useCurrency";
import SignaturePad from "@/components/ui/SignaturePad";
import { ReconnectModal, ResumeModal } from "./OnboardingModals";

export function OnboardingWizard() {
    const navigate = useNavigate();
    const { tenantSlug } = useParams<{ tenantSlug: string }>();
    const { tenant, setCurrentTenant } = useTenant();
    const { user, signOut: performSignOut } = useAuth();

    const [step, setStep] = useState(1);
    const [isLoading, setIsLoading] = useState(false);

    // Session & Progress Management
    const [showReconnectModal, setShowReconnectModal] = useState(false);
    const [showResumeModal, setShowResumeModal] = useState(false);
    const [savedProgress, setSavedProgress] = useState<any>(null);

    // Step 1: Identity
    const [schoolName, setSchoolName] = useState(tenant?.name || "");
    const [currency, setCurrency] = useState(tenant?.settings?.currency || "XOF");

    // Step 2: Levels
    const [selectedLevels, setSelectedLevels] = useState<string[]>([]);
    const commonLevels = [
        { id: "maternelle", label: "Maternelle (PS, MS, GS)" },
        { id: "primaire", label: "Primaire (CP, CE1, CE2, CM1, CM2)" },
        { id: "college", label: "Collège (6ème, 5ème, 4ème, 3ème)" },
        { id: "lycee", label: "Lycée (2nde, 1ère, Terminale)" },
        { id: "universite", label: "Université (Licence, Master, Doctorat)" },
    ];

    // Step 3: Subjects
    const [selectedSubjects, setSelectedSubjects] = useState<string[]>([]);
    const commonSubjects = [
        "Mathématiques", "Français", "Anglais", "Histoire-Géo",
        "SVT", "Physique-Chimie", "EPS", "Arts Plastiques",
    ];

    // Step 4: Signature
    const [directorName, setDirectorName] = useState("");
    const [signatureData, setSignatureData] = useState("");

    // SCALABILITY: Save progress to localStorage to prevent data loss on session expiry
    const saveProgress = () => {
        if (!user?.id) return;

        const progress = {
            step,
            schoolName,
            currency,
            selectedLevels,
            selectedSubjects,
            directorName,
            timestamp: Date.now()
        };

        localStorage.setItem(`onboarding_progress_${user.id}`, JSON.stringify(progress));
    };

    const clearProgress = () => {
        if (!user?.id) return;
        localStorage.removeItem(`onboarding_progress_${user.id}`);
    };

    const checkSession = async (): Promise<boolean> => {
        // JWT native session is managed by AuthContext
        // If user is null, they should reconnect
        if (!user) {
            setShowReconnectModal(true);
            return false;
        }
        return true;
    };

    // Check for saved progress on mount
    useEffect(() => {
        if (!user?.id) return;

        const savedData = localStorage.getItem(`onboarding_progress_${user.id}`);

        if (savedData) {
            try {
                const progress = JSON.parse(savedData);

                // Check if save is less than 24 hours old
                const hoursSinceSave = (Date.now() - progress.timestamp) / 3600000;

                if (hoursSinceSave < 24) {
                    setSavedProgress(progress);
                    setShowResumeModal(true);
                } else {
                    // Clean up old saves
                    clearProgress();
                }
            } catch (error) {
                console.error("[Onboarding] Error parsing saved progress:", error);
                clearProgress();
            }
        }
    }, [user?.id]);

    // Auto-save progress whenever state changes
    useEffect(() => {
        if (step > 1) {
            saveProgress();
        }
    }, [step, schoolName, currency, selectedLevels, selectedSubjects, directorName]);

    const handleResumeProgress = () => {
        if (!savedProgress) return;

        setStep(savedProgress.step);
        setSchoolName(savedProgress.schoolName || "");
        setCurrency(savedProgress.currency || "XOF");
        setSelectedLevels(savedProgress.selectedLevels || []);
        setSelectedSubjects(savedProgress.selectedSubjects || []);
        setDirectorName(savedProgress.directorName || "");

        setShowResumeModal(false);
        toast.success("Progression restaurée !");
    };

    const handleStartFresh = () => {
        clearProgress();
        setShowResumeModal(false);
        toast.info("Nouvelle inscription démarrée");
    };

    const handleReconnect = () => {
        performSignOut();
    };

    const updateTenantSettings = async (updates: any) => {
        if (!tenant) return;

        try {
            await apiClient.patch('/tenants/settings', updates.settings || {});

            // If name is updated, we might need a separate endpoint or just handle it here
            if (updates.name) {
                // For now name updates are not explicitly handled in /settings
            }

            // Update local context
            setCurrentTenant({
                ...tenant,
                ...updates,
                settings: { ...tenant.settings, ...updates.settings }
            });
        } catch (error) {
            console.error("Error updating tenant settings:", error);
            throw error;
        }
    };

    const handleIdentitySubmit = async () => {
        const sessionValid = await checkSession();
        if (!sessionValid) return;

        setIsLoading(true);
        try {
            await updateTenantSettings({
                name: schoolName,
                settings: { currency, onboarding_step: 2 }
            });
            setStep(2);
        } catch (error) {
            toast.error("Erreur lors de la mise à jour");
        } finally {
            setIsLoading(false);
        }
    };

    const handleLevelsSubmit = async () => {
        const sessionValid = await checkSession();
        if (!sessionValid) return;

        setIsLoading(true);
        try {
            // Create levels in DB
            const levelsToCreate = [];

            if (selectedLevels.includes("maternelle")) {
                levelsToCreate.push("Petite Section", "Moyenne Section", "Grande Section");
            }
            if (selectedLevels.includes("primaire")) {
                levelsToCreate.push("CP", "CE1", "CE2", "CM1", "CM2");
            }
            if (selectedLevels.includes("college")) {
                levelsToCreate.push("6ème", "5ème", "4ème", "3ème");
            }
            if (selectedLevels.includes("lycee")) {
                levelsToCreate.push("2nde", "1ère", "Terminale");
            }
            if (selectedLevels.includes("universite")) {
                levelsToCreate.push("Licence 1", "Licence 2", "Licence 3", "Master 1", "Master 2", "Doctorat 1", "Doctorat 2", "Doctorat 3");
            }

            await apiClient.post('/tenants/onboarding/levels', levelsToCreate);

            await updateTenantSettings({
                settings: { onboarding_step: 3 }
            });
            setStep(3);
        } catch (error) {
            toast.error("Erreur lors de la création des niveaux");
            console.error(error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSubjectsSubmit = async () => {
        const sessionValid = await checkSession();
        if (!sessionValid) return;

        setIsLoading(true);
        try {
            await apiClient.post('/tenants/onboarding/subjects', selectedSubjects.map(name => ({
                name,
                coefficient: 1
            })));

            await updateTenantSettings({
                settings: { onboarding_step: 4 }
            });
            setStep(4);

        } catch (error) {
            toast.error("Erreur lors de la création des matières");
            console.error(error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSignatureSubmit = async () => {
        if (!directorName) {
            toast.error("Veuillez saisir le nom du responsable");
            return;
        }
        if (!signatureData) {
            toast.error("La signature est requise");
            return;
        }

        const sessionValid = await checkSession();
        if (!sessionValid) return;

        setIsLoading(true);
        try {
            // Upload signature to Sovereign Storage (MinIO)
            const base64Data = signatureData.split(',')[1];
            const byteCharacters = atob(base64Data);
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
                byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNumbers);
            const blob = new Blob([byteArray], { type: 'image/png' });

            const formData = new FormData();
            formData.append('file', blob, `signature-${Date.now()}.png`);

            const uploadResponse = await apiClient.post('/storage/upload', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });

            const signatureUrl = uploadResponse.data.url;

            // Complete onboarding
            await apiClient.patch('/tenants/onboarding/complete', {
                director_name: directorName,
                signature_url: signatureUrl
            });

            // IMPORTANT: Update local state before navigating to break the loop!
            if (tenant) {
                setCurrentTenant({
                    ...tenant,
                    settings: {
                        ...tenant.settings,
                        onboarding_completed: true,
                        onboarding_step: 4
                    }
                });
            }

            // Clear saved progress
            clearProgress();

            toast.success("Configuration terminée avec succès !");
            navigate(`/${tenantSlug}/admin`);

        } catch (error) {
            toast.error("Erreur lors de l'enregistrement de la signature");
            console.error(error);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <>
            {/* Session & Progress Modals */}
            <ReconnectModal
                open={showReconnectModal}
                onReconnect={handleReconnect}
                onCancel={() => setShowReconnectModal(false)}
            />
            <ResumeModal
                open={showResumeModal}
                savedStep={savedProgress?.step || 1}
                onResume={handleResumeProgress}
                onStartFresh={handleStartFresh}
            />

            <div className="max-w-2xl mx-auto p-6">
                <div className="mb-8 flex justify-between items-center">
                    <div className={`flex flex-col items-center ${step >= 1 ? 'text-primary' : 'text-gray-400'}`}>
                        <div className="w-10 h-10 rounded-full border-2 flex items-center justify-center mb-2 font-bold border-current">
                            <School className="w-5 h-5" />
                        </div>
                        <span className="text-xs">Identité</span>
                    </div>
                    <div className="h-[2px] w-full bg-gray-200 mx-4 relative">
                        <div className="absolute top-0 left-0 h-full bg-primary transition-all duration-500" style={{ width: step > 1 ? '100%' : '0%' }} />
                    </div>
                    <div className={`flex flex-col items-center ${step >= 2 ? 'text-primary' : 'text-gray-400'}`}>
                        <div className="w-10 h-10 rounded-full border-2 flex items-center justify-center mb-2 font-bold border-current">
                            <GraduationCap className="w-5 h-5" />
                        </div>
                        <span className="text-xs">Niveaux</span>
                    </div>
                    <div className="h-[2px] w-full bg-gray-200 mx-4 relative">
                        <div className="absolute top-0 left-0 h-full bg-primary transition-all duration-500" style={{ width: step > 2 ? '100%' : '0%' }} />
                    </div>
                    <div className={`flex flex-col items-center ${step >= 3 ? 'text-primary' : 'text-gray-400'}`}>
                        <div className="w-10 h-10 rounded-full border-2 flex items-center justify-center mb-2 font-bold border-current">
                            <BookOpen className="w-5 h-5" />
                        </div>
                        <span className="text-xs">Matières</span>
                    </div>
                    <div className="h-[2px] w-full bg-gray-200 mx-4 relative">
                        <div className="absolute top-0 left-0 h-full bg-primary transition-all duration-500" style={{ width: step > 3 ? '100%' : '0%' }} />
                    </div>
                    <div className={`flex flex-col items-center ${step >= 4 ? 'text-primary' : 'text-gray-400'}`}>
                        <div className="w-10 h-10 rounded-full border-2 flex items-center justify-center mb-2 font-bold border-current">
                            <PenTool className="w-5 h-5" />
                        </div>
                        <span className="text-xs">Signature</span>
                    </div>
                </div>

                <Card>
                    <CardHeader>
                        <CardTitle>
                            {step === 1 && "Configuration de l'Établissement"}
                            {step === 2 && "Structure Pédagogique"}
                            {step === 3 && "Matières Enseignées"}
                            {step === 4 && "Signature & Engagement"}
                        </CardTitle>
                        <CardDescription>
                            {step === 1 && "Commençons par les informations de base de votre école."}
                            {step === 2 && "Quels cycles d'enseignement proposez-vous ?"}
                            {step === 3 && "Sélectionnez les matières principales enseignées."}
                            {step === 4 && "Veuillez signer pour valider l'ouverture du compte."}
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        {step === 1 && (
                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <Label htmlFor="schoolName">Nom de l'école</Label>
                                    <Input
                                        id="schoolName"
                                        value={schoolName}
                                        onChange={(e) => setSchoolName(e.target.value)}
                                        placeholder="Ex: Groupe Scolaire Excellence"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="currency">Devise principale</Label>
                                    <Select value={currency} onValueChange={setCurrency}>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Sélectionner une devise" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {Object.values(CURRENCIES).map((curr) => (
                                                <SelectItem key={curr.code} value={curr.code}>
                                                    {curr.name} ({curr.code} {curr.symbol})
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                        )}

                        {step === 2 && (
                            <div className="space-y-4">
                                {commonLevels.map((level) => (
                                    <div key={level.id} className="flex items-center space-x-2 border p-4 rounded-lg hover:bg-gray-50 cursor-pointer" onClick={() => {
                                        if (selectedLevels.includes(level.id)) {
                                            setSelectedLevels(selectedLevels.filter(id => id !== level.id));
                                        } else {
                                            setSelectedLevels([...selectedLevels, level.id]);
                                        }
                                    }}>
                                        <Checkbox
                                            id={level.id}
                                            checked={selectedLevels.includes(level.id)}
                                            onCheckedChange={(checked) => {
                                                if (checked) {
                                                    setSelectedLevels([...selectedLevels, level.id]);
                                                } else {
                                                    setSelectedLevels(selectedLevels.filter(id => id !== level.id));
                                                }
                                            }}
                                        />
                                        <Label htmlFor={level.id} className="cursor-pointer flex-1">{level.label}</Label>
                                    </div>
                                ))}
                            </div>
                        )}

                        {step === 3 && (
                            <div className="grid grid-cols-2 gap-4">
                                {commonSubjects.map((subject) => (
                                    <div key={subject} className="flex items-center space-x-2">
                                        <Checkbox
                                            id={subject}
                                            checked={selectedSubjects.includes(subject)}
                                            onCheckedChange={(checked) => {
                                                if (checked) {
                                                    setSelectedSubjects([...selectedSubjects, subject]);
                                                } else {
                                                    setSelectedSubjects(selectedSubjects.filter(s => s !== subject));
                                                }
                                            }}
                                        />
                                        <Label htmlFor={subject} className="text-sm font-normal">{subject}</Label>
                                    </div>
                                ))}
                            </div>
                        )}

                        {step === 4 && (
                            <div className="space-y-6">
                                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800">
                                    <p className="font-semibold mb-1">Engagement de responsabilité</p>
                                    <p>En signant, vous certifiez être le responsable légal de cet établissement et acceptez les conditions d'utilisation de SchoolFlow PRO.</p>
                                </div>

                                <div className="space-y-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="directorName">Nom du Directeur / Responsable</Label>
                                        <Input
                                            id="directorName"
                                            value={directorName}
                                            onChange={(e) => setDirectorName(e.target.value)}
                                            placeholder="Ex: M. Jean Robert DUPONT"
                                        />
                                    </div>

                                    <div className="space-y-2">
                                        <Label>Signature manuscrite</Label>
                                        <SignaturePad
                                            onSave={setSignatureData}
                                            placeholder="Signez ici avec votre souris ou votre doigt"
                                            className="border rounded-md p-1"
                                        />
                                    </div>
                                </div>
                            </div>
                        )}
                    </CardContent>
                    <CardFooter className="flex justify-between">
                        <Button variant="ghost" disabled={step === 1} onClick={() => setStep(step - 1)}>
                            Retour
                        </Button>
                        <Button onClick={() => {
                            if (step === 1) handleIdentitySubmit();
                            if (step === 2) handleLevelsSubmit();
                            if (step === 3) handleSubjectsSubmit();
                            if (step === 4) handleSignatureSubmit();
                        }} disabled={isLoading}>
                            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {step === 4 ? "Terminer" : "Suivant"}
                        </Button>
                    </CardFooter>
                </Card>
            </div>
        </>
    );
}
