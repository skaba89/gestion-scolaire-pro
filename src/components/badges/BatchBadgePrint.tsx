import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { useStudentLabel } from "@/hooks/useStudentLabel";
import { QRCodeSVG } from "qrcode.react";
import { Printer, Loader2, Users, AlertCircle, Download, FileImage, LayoutTemplate, Trash2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { BadgeRenderer } from "./BadgeTemplates";
import { BADGE_TEMPLATES, BadgeTemplate } from "./BadgeConstants";

interface Classroom {
  id: string;
  name: string;
  level?: { name: string } | null;
}

interface StudentWithBadge {
  id: string;
  first_name: string;
  last_name: string;
  registration_number: string | null;
  photo_url?: string | null;
  badge?: {
    id: string;
    badge_code: string;
    qr_code_data: string;
  } | null;
  classroomName?: string;
  levelName?: string;
}

interface BatchBadgePrintProps {
  onBadgesCreated?: () => void;
}

export default function BatchBadgePrint({ onBadgesCreated }: BatchBadgePrintProps) {
  const { tenant } = useTenant();
  const { studentsLabel } = useStudentLabel();
  const { toast } = useToast();
  const printRef = useRef<HTMLDivElement>(null);

  const [open, setOpen] = useState(false);
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [selectedClassroom, setSelectedClassroom] = useState<string>("");
  const [students, setStudents] = useState<StudentWithBadge[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [showPrintView, setShowPrintView] = useState(false);
  const [academicYear, setAcademicYear] = useState<{ id: string; name: string } | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<string>("standard");

  useEffect(() => {
    if (open && tenant) {
      fetchClassrooms();
      fetchAcademicYear();
    }
  }, [open, tenant]);

  useEffect(() => {
    if (selectedClassroom) {
      fetchStudentsInClassroom();
    } else {
      setStudents([]);
    }
  }, [selectedClassroom]);

  const fetchAcademicYear = async () => {
    if (!tenant) return;

    const { data } = await supabase
      .from("academic_years")
      .select("id, name")
      .eq("tenant_id", tenant.id)
      .eq("is_current", true)
      .single();

    if (data) {
      setAcademicYear(data);
    }
  };

  const fetchClassrooms = async () => {
    if (!tenant) return;

    const { data, error } = await supabase
      .from("classrooms")
      .select(`
        id,
        name,
        level:levels(name)
      `)
      .eq("tenant_id", tenant.id)
      .order("name");

    if (error) {
      console.error("Error fetching classrooms:", error);
    } else {
      setClassrooms(data || []);
    }
  };

  const fetchStudentsInClassroom = async () => {
    if (!tenant || !selectedClassroom) return;

    setLoading(true);

    // Get current academic year
    const { data: academicYearData } = await supabase
      .from("academic_years")
      .select("id, name")
      .eq("tenant_id", tenant.id)
      .eq("is_current", true)
      .single();

    if (!academicYearData) {
      toast({
        title: "Erreur",
        description: "Aucune année scolaire active",
        variant: "destructive",
      });
      setLoading(false);
      return;
    }

    setAcademicYear(academicYearData);

    // Get students enrolled in this classroom
    const { data: enrollments, error: enrollError } = await supabase
      .from("enrollments")
      .select(`
        student:students(
          id,
          first_name,
          last_name,
          registration_number,
          photo_url,
          level:levels(name)
        )
      `)
      .eq("class_id", selectedClassroom)
      .eq("academic_year_id", academicYearData.id)
      .eq("status", "active");

    if (enrollError) {
      console.error("Error fetching enrollments:", enrollError);
      setLoading(false);
      return;
    }

    const classroomData = classrooms.find((c) => c.id === selectedClassroom);
    const classroomName = classroomData?.name || "";
    const levelName = classroomData?.level?.name || "";

    const studentList = (enrollments || [])
      .map((e: any) => ({
        ...e.student,
        classroomName,
        levelName: e.student.level?.name || levelName,
      }))
      .filter(Boolean) as StudentWithBadge[];

    // Get existing badges for these students
    if (studentList.length > 0) {
      const studentIds = studentList.map((s) => s.id);
      const { data: badges } = await supabase
        .from("student_badges")
        .select("id, student_id, badge_code, qr_code_data")
        .in("student_id", studentIds)
        .eq("tenant_id", tenant.id)
        .eq("status", "ACTIVE");

      // Attach badges to students
      const studentsWithBadges = studentList.map((student) => ({
        ...student,
        badge: badges?.find((b) => b.student_id === student.id) || null,
      }));

      setStudents(studentsWithBadges);
    } else {
      setStudents([]);
    }

    setLoading(false);
  };

  const generateBadgeCode = () => {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let code = "";
    for (let i = 0; i < 8; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  };

  const handleGenerateMissingBadges = async () => {
    if (!tenant) return;

    const studentsWithoutBadge = students.filter((s) => !s.badge);
    if (studentsWithoutBadge.length === 0) {
      toast({
        title: "Information",
        description: `Tous les ${studentsLabel} ont déjà un badge`,
      });
      return;
    }

    setGenerating(true);

    try {
      const newBadges = studentsWithoutBadge.map((student) => {
        const badgeCode = generateBadgeCode();
        return {
          student_id: student.id,
          tenant_id: tenant.id,
          badge_code: badgeCode,
          qr_code_data: JSON.stringify({
            type: "student_badge",
            tenant_id: tenant.id,
            student_id: student.id,
            badge_code: badgeCode,
            version: 1,
          }),
          status: "ACTIVE" as const,
        };
      });

      const { error } = await supabase.from("student_badges").insert(newBadges);

      if (error) throw error;

      toast({
        title: "Succès",
        description: `${newBadges.length} badge(s) créé(s)`,
      });

      // Refresh students list
      await fetchStudentsInClassroom();
      onBadgesCreated?.();
    } catch (error: any) {
      console.error("Error generating badges:", error);
      toast({
        title: "Erreur",
        description: "Impossible de créer les badges",
        variant: "destructive",
      });
    } finally {
      setGenerating(false);
    }
  };

  const handleDeleteBadge = async (badgeId: string, studentName: string) => {
    if (!confirm(`Êtes-vous sûr de vouloir supprimer le badge de ${studentName} ?`)) return;

    setDeleting(badgeId);
    try {
      const { error } = await supabase.from("student_badges").delete().eq("id", badgeId);
      if (error) throw error;

      toast({ title: "Succès", description: "Badge supprimé" });
      await fetchStudentsInClassroom();
    } catch (e) {
      console.error(e);
      toast({ title: "Erreur", description: "Erreur lors de la suppression", variant: "destructive" });
    } finally {
      setDeleting(null);
    }
  };

  const handleDownloadPDF = () => {
    setShowPrintView(true);
  };

  const handlePrint = () => {
    window.print();
  };

  const getTemplateOrientation = () => {
    return BADGE_TEMPLATES.find(t => t.id === selectedTemplate)?.orientation || "portrait";
  };

  const studentsWithBadge = students.filter((s) => s.badge);
  const studentsWithoutBadge = students.filter((s) => !s.badge);
  const selectedClassroomData = classrooms.find((c) => c.id === selectedClassroom);

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="outline">
            <Printer className="h-4 w-4 mr-2" />
            Impression en lot
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Impression de badges par classe</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Sélectionner une classe</Label>
              <Select value={selectedClassroom} onValueChange={setSelectedClassroom}>
                <SelectTrigger>
                  <SelectValue placeholder="Choisir une classe" />
                </SelectTrigger>
                <SelectContent>
                  {classrooms.map((classroom) => (
                    <SelectItem key={classroom.id} value={classroom.id}>
                      {classroom.name}
                      {classroom.level && ` - ${classroom.level.name}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Choisir un modèle de badge</Label>
              <Select value={selectedTemplate} onValueChange={setSelectedTemplate}>
                <SelectTrigger>
                  <SelectValue placeholder="Choisir un modèle" />
                </SelectTrigger>
                <SelectContent>
                  {BADGE_TEMPLATES.map((template) => (
                    <SelectItem key={template.id} value={template.id}>
                      <div className="flex items-center gap-2">
                        <LayoutTemplate className="h-4 w-4 text-muted-foreground" />
                        <span>{template.name}</span>
                        <span className="text-xs text-muted-foreground ml-2">({template.description})</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : selectedClassroom && students.length === 0 ? (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Aucun élève inscrit dans cette classe pour l'année en cours
                </AlertDescription>
              </Alert>
            ) : selectedClassroom && students.length > 0 ? (
              <>
                <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                  <div className="flex items-center gap-2">
                    <Users className="h-5 w-5 text-muted-foreground" />
                    <span className="font-medium">{students.length} élève(s)</span>
                  </div>
                  <div className="flex gap-4 text-sm">
                    <span className="text-green-600">{studentsWithBadge.length} avec badge</span>
                    <span className="text-yellow-600">{studentsWithoutBadge.length} sans badge</span>
                  </div>
                </div>

                {studentsWithoutBadge.length > 0 && (
                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription className="flex items-center justify-between">
                      <span>{studentsWithoutBadge.length} élève(s) n'ont pas encore de badge</span>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleGenerateMissingBadges}
                        disabled={generating}
                      >
                        {generating ? (
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        ) : null}
                        Créer les badges manquants
                      </Button>
                    </AlertDescription>
                  </Alert>
                )}

                <ScrollArea className="h-[200px] border rounded-lg">
                  <div className="p-4 space-y-2">
                    {students.map((student) => (
                      <div
                        key={student.id}
                        className="flex items-center justify-between p-2 rounded hover:bg-muted"
                      >
                        <div className="flex items-center gap-3">
                          {student.photo_url ? (
                            <img
                              src={student.photo_url}
                              alt={`${student.first_name} ${student.last_name}`}
                              className="w-8 h-8 rounded-full object-cover"
                            />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-medium">
                              {student.first_name[0]}{student.last_name[0]}
                            </div>
                          )}
                          <div>
                            <p className="font-medium">
                              {student.first_name} {student.last_name}
                            </p>
                            {student.registration_number && (
                              <p className="text-sm text-muted-foreground">{student.registration_number}</p>
                            )}
                          </div>
                        </div>
                        {student.badge ? (
                          <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded flex items-center gap-2">
                            {student.badge.badge_code}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-4 w-4 text-red-500 hover:text-red-700 hover:bg-red-50"
                              onClick={() => handleDeleteBadge(student.badge!.id, `${student.first_name} ${student.last_name}`)}
                              disabled={deleting === student.badge.id}
                            >
                              {deleting === student.badge.id ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <Trash2 className="h-3 w-3" />
                              )}
                            </Button>
                          </span>
                        ) : (
                          <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded">
                            Sans badge
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </ScrollArea>

                <Button
                  onClick={handleDownloadPDF}
                  disabled={studentsWithBadge.length === 0}
                  className="w-full"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Télécharger/Imprimer {studentsWithBadge.length} badge(s)
                </Button>
              </>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>

      {/* Print View - Hidden by default, shown only during print */}
      {showPrintView && (
        <div
          ref={printRef}
          className="fixed inset-0 bg-white z-[9999] overflow-auto print:relative print:inset-auto print:z-auto"
        >
          <style>
            {`
              @media print {
                body * { visibility: hidden; }
                #print-badges, #print-badges * { visibility: visible; }
                #print-badges { position: absolute; left: 0; top: 0; width: 100%; }
                .no-print { display: none !important; }
                .badge-card { 
                  page-break-inside: avoid; 
                  break-inside: avoid;
                }
              }
                @page {
                  size: A4 ${getTemplateOrientation()};
                  margin: 10mm;
                }
                .badge-container { 
                   break-inside: avoid;
                   page-break-inside: avoid;
                   margin-bottom: 20px;
                   display: flex;
                   justify-content: center;
                }
              `}
          </style>
          <div id="print-badges" className="p-8 bg-slate-100 min-h-screen">
            <div className="text-center mb-6 no-print bg-white p-4 rounded-lg shadow-sm max-w-2xl mx-auto border">
              <h2 className="text-xl font-bold mb-2">
                Badges - {selectedClassroomData?.name}
              </h2>
              <p className="text-muted-foreground mb-4">
                Prêt à imprimer {studentsWithBadge.length} badges au format {BADGE_TEMPLATES.find(t => t.id === selectedTemplate)?.name}.
              </p>
              <div className="flex justify-center gap-4">
                <Button variant="outline" onClick={() => setShowPrintView(false)}>
                  Fermer
                </Button>
                <Button onClick={handlePrint} size="lg">
                  <Printer className="h-4 w-4 mr-2" />
                  Imprimer
                </Button>
              </div>
            </div>

            <div className="flex flex-wrap justify-center gap-8 print:block">
              <div className="print:grid print:grid-cols-2 print:gap-4 w-full max-w-[210mm] mx-auto flex flex-wrap justify-center gap-6">
                {studentsWithBadge.map((student) => (
                  <div key={student.id} className="badge-container">
                    <BadgeRenderer
                      templateId={selectedTemplate}
                      student={{
                        first_name: student.first_name,
                        last_name: student.last_name,
                        photo_url: student.photo_url,
                        registration_number: student.registration_number,
                        classroomName: student.classroomName,
                        levelName: student.levelName,
                      }}
                      badge={{
                        badge_code: student.badge!.badge_code,
                        qr_code_data: student.badge!.qr_code_data,
                        date_expiry: "30 JUIN", // Default or computed
                      }}
                      tenant={{
                        name: tenant?.name || "Institution",
                        logo_url: tenant?.logo_url,
                      }}
                      academicYear={academicYear?.name || ""}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
