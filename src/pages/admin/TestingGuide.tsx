import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import {
  CheckCircle2,
  Circle,
  BookOpen,
  Users,
  GraduationCap,
  Calendar,
  ClipboardList,
  CreditCard,
  MessageSquare,
  Bell,
  Settings,
  Building2,
  Layers,
  BookMarked,
  UserCheck,
  FileText,
  Award,
  BarChart3
} from "lucide-react";

interface TestStep {
  id: string;
  title: string;
  description: string;
  details: string[];
  expectedResult: string;
}

interface TestSection {
  id: string;
  title: string;
  icon: React.ReactNode;
  priority: "critical" | "high" | "medium";
  estimatedTime: string;
  steps: TestStep[];
}

import { useStudentLabel } from "@/hooks/useStudentLabel";
import { useMemo } from "react";

const getTestSections = (
  studentLabel: string,
  studentsLabel: string,
  StudentLabel: string,
  StudentsLabel: string
): TestSection[] => [
    {
      id: "setup",
      title: "Configuration initiale",
      icon: <Settings className="h-5 w-5" />,
      priority: "critical",
      estimatedTime: "15 min",
      steps: [
        {
          id: "setup-1",
          title: "Créer un établissement (Tenant)",
          description: "Accédez à la gestion des établissements et créez votre premier tenant",
          details: [
            "Menu: Super Admin → Établissements",
            "Cliquez sur 'Nouvel établissement'",
            "Remplissez: Nom, Slug (ex: ecole-test), Type (Primaire/Collège/Lycée)",
            "Activez l'établissement"
          ],
          expectedResult: "L'établissement apparaît dans la liste avec son slug unique"
        },
        {
          id: "setup-2",
          title: "Configurer l'année académique",
          description: "Créez l'année scolaire en cours",
          details: [
            "Menu: Admin → Années académiques",
            "Cliquez sur 'Nouvelle année'",
            "Entrez: 2024-2025, dates de début/fin",
            "Cochez 'Année courante'"
          ],
          expectedResult: "L'année 2024-2025 est marquée comme active"
        },
        {
          id: "setup-3",
          title: "Créer les trimestres/semestres",
          description: "Définissez les périodes d'évaluation",
          details: [
            "Menu: Admin → Trimestres",
            "Créez 3 trimestres (ou 2 semestres)",
            "Définissez les dates pour chaque période",
            "Marquez le trimestre actuel"
          ],
          expectedResult: "Les périodes sont visibles dans le calendrier académique"
        }
      ]
    },
    {
      id: "structure",
      title: "Structure académique",
      icon: <Building2 className="h-5 w-5" />,
      priority: "critical",
      estimatedTime: "20 min",
      steps: [
        {
          id: "structure-1",
          title: "Créer les niveaux",
          description: "Définissez les niveaux scolaires (auto-générés selon le type d'établissement)",
          details: [
            "Menu: Admin → Niveaux",
            "Vérifiez les niveaux auto-créés (CP, CE1, CE2...)",
            "Ajoutez des niveaux personnalisés si nécessaire",
            "Définissez l'ordre d'affichage"
          ],
          expectedResult: "Tous les niveaux de votre établissement sont listés"
        },
        {
          id: "structure-2",
          title: "Créer les classes",
          description: "Créez au moins 2 classes pour tester",
          details: [
            "Menu: Admin → Classes",
            "Créez 'CP-A' associée au niveau CP",
            "Créez 'CP-B' associée au niveau CP",
            `Définissez la capacité (ex: 30 ${studentsLabel})`
          ],
          expectedResult: "Les classes apparaissent avec leur niveau associé"
        },
        {
          id: "structure-3",
          title: "Créer les matières",
          description: "Définissez les matières enseignées",
          details: [
            "Menu: Admin → Matières",
            "Vérifiez les matières auto-créées",
            "Ajoutez: Mathématiques (coef: 4), Français (coef: 4)",
            "Ajoutez: Histoire-Géo (coef: 2), Sciences (coef: 2)"
          ],
          expectedResult: "Les matières sont listées avec leurs coefficients"
        }
      ]
    },
    {
      id: "users",
      title: "Utilisateurs",
      icon: <Users className="h-5 w-5" />,
      priority: "critical",
      estimatedTime: "25 min",
      steps: [
        {
          id: "users-1",
          title: "Créer un compte enseignant",
          description: "Ajoutez un enseignant avec ses affectations",
          details: [
            "Menu: Admin → Utilisateurs → Nouveau",
            "Email: enseignant.test@example.com",
            "Rôle: TEACHER",
            "Complétez nom, prénom",
            "Affectez aux matières et classes"
          ],
          expectedResult: "L'enseignant peut se connecter et voir ses classes"
        },
        {
          id: "users-2",
          title: "Créer un compte parent",
          description: "Ajoutez un parent pour tester le portail famille",
          details: [
            "Menu: Admin → Utilisateurs → Nouveau",
            "Email: parent.test@example.com",
            "Rôle: PARENT",
            "Complétez les informations",
            `(Le lien avec l'${studentLabel} sera fait à l'étape suivante)`
          ],
          expectedResult: "Le parent peut se connecter au portail famille"
        },
        {
          id: "users-3",
          title: `Créer un ${studentLabel} avec compte`,
          description: `Inscrivez un ${studentLabel} et liez-le au parent`,
          details: [
            `Menu: Admin → ${StudentsLabel} → Nouveau`,
            "Remplissez: Nom, prénom, date de naissance",
            "Sélectionnez la classe CP-A",
            "Onglet 'Parents liés': associez le parent créé",
            "Activez 'Créer un compte automatiquement'"
          ],
          expectedResult: `L'${studentLabel} est inscrit et visible par le parent`
        },
        {
          id: "users-4",
          title: `Créer 3 ${studentsLabel} supplémentaires`,
          description: `Ajoutez des ${studentsLabel} pour tester les fonctionnalités de groupe`,
          details: [
            `Répétez le processus pour 3 ${studentsLabel}`,
            "Variez les classes (CP-A et CP-B)",
            "Utilisez des noms distinctifs pour les tests",
            "Optionnel: testez l'import CSV"
          ],
          expectedResult: `4 ${studentsLabel} minimum dans le système`
        }
      ]
    },
    {
      id: "schedule",
      title: "Emploi du temps",
      icon: <Calendar className="h-5 w-5" />,
      priority: "high",
      estimatedTime: "15 min",
      steps: [
        {
          id: "schedule-1",
          title: "Générer l'emploi du temps automatique",
          description: "Utilisez le générateur automatique",
          details: [
            "Menu: Admin → Emploi du temps",
            "Sélectionnez la classe CP-A",
            "Cliquez sur 'Générer automatiquement'",
            "Choisissez les jours (Lun-Ven)",
            "Validez la génération"
          ],
          expectedResult: "L'emploi du temps est généré avec les matières distribuées"
        },
        {
          id: "schedule-2",
          title: "Ajuster manuellement si nécessaire",
          description: "Modifiez les créneaux générés",
          details: [
            "Cliquez sur un créneau pour le modifier",
            "Changez l'enseignant ou la matière",
            "Ajoutez des créneaux spéciaux (sport, arts)"
          ],
          expectedResult: "L'emploi du temps reflète l'organisation réelle"
        }
      ]
    },
    {
      id: "attendance",
      title: "Présences",
      icon: <UserCheck className="h-5 w-5" />,
      priority: "high",
      estimatedTime: "10 min",
      steps: [
        {
          id: "attendance-1",
          title: "Faire l'appel quotidien",
          description: "Testez la prise de présence",
          details: [
            "Connectez-vous en tant qu'enseignant",
            "Menu: Enseignant → Présences",
            "Sélectionnez une classe et la date du jour",
            "Marquez: 1 présent, 1 absent, 1 retard",
            "Ajoutez une note pour l'absent"
          ],
          expectedResult: "Les statistiques de présence sont mises à jour"
        },
        {
          id: "attendance-2",
          title: "Vérifier les alertes parents",
          description: "Testez les notifications d'absence",
          details: [
            "Connectez-vous en tant que parent",
            "Vérifiez les notifications reçues",
            "L'absence doit être visible dans le tableau de bord"
          ],
          expectedResult: "Le parent voit l'absence de son enfant"
        }
      ]
    },
    {
      id: "grades",
      title: "Notes et évaluations",
      icon: <Award className="h-5 w-5" />,
      priority: "high",
      estimatedTime: "20 min",
      steps: [
        {
          id: "grades-1",
          title: "Créer une évaluation",
          description: "Ajoutez un contrôle",
          details: [
            "Connectez-vous en tant qu'enseignant",
            "Menu: Enseignant → Notes",
            "Créez: 'Contrôle Maths - Chapitre 1'",
            "Type: Devoir, Note max: 20, Coefficient: 1",
            "Sélectionnez la classe et le trimestre"
          ],
          expectedResult: "L'évaluation apparaît dans la liste"
        },
        {
          id: "grades-2",
          title: "Saisir les notes",
          description: `Entrez les notes pour chaque ${studentLabel}`,
          details: [
            "Ouvrez l'évaluation créée",
            `Saisissez: ${StudentLabel} 1: 15/20, ${StudentLabel} 2: 12/20`,
            `${StudentLabel} 3: 8/20, ${StudentLabel} 4: 18/20`,
            "Ajoutez des appréciations"
          ],
          expectedResult: "La moyenne de classe est calculée automatiquement"
        },
        {
          id: "grades-3",
          title: "Vérifier côté parent",
          description: "Consultez les notes depuis le portail famille",
          details: [
            "Connectez-vous en tant que parent",
            "Menu: Parent → Notes",
            "Vérifiez que la note est visible",
            "Consultez l'évolution graphique"
          ],
          expectedResult: "Les notes sont accessibles avec les statistiques"
        }
      ]
    },
    {
      id: "homework",
      title: "Devoirs",
      icon: <BookMarked className="h-5 w-5" />,
      priority: "medium",
      estimatedTime: "15 min",
      steps: [
        {
          id: "homework-1",
          title: "Créer un devoir",
          description: "Assignez un devoir à une classe",
          details: [
            "Connectez-vous en tant qu'enseignant",
            "Menu: Enseignant → Devoirs → Nouveau",
            "Titre: 'Exercices page 42'",
            "Date limite: dans 3 jours",
            "Sélectionnez la classe et la matière"
          ],
          expectedResult: "Le devoir apparaît dans le calendrier"
        },
        {
          id: "homework-2",
          title: `Soumettre un devoir (${studentLabel})`,
          description: `Testez la soumission côté ${studentLabel}`,
          details: [
            `Connectez-vous en tant qu'${studentLabel}`,
            `Menu: ${StudentLabel} → Devoirs`,
            "Ouvrez le devoir assigné",
            "Joignez un fichier ou écrivez une réponse",
            "Soumettez"
          ],
          expectedResult: "Le statut passe à 'Soumis'"
        },
        {
          id: "homework-3",
          title: "Corriger le devoir",
          description: "Notez la soumission",
          details: [
            "Connectez-vous en tant qu'enseignant",
            "Ouvrez le devoir",
            `Consultez la soumission de l'${studentLabel}`,
            "Attribuez une note et un commentaire"
          ],
          expectedResult: `L'${studentLabel} et le parent voient la note`
        }
      ]
    },
    {
      id: "finances",
      title: "Finances et facturation",
      icon: <CreditCard className="h-5 w-5" />,
      priority: "high",
      estimatedTime: "20 min",
      steps: [
        {
          id: "finances-1",
          title: "Créer une facture",
          description: `Générez une facture pour un ${studentLabel}`,
          details: [
            "Menu: Admin → Finances → Factures",
            "Cliquez sur 'Nouvelle facture'",
            `Sélectionnez un ${studentLabel}`,
            "Ajoutez: Frais de scolarité - 150 000 XAF",
            "Date d'échéance: fin du mois"
          ],
          expectedResult: "La facture est créée avec le numéro auto-généré"
        },
        {
          id: "finances-2",
          title: "Envoyer la facture par email",
          description: "Testez l'envoi de facture",
          details: [
            "Ouvrez la facture créée",
            "Cliquez sur 'Envoyer par email'",
            "Vérifiez que le parent reçoit l'email"
          ],
          expectedResult: "Email reçu avec le PDF en pièce jointe"
        },
        {
          id: "finances-3",
          title: "Enregistrer un paiement",
          description: "Marquez la facture comme payée",
          details: [
            "Ouvrez la facture",
            "Cliquez sur 'Enregistrer un paiement'",
            "Montant: paiement partiel ou total",
            "Mode: Espèces/Mobile Money/Virement"
          ],
          expectedResult: "Le statut de la facture est mis à jour"
        },
        {
          id: "finances-4",
          title: "Consulter les statistiques",
          description: "Vérifiez le tableau de bord financier",
          details: [
            "Menu: Admin → Finances",
            "Consultez: Total facturé, Encaissé, Impayé",
            "Vérifiez les graphiques d'évolution"
          ],
          expectedResult: "Les montants correspondent aux opérations effectuées"
        }
      ]
    },
    {
      id: "messaging",
      title: "Messagerie",
      icon: <MessageSquare className="h-5 w-5" />,
      priority: "medium",
      estimatedTime: "10 min",
      steps: [
        {
          id: "messaging-1",
          title: "Envoyer un message admin → parent",
          description: "Testez la communication institutionnelle",
          details: [
            "Menu: Admin → Messages",
            "Nouveau message",
            "Destinataire: le parent de test",
            "Objet: 'Réunion parents-profs'",
            "Envoyez"
          ],
          expectedResult: "Le parent reçoit le message et une notification"
        },
        {
          id: "messaging-2",
          title: "Répondre au message (parent)",
          description: "Testez la réponse",
          details: [
            "Connectez-vous en tant que parent",
            "Ouvrez le message reçu",
            "Répondez au message"
          ],
          expectedResult: "L'admin reçoit la réponse"
        },
        {
          id: "messaging-3",
          title: "Message enseignant → classe",
          description: "Communication groupée",
          details: [
            "Connectez-vous en tant qu'enseignant",
            "Envoyez un message à toute la classe",
            `Vérifiez la réception côté ${studentLabel}/parent`
          ],
          expectedResult: "Tous les destinataires reçoivent le message"
        }
      ]
    },
    {
      id: "reports",
      title: "Bulletins",
      icon: <FileText className="h-5 w-5" />,
      priority: "high",
      estimatedTime: "15 min",
      steps: [
        {
          id: "reports-1",
          title: "Générer un bulletin",
          description: `Créez le bulletin d'un ${studentLabel}`,
          details: [
            "Menu: Admin → Bulletins",
            `Sélectionnez: Classe, Trimestre, ${StudentLabel}`,
            "Cliquez sur 'Générer le bulletin'",
            "Vérifiez les notes et moyennes"
          ],
          expectedResult: "Le bulletin PDF est généré avec toutes les notes"
        },
        {
          id: "reports-2",
          title: "Ajouter les appréciations",
          description: "Complétez le bulletin",
          details: [
            "Ajoutez l'appréciation générale",
            "Signature du directeur",
            "Régénérez le bulletin"
          ],
          expectedResult: "Le bulletin final est prêt à être imprimé/envoyé"
        }
      ]
    },
    {
      id: "analytics",
      title: "Tableaux de bord et analytics",
      icon: <BarChart3 className="h-5 w-5" />,
      priority: "medium",
      estimatedTime: "10 min",
      steps: [
        {
          id: "analytics-1",
          title: "Dashboard Admin",
          description: "Vérifiez les statistiques globales",
          details: [
            "Menu: Admin → Tableau de bord",
            `Vérifiez: Nombre d'${studentsLabel}, enseignants`,
            "Consultez les graphiques d'assiduité",
            "Vérifiez les alertes actives"
          ],
          expectedResult: "Toutes les données de test sont reflétées"
        },
        {
          id: "analytics-2",
          title: "Dashboard Parent",
          description: "Consultez les analytics enfant",
          details: [
            "Connectez-vous en tant que parent",
            "Menu: Parent → Analytics",
            "Vérifiez: Performance, assiduité, devoirs",
            "Consultez les recommandations IA"
          ],
          expectedResult: "Les graphiques montrent les données saisies"
        },
        {
          id: "analytics-3",
          title: "Insights IA",
          description: "Testez les analyses intelligentes",
          details: [
            "Menu: Admin → Insights IA",
            "Consultez les recommandations générées",
            "Vérifiez les alertes précoces"
          ],
          expectedResult: "L'IA génère des insights basés sur les données"
        }
      ]
    }
  ];

export default function TestingGuide() {
  const { t } = useTranslation();
  const { studentLabel, studentsLabel, StudentLabel, StudentsLabel } = useStudentLabel();

  const testSections = useMemo(() => getTestSections(
    studentLabel,
    studentsLabel,
    StudentLabel,
    StudentsLabel
  ), [studentLabel, studentsLabel, StudentLabel, StudentsLabel]);

  const [completedSteps, setCompletedSteps] = useState<Set<string>>(new Set());
  const [expandedSections, setExpandedSections] = useState<string[]>(["setup"]);

  const toggleStep = (stepId: string) => {
    const newCompleted = new Set(completedSteps);
    if (newCompleted.has(stepId)) {
      newCompleted.delete(stepId);
    } else {
      newCompleted.add(stepId);
    }
    setCompletedSteps(newCompleted);
  };

  const totalSteps = testSections.reduce((acc, section) => acc + section.steps.length, 0);
  const completedCount = completedSteps.size;
  const progressPercentage = Math.round((completedCount / totalSteps) * 100);

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "critical": return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400";
      case "high": return "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400";
      case "medium": return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400";
      default: return "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400";
    }
  };

  const getSectionProgress = (section: TestSection) => {
    const completed = section.steps.filter(step => completedSteps.has(step.id)).length;
    return { completed, total: section.steps.length };
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <BookOpen className="h-8 w-8 text-primary" />
            Guide de test complet
          </h1>
          <p className="text-muted-foreground mt-1">
            Suivez ce guide pour tester toutes les fonctionnalités de l'application
          </p>
        </div>

        <Card className="p-4 min-w-[200px]">
          <div className="text-center">
            <div className="text-3xl font-bold text-primary">{progressPercentage}%</div>
            <Progress value={progressPercentage} className="mt-2" />
            <p className="text-sm text-muted-foreground mt-1">
              {completedCount}/{totalSteps} étapes complétées
            </p>
          </div>
        </Card>
      </div>

      <Card className="p-4 bg-muted/50">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-primary/10 rounded-lg">
            <GraduationCap className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold">Ordre recommandé</h3>
            <p className="text-sm text-muted-foreground">
              Suivez les sections dans l'ordre pour éviter les erreurs de dépendances.
              Les sections marquées <Badge variant="outline" className="mx-1 text-xs bg-red-100 text-red-800">Critique</Badge>
              doivent être complétées en premier.
            </p>
          </div>
        </div>
      </Card>

      <Accordion
        type="multiple"
        value={expandedSections}
        onValueChange={setExpandedSections}
        className="space-y-4"
      >
        {testSections.map((section, sectionIndex) => {
          const { completed, total } = getSectionProgress(section);
          const isCompleted = completed === total;

          return (
            <AccordionItem
              key={section.id}
              value={section.id}
              className="border rounded-lg overflow-hidden"
            >
              <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-muted/50">
                <div className="flex items-center gap-4 w-full">
                  <div className={`p-2 rounded-lg ${isCompleted ? 'bg-green-100 dark:bg-green-900/30' : 'bg-muted'}`}>
                    {isCompleted ? (
                      <CheckCircle2 className="h-5 w-5 text-green-600" />
                    ) : (
                      section.icon
                    )}
                  </div>

                  <div className="flex-1 text-left">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">
                        {sectionIndex + 1}. {section.title}
                      </span>
                      <Badge className={getPriorityColor(section.priority)}>
                        {section.priority === "critical" ? "Critique" :
                          section.priority === "high" ? "Important" : "Optionnel"}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
                      <span>⏱️ {section.estimatedTime}</span>
                      <span>{completed}/{total} étapes</span>
                    </div>
                  </div>

                  <Progress value={(completed / total) * 100} className="w-24" />
                </div>
              </AccordionTrigger>

              <AccordionContent className="px-4 pb-4">
                <div className="space-y-4 mt-2">
                  {section.steps.map((step, stepIndex) => (
                    <Card
                      key={step.id}
                      className={`transition-all ${completedSteps.has(step.id) ? 'bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-800' : ''}`}
                    >
                      <CardHeader className="pb-2">
                        <div className="flex items-start gap-3">
                          <Checkbox
                            checked={completedSteps.has(step.id)}
                            onCheckedChange={() => toggleStep(step.id)}
                            className="mt-1"
                          />
                          <div className="flex-1">
                            <CardTitle className="text-base flex items-center gap-2">
                              <span className="text-muted-foreground">
                                {sectionIndex + 1}.{stepIndex + 1}
                              </span>
                              {step.title}
                            </CardTitle>
                            <CardDescription>{step.description}</CardDescription>
                          </div>
                        </div>
                      </CardHeader>

                      <CardContent className="pt-0 pl-10">
                        <div className="space-y-3">
                          <div>
                            <h4 className="text-sm font-medium mb-2">Étapes détaillées:</h4>
                            <ul className="space-y-1">
                              {step.details.map((detail, i) => (
                                <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                                  <span className="text-primary">→</span>
                                  {detail}
                                </li>
                              ))}
                            </ul>
                          </div>

                          <div className="p-3 bg-muted/50 rounded-lg">
                            <h4 className="text-sm font-medium flex items-center gap-2">
                              <CheckCircle2 className="h-4 w-4 text-green-600" />
                              Résultat attendu:
                            </h4>
                            <p className="text-sm text-muted-foreground mt-1">
                              {step.expectedResult}
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>

      <Card className="p-6 bg-gradient-to-r from-primary/10 to-primary/5">
        <div className="text-center">
          <h3 className="text-xl font-semibold mb-2">🎉 Félicitations!</h3>
          <p className="text-muted-foreground">
            Une fois toutes les étapes complétées, votre application sera entièrement testée et prête pour la production.
          </p>
          {progressPercentage === 100 && (
            <Button className="mt-4">
              Générer le rapport de test
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}
