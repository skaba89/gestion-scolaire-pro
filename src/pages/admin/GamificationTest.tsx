import { useState } from "react";
import { useTenant } from "@/contexts/TenantContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Sparkles, Award, CheckCircle2, XCircle, Zap, TestTube } from "lucide-react";
import { triggerGamificationEvent } from "@/lib/gamification-rules-service";
import { motion } from "framer-motion";

/**
 * Page de test pour le système d'automatisation de la gamification
 * Permet de simuler des événements et vérifier que les règles fonctionnent
 */
export const GamificationTestPage = () => {
    const { tenant } = useTenant();
    const [isLoading, setIsLoading] = useState(false);
    const [lastResult, setLastResult] = useState<any>(null);

    // Form state
    const [eventType, setEventType] = useState("GRADE_ADDED");
    const [studentId, setStudentId] = useState("");
    const [score, setScore] = useState(18);
    const [consecutiveDays, setConsecutiveDays] = useState(30);

    const handleTestEvent = async () => {
        if (!tenant || !studentId) {
            toast.error("Veuillez remplir tous les champs requis");
            return;
        }

        setIsLoading(true);
        setLastResult(null);

        try {
            let eventData: any = {};

            switch (eventType) {
                case "GRADE_ADDED":
                    eventData = { score };
                    break;
                case "PERFECT_SCORE":
                    eventData = { score: 20 };
                    break;
                case "ATTENDANCE_PRESENT":
                    eventData = {};
                    break;
                case "ATTENDANCE_STREAK":
                    eventData = { consecutive_days: consecutiveDays };
                    break;
                case "HOMEWORK_SUBMITTED":
                    eventData = { on_time: true };
                    break;
                case "GRADE_IMPROVEMENT":
                    eventData = { score, improvement: 5 };
                    break;
            }

            const result = await triggerGamificationEvent({
                event_type: eventType,
                event_id: `test-${Date.now()}`,
                tenant_id: tenant.id,
                student_id: studentId,
                event_data: eventData,
            });

            setLastResult(result);

            if (result.rules_applied > 0) {
                toast.success(`✅ ${result.rules_applied} règle(s) appliquée(s) !`);
            } else {
                toast.info("Aucune règle ne correspond à cet événement");
            }
        } catch (error: any) {
            console.error("Error testing gamification:", error);
            toast.error("Erreur: " + error.message);
            setLastResult({ error: error.message });
        } finally {
            setIsLoading(false);
        }
    };

    const testScenarios = [
        {
            name: "Excellence Académique",
            description: "Note ≥ 18/20",
            eventType: "GRADE_ADDED",
            expectedReward: "+50 points",
            icon: "📝",
        },
        {
            name: "Perfectionniste",
            description: "Note = 20/20",
            eventType: "PERFECT_SCORE",
            expectedReward: "+100 points",
            icon: "🎯",
        },
        {
            name: "Présence Quotidienne",
            description: "Marquer présent",
            eventType: "ATTENDANCE_PRESENT",
            expectedReward: "+5 points",
            icon: "✅",
        },
        {
            name: "Assiduité Exemplaire",
            description: "30 jours consécutifs",
            eventType: "ATTENDANCE_STREAK",
            expectedReward: "Badge Assidu",
            icon: "🔥",
        },
        {
            name: "Devoir à Temps",
            description: "Rendu avant deadline",
            eventType: "HOMEWORK_SUBMITTED",
            expectedReward: "+10 points",
            icon: "📚",
        },
        {
            name: "Amélioration",
            description: "+5 points vs dernière note",
            eventType: "GRADE_IMPROVEMENT",
            expectedReward: "+25 points",
            icon: "📈",
        },
    ];

    return (
        <div className="container mx-auto p-6 space-y-6">
            <div className="flex items-center gap-3">
                <div className="p-3 rounded-xl bg-primary/10">
                    <TestTube className="h-6 w-6 text-primary" />
                </div>
                <div>
                    <h1 className="text-3xl font-bold">Test de Gamification</h1>
                    <p className="text-muted-foreground">
                        Simulez des événements pour tester les règles automatiques
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Formulaire de test */}
                <Card className="glass-card border-none shadow-premium">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Zap className="h-5 w-5 text-amber-500" />
                            Déclencher un Événement
                        </CardTitle>
                        <CardDescription>
                            Simulez un événement pour tester vos règles
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <Label>Type d'événement</Label>
                            <Select value={eventType} onValueChange={setEventType}>
                                <SelectTrigger className="rounded-xl">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="rounded-2xl">
                                    <SelectItem value="GRADE_ADDED" className="rounded-xl">
                                        📝 Note ajoutée
                                    </SelectItem>
                                    <SelectItem value="PERFECT_SCORE" className="rounded-xl">
                                        🎯 Note parfaite (20/20)
                                    </SelectItem>
                                    <SelectItem value="ATTENDANCE_PRESENT" className="rounded-xl">
                                        ✅ Présence
                                    </SelectItem>
                                    <SelectItem value="ATTENDANCE_STREAK" className="rounded-xl">
                                        🔥 Série de présences
                                    </SelectItem>
                                    <SelectItem value="HOMEWORK_SUBMITTED" className="rounded-xl">
                                        📚 Devoir rendu
                                    </SelectItem>
                                    <SelectItem value="GRADE_IMPROVEMENT" className="rounded-xl">
                                        📈 Amélioration de note
                                    </SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <Label>ID de l'étudiant</Label>
                            <Input
                                value={studentId}
                                onChange={(e) => setStudentId(e.target.value)}
                                placeholder="UUID de l'étudiant"
                                className="rounded-xl font-mono text-sm"
                            />
                            <p className="text-xs text-muted-foreground">
                                Utilisez l'ID d'un étudiant existant dans votre base
                            </p>
                        </div>

                        {(eventType === "GRADE_ADDED" || eventType === "GRADE_IMPROVEMENT") && (
                            <div className="space-y-2">
                                <Label>Note (sur 20)</Label>
                                <Input
                                    type="number"
                                    min="0"
                                    max="20"
                                    value={score}
                                    onChange={(e) => setScore(parseInt(e.target.value) || 0)}
                                    className="rounded-xl"
                                />
                            </div>
                        )}

                        {eventType === "ATTENDANCE_STREAK" && (
                            <div className="space-y-2">
                                <Label>Jours consécutifs</Label>
                                <Input
                                    type="number"
                                    min="1"
                                    value={consecutiveDays}
                                    onChange={(e) => setConsecutiveDays(parseInt(e.target.value) || 1)}
                                    className="rounded-xl"
                                />
                            </div>
                        )}

                        <Button
                            onClick={handleTestEvent}
                            disabled={isLoading || !studentId}
                            className="w-full rounded-xl shadow-premium"
                        >
                            {isLoading ? (
                                <>
                                    <Sparkles className="h-4 w-4 mr-2 animate-spin" />
                                    Test en cours...
                                </>
                            ) : (
                                <>
                                    <Zap className="h-4 w-4 mr-2" />
                                    Déclencher l'événement
                                </>
                            )}
                        </Button>
                    </CardContent>
                </Card>

                {/* Résultats */}
                <Card className="glass-card border-none shadow-premium">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            {lastResult ? (
                                lastResult.error ? (
                                    <XCircle className="h-5 w-5 text-destructive" />
                                ) : (
                                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                                )
                            ) : (
                                <Sparkles className="h-5 w-5 text-muted-foreground" />
                            )}
                            Résultat du Test
                        </CardTitle>
                        <CardDescription>
                            Détails de l'exécution des règles
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        {!lastResult ? (
                            <div className="text-center py-12 text-muted-foreground">
                                <Sparkles className="h-12 w-12 mx-auto mb-3 opacity-20" />
                                <p>Aucun test exécuté</p>
                                <p className="text-sm mt-1">Déclenchez un événement pour voir les résultats</p>
                            </div>
                        ) : lastResult.error ? (
                            <Alert variant="destructive" className="rounded-xl">
                                <AlertDescription>
                                    <strong>Erreur :</strong> {lastResult.error}
                                </AlertDescription>
                            </Alert>
                        ) : (
                            <div className="space-y-4">
                                <div className="flex items-center justify-between p-4 bg-primary/5 rounded-xl">
                                    <span className="font-semibold">Règles appliquées</span>
                                    <Badge variant="secondary" className="text-lg px-3 py-1 rounded-lg">
                                        {lastResult.rules_applied}
                                    </Badge>
                                </div>

                                {lastResult.details && lastResult.details.length > 0 && (
                                    <div className="space-y-2">
                                        <h4 className="font-semibold text-sm text-muted-foreground">Détails :</h4>
                                        {lastResult.details.map((detail: any, index: number) => (
                                            <motion.div
                                                key={index}
                                                initial={{ opacity: 0, x: -10 }}
                                                animate={{ opacity: 1, x: 0 }}
                                                transition={{ delay: index * 0.1 }}
                                                className="p-3 bg-muted/50 rounded-xl"
                                            >
                                                <div className="flex items-center justify-between">
                                                    <span className="font-medium">{detail.rule_name}</span>
                                                    {detail.reward_type === "POINTS" ? (
                                                        <div className="flex items-center gap-1 text-amber-600">
                                                            <Sparkles className="h-4 w-4" />
                                                            <span className="font-bold">+{detail.reward_value} pts</span>
                                                        </div>
                                                    ) : (
                                                        <div className="flex items-center gap-1 text-purple-600">
                                                            <Award className="h-4 w-4" />
                                                            <span className="font-bold">Badge</span>
                                                        </div>
                                                    )}
                                                </div>
                                            </motion.div>
                                        ))}
                                    </div>
                                )}

                                {lastResult.rules_applied === 0 && (
                                    <Alert className="rounded-xl bg-amber-50 border-amber-200">
                                        <AlertDescription className="text-amber-800">
                                            Aucune règle ne correspond aux conditions de cet événement.
                                            Vérifiez vos règles dans l'onglet "Règles Auto".
                                        </AlertDescription>
                                    </Alert>
                                )}
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* Scénarios de test suggérés */}
            <Card className="glass-card border-none shadow-premium">
                <CardHeader>
                    <CardTitle>Scénarios de Test Suggérés</CardTitle>
                    <CardDescription>
                        Testez ces scénarios pour vérifier que vos règles par défaut fonctionnent
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {testScenarios.map((scenario, index) => (
                            <motion.div
                                key={index}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: index * 0.05 }}
                                className="p-4 border border-primary/10 rounded-xl hover:bg-primary/5 transition-colors cursor-pointer"
                                onClick={() => setEventType(scenario.eventType)}
                            >
                                <div className="text-2xl mb-2">{scenario.icon}</div>
                                <h4 className="font-bold mb-1">{scenario.name}</h4>
                                <p className="text-sm text-muted-foreground mb-2">{scenario.description}</p>
                                <Badge variant="outline" className="rounded-lg">
                                    {scenario.expectedReward}
                                </Badge>
                            </motion.div>
                        ))}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
};
