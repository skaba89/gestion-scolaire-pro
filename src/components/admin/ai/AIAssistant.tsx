import { useState } from "react";
import { useAIStream } from "@/hooks/useAIStream";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Bot, Trash2, Send, Sparkles, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { toast } from "sonner";
import { useTenant } from "@/contexts/TenantContext";
import type { SchoolKpis, StudentRisk } from "@/types/ai";
import { useStudentLabel } from "@/hooks/useStudentLabel";
import { useTranslation } from "react-i18next";

interface AIAssistantProps {
    studentRisks: StudentRisk[];
    kpis: SchoolKpis;
}

/** Contexte transmis au modèle : uniquement des chiffres réellement fournis
 * par l'API ; une donnée absente est déclarée « non disponible », jamais 0. */
function buildSchoolContext(studentRisks: StudentRisk[], kpis: SchoolKpis): string {
    const na = "non disponible";
    return `
Données de l'établissement:
- Nombre total d'étudiants inscrits: ${kpis.totalStudents ?? na}
- Étudiants à risque élevé: ${studentRisks.filter(s => s.riskLevel === "high").length}
- Moyenne générale: ${kpis.averageGrade === null ? na : `${kpis.averageGrade.toFixed(1)}/20`}
- Taux de présence global: ${kpis.attendanceRate === null ? na : `${Math.round(kpis.attendanceRate)} %`}
- Taux de réussite (notes ≥ moitié du barème): ${kpis.successRate === null ? na : `${Math.round(kpis.successRate)} %`}
N'invente aucun chiffre absent de cette liste.
    `;
}

export function AIAssistant({ studentRisks, kpis }: AIAssistantProps) {
    const { t } = useTranslation();
    const { tenant } = useTenant();
    const { studentsLabel } = useStudentLabel();
    const [aiQuestion, setAiQuestion] = useState("");

    const { messages: aiMessages, isStreaming, sendMessage: sendAIMessage, clearHistory } = useAIStream({
        onError: (error) => toast.error(error),
    });

    const handleAskAI = () => {
        if (!aiQuestion.trim() || isStreaming) return;

        const context = buildSchoolContext(studentRisks, kpis);

        sendAIMessage(aiQuestion, {
            tenantId: tenant?.id,
            tenantName: tenant?.name,
            language: "fr",
            systemContext: `En tant qu'expert en éducation et analyse de données scolaires, réponds à cette question basée sur les données suivantes:\n${context}\nRéponds en ${t("aiInsights.assistant.language")}.`,
        });

        setAiQuestion("");
    };

    const handleQuickAIAction = (question: string) => {
        setAiQuestion(question);
        // We set the question in the input but maybe we want to send it directly?
        // Let's send it directly for "Quick Action" feel.

        // Wait a microtask to let state update if we were relying on it, but here we pass value directly.
        // Re-using logic from handleAskAI but with param.
        const context = buildSchoolContext(studentRisks, kpis);

        sendAIMessage(question, {
            tenantId: tenant?.id,
            tenantName: tenant?.name,
            language: "fr",
            systemContext: `En tant qu'expert en éducation et analyse de données scolaires, réponds à cette question basée sur les données suivantes:\n${context}\nRéponds en ${t("aiInsights.assistant.language")}.`,
        });
        setAiQuestion("");
    };


    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between">
                <div>
                    <CardTitle className="flex items-center gap-2">
                        <Sparkles className="h-5 w-5 text-primary" />
                        {t("aiInsights.assistant.title")}
                    </CardTitle>
                    <CardDescription>
                        {t("aiInsights.assistant.subtitle")}
                    </CardDescription>
                </div>
                {aiMessages.length > 0 && (
                    <Button variant="outline" size="sm" onClick={clearHistory}>
                        <Trash2 className="h-4 w-4 mr-2" />
                        {t("aiInsights.assistant.clear")}
                    </Button>
                )}
            </CardHeader>
            <CardContent className="space-y-4">
                {/* Conversation History */}
                {aiMessages.length > 0 && (
                    <ScrollArea className="h-[300px] border rounded-lg p-4">
                        <div className="space-y-4">
                            {aiMessages.map((msg, idx) => (
                                <div
                                    key={idx}
                                    className={`flex gap-3 ${msg.role === "user" ? "justify-end" : ""}`}
                                >
                                    {msg.role === "assistant" && (
                                        <div className="p-2 bg-primary/10 rounded-full h-fit">
                                            <Bot className="h-4 w-4 text-primary" />
                                        </div>
                                    )}
                                    <div
                                        className={`max-w-[80%] p-3 rounded-lg ${msg.role === "user"
                                            ? "bg-primary text-primary-foreground"
                                            : "bg-muted"
                                            }`}
                                    >
                                        <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                                        <p className="text-xs opacity-60 mt-1">
                                            {format(msg.timestamp, "HH:mm", { locale: fr })}
                                        </p>
                                    </div>
                                </div>
                            ))}
                            {isStreaming && (
                                <div className="flex gap-3">
                                    <div className="p-2 bg-primary/10 rounded-full h-fit">
                                        <Bot className="h-4 w-4 text-primary" />
                                    </div>
                                    <div className="bg-muted p-3 rounded-lg flex items-center">
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                    </div>
                                </div>
                            )}
                        </div>
                    </ScrollArea>
                )}

                {/* Empty State / Suggestions */}
                {aiMessages.length === 0 && (
                    <div className="text-center py-8 text-muted-foreground border rounded-lg border-dashed">
                        <Bot className="h-12 w-12 mx-auto mb-3 opacity-20" />
                        <p className="mb-4">{t("aiInsights.assistant.intro")}</p>
                        <div className="flex flex-wrap justify-center gap-2 px-4">
                            <Button variant="outline" size="sm" onClick={() => handleQuickAIAction(t("aiInsights.assistant.q1"))}>
                                {t("aiInsights.assistant.q1Label")}
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => handleQuickAIAction(t("aiInsights.assistant.q2"))}>
                                {t("aiInsights.assistant.q2Label")}
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => handleQuickAIAction(t("aiInsights.assistant.q3", { label: studentsLabel }))}>
                                {t("aiInsights.assistant.q3Label")}
                            </Button>
                        </div>
                    </div>
                )}

                {/* Input Area */}
                <div className="flex gap-2">
                    <Input
                        placeholder={t("aiInsights.assistant.placeholder")}
                        value={aiQuestion}
                        onChange={(e) => setAiQuestion(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleAskAI()}
                        disabled={isStreaming}
                    />
                    <Button onClick={handleAskAI} disabled={!aiQuestion.trim() || isStreaming}>
                        {isStreaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}
