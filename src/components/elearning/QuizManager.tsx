import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "sonner";
import { Plus, Trash2, GraduationCap, CheckCircle, XCircle, HelpCircle } from "lucide-react";

interface QuizManagerProps {
  quizId: string;
  quizTitle: string;
}

export function QuizManager({ quizId, quizTitle }: QuizManagerProps) {
  const { tenant } = useTenant();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);

  const [questionForm, setQuestionForm] = useState({
    question_text: "",
    question_type: "multiple_choice",
    options: ["", "", "", ""],
    correct_answer: "0",
    points: "1",
    explanation: "",
  });

  interface QuizQuestion {
    id: string;
    quiz_id: string;
    tenant_id: string;
    question_text: string;
    question_type: string;
    options: string[];
    correct_answer: string;
    points: number;
    order_index: number;
    explanation: string | null;
    created_at: string;
  }

  // Fetch questions
  const { data: questions = [] } = useQuery({
    queryKey: ["quiz-questions", quizId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quiz_questions")
        .select("*")
        .eq("quiz_id", quizId)
        .order("order_index");
      if (error) throw error;
      return data as unknown as QuizQuestion[];
    },
    enabled: !!quizId,
  });

  // Create question mutation
  const createQuestionMutation = useMutation({
    mutationFn: async (data: typeof questionForm) => {
      const { error } = await supabase.from("quiz_questions").insert({
        tenant_id: tenant!.id,
        quiz_id: quizId,
        question_text: data.question_text,
        question_type: data.question_type,
        options: data.options.filter((o) => o.trim()),
        correct_answer: data.correct_answer,
        points: parseInt(data.points) || 1,
        explanation: data.explanation || null,
        order_index: questions.length,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["quiz-questions"] });
      toast.success("Question ajoutée");
      setDialogOpen(false);
      resetForm();
    },
    onError: () => toast.error("Erreur lors de l'ajout"),
  });

  // Delete question mutation
  const deleteQuestionMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("quiz_questions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["quiz-questions"] });
      toast.success("Question supprimée");
    },
  });

  const resetForm = () => {
    setQuestionForm({
      question_text: "",
      question_type: "multiple_choice",
      options: ["", "", "", ""],
      correct_answer: "0",
      points: "1",
      explanation: "",
    });
  };

  const updateOption = (index: number, value: string) => {
    const newOptions = [...questionForm.options];
    newOptions[index] = value;
    setQuestionForm({ ...questionForm, options: newOptions });
  };

  const totalPoints = questions.reduce((sum, q) => sum + (q.points || 1), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <GraduationCap className="h-5 w-5" />
            {quizTitle}
          </h3>
          <p className="text-sm text-muted-foreground">
            {questions.length} question{questions.length !== 1 ? "s" : ""} • {totalPoints} points
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="mr-2 h-4 w-4" />
              Ajouter une question
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Nouvelle question</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Question *</Label>
                <Textarea
                  value={questionForm.question_text}
                  onChange={(e) => setQuestionForm({ ...questionForm, question_text: e.target.value })}
                  placeholder="Entrez votre question..."
                  rows={3}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Type</Label>
                  <Select
                    value={questionForm.question_type}
                    onValueChange={(v) => setQuestionForm({ ...questionForm, question_type: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="multiple_choice">Choix multiple</SelectItem>
                      <SelectItem value="true_false">Vrai/Faux</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Points</Label>
                  <Input
                    type="number"
                    value={questionForm.points}
                    onChange={(e) => setQuestionForm({ ...questionForm, points: e.target.value })}
                    min="1"
                  />
                </div>
              </div>

              {questionForm.question_type === "multiple_choice" && (
                <div className="space-y-3">
                  <Label>Options (cochez la bonne réponse)</Label>
                  <RadioGroup
                    value={questionForm.correct_answer}
                    onValueChange={(v) => setQuestionForm({ ...questionForm, correct_answer: v })}
                  >
                    {questionForm.options.map((option, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <RadioGroupItem value={idx.toString()} id={`option-${idx}`} />
                        <Input
                          value={option}
                          onChange={(e) => updateOption(idx, e.target.value)}
                          placeholder={`Option ${idx + 1}`}
                          className="flex-1"
                        />
                      </div>
                    ))}
                  </RadioGroup>
                </div>
              )}

              {questionForm.question_type === "true_false" && (
                <div>
                  <Label>Bonne réponse</Label>
                  <RadioGroup
                    value={questionForm.correct_answer}
                    onValueChange={(v) => setQuestionForm({ ...questionForm, correct_answer: v })}
                    className="flex gap-4"
                  >
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="true" id="true" />
                      <Label htmlFor="true">Vrai</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="false" id="false" />
                      <Label htmlFor="false">Faux</Label>
                    </div>
                  </RadioGroup>
                </div>
              )}

              <div>
                <Label>Explication (optionnel)</Label>
                <Textarea
                  value={questionForm.explanation}
                  onChange={(e) => setQuestionForm({ ...questionForm, explanation: e.target.value })}
                  placeholder="Explication de la bonne réponse..."
                  rows={2}
                />
              </div>

              <Button
                className="w-full"
                onClick={() => createQuestionMutation.mutate(questionForm)}
                disabled={!questionForm.question_text || createQuestionMutation.isPending}
              >
                Ajouter la question
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="space-y-3">
        {questions.map((question, idx) => (
          <Card key={question.id}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <Badge variant="outline" className="text-xs">
                      Q{idx + 1}
                    </Badge>
                    <Badge variant="secondary" className="text-xs">
                      {question.points} pt{question.points !== 1 ? "s" : ""}
                    </Badge>
                    {question.question_type === "true_false" && (
                      <Badge variant="outline" className="text-xs">Vrai/Faux</Badge>
                    )}
                  </div>
                  <p className="font-medium mb-3">{question.question_text}</p>
                  
                  {question.question_type === "multiple_choice" && question.options && (
                    <div className="space-y-1 ml-4">
                      {(question.options as string[]).map((opt, optIdx) => (
                        <div key={optIdx} className="flex items-center gap-2 text-sm">
                          {optIdx.toString() === question.correct_answer ? (
                            <CheckCircle className="h-4 w-4 text-green-600" />
                          ) : (
                            <XCircle className="h-4 w-4 text-muted-foreground" />
                          )}
                          <span className={optIdx.toString() === question.correct_answer ? "text-green-600 font-medium" : ""}>
                            {opt}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {question.question_type === "true_false" && (
                    <p className="text-sm ml-4 flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-green-600" />
                      Réponse: <span className="font-medium">{question.correct_answer === "true" ? "Vrai" : "Faux"}</span>
                    </p>
                  )}

                  {question.explanation && (
                    <p className="text-sm text-muted-foreground mt-2 ml-4 flex items-start gap-2">
                      <HelpCircle className="h-4 w-4 mt-0.5" />
                      {question.explanation}
                    </p>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-destructive"
                  onClick={() => deleteQuestionMutation.mutate(question.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}

        {questions.length === 0 && (
          <Card className="border-dashed">
            <CardContent className="py-8 text-center">
              <HelpCircle className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
              <p className="text-muted-foreground">Aucune question. Ajoutez votre première question.</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
