import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { apiClient } from "@/api/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Award, FileText, Download, Search, Printer } from "lucide-react";
import { useStudentLabel } from "@/hooks/useStudentLabel";
import { escapeHTML } from '@/lib/security';

interface Student {
  id: string;
  first_name: string;
  last_name: string;
  registration_number: string | null;
  date_of_birth: string | null;
}

interface Enrollment {
  id: string;
  academic_year: { id: string; name: string };
  classroom: { id: string; name: string };
  level: { id: string; name: string } | null;
}

interface Classroom {
  id: string;
  name: string;
  level: { name: string } | null;
}

type CertificateType = "enrollment" | "attendance" | "level";

const Certificates = () => {
  const { t } = useTranslation();
  const { tenant } = useAuth();
  const { studentLabel, StudentLabel, studentsLabel, StudentsLabel } = useStudentLabel();
  const [selectedClassroom, setSelectedClassroom] = useState<string>("");
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [certificateType, setCertificateType] = useState<CertificateType>("enrollment");
  const [searchTerm, setSearchTerm] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const { data: classrooms = [] } = useQuery({
    queryKey: ["certificates", "classrooms", tenant?.id],
    queryFn: async () => {
      const { data } = await apiClient.get("/students/classes/", {
        params: { ordering: "name", expand: "level" },
      });
      return ((data as any[]) || []).map((c) => ({
        ...c,
        level: c.level as { name: string } | null,
      }));
    },
    enabled: !!tenant?.id,
    staleTime: 10 * 60 * 1000,
  });

  const { data: students = [] } = useQuery({
    queryKey: ["certificates", "students", selectedClassroom],
    queryFn: async () => {
      const { data: currentYear } = await apiClient.get("/students/academic-years/", {
        params: { is_current: true },
      });
      const yearData = (currentYear as any[])?.[0];
      if (!yearData) return [];

      const { data: enrollments } = await apiClient.get("/admissions/enrollments/", {
        params: { class_id: selectedClassroom, academic_year_id: yearData.id, expand: "student" },
      });
      return ((enrollments as any[]) || [])
        .map((e) => e.student as unknown as Student)
        .filter(Boolean);
    },
    enabled: !!selectedClassroom,
    staleTime: 5 * 60 * 1000,
  });

  const { data: enrollment = null } = useQuery({
    queryKey: ["certificates", "enrollment", selectedStudent?.id],
    queryFn: async () => {
      const { data: currentYear } = await apiClient.get("/students/academic-years/", {
        params: { is_current: true },
      });
      const yearData = (currentYear as any[])?.[0];
      if (!yearData) return null;

      const { data } = await apiClient.get("/admissions/enrollments/", {
        params: {
          student_id: selectedStudent!.id,
          academic_year_id: yearData.id,
          expand: "academic_year,classroom,level",
        },
      });
      const e = (data as any[])?.[0];
      if (!e) return null;
      return {
        ...e,
        academic_year: e.academic_year as { id: string; name: string },
        classroom: e.classroom as { id: string; name: string },
        level: e.level as { id: string; name: string } | null,
      } as Enrollment;
    },
    enabled: !!selectedStudent?.id,
    staleTime: 5 * 60 * 1000,
  });

  const handleSelectStudent = (student: Student) => {
    setSelectedStudent(student);
  };

  const generateCertificate = () => {
    if (!selectedStudent || !enrollment || !tenant) {
      toast.error(t("certificates.selectStudentError", { student: studentLabel }));
      return;
    }

    setIsLoading(true);

    const certificateTitles: Record<CertificateType, string> = {
      enrollment: t("certificates.typeEnrollmentTitle"),
      attendance: t("certificates.typeAttendanceTitle"),
      level: t("certificates.typeLevelTitle")
    };

    const certificateContent: Record<CertificateType, string> = {
      enrollment: `est régulièrement inscrit(e) dans notre établissement pour l'année académique ${escapeHTML(enrollment.academic_year.name)} en classe de ${escapeHTML(enrollment.classroom.name)}${enrollment.level ? ` (${escapeHTML(enrollment.level.name)})` : ""}.`,
      attendance: `est régulièrement scolarisé(e) dans notre établissement au titre de l'année académique ${escapeHTML(enrollment.academic_year.name)}. L'${studentLabel} est actuellement en classe de ${escapeHTML(enrollment.classroom.name)}${enrollment.level ? ` (${escapeHTML(enrollment.level.name)})` : ""}.`,
      level: `a atteint le niveau ${escapeHTML(enrollment.level?.name || enrollment.classroom.name)} au cours de l'année académique ${escapeHTML(enrollment.academic_year.name)} dans notre établissement.`
    };

    const today = new Date().toLocaleDateString("fr-FR", {
      day: "numeric",
      month: "long",
      year: "numeric"
    });

    const birthDate = selectedStudent.date_of_birth
      ? new Date(selectedStudent.date_of_birth).toLocaleDateString("fr-FR")
      : t("certificates.notProvided");

    // Signatures électroniques des responsables (cast tenant avec les nouveaux champs)
    const tenantData = tenant as typeof tenant & {
      director_signature_url?: string;
      secretary_signature_url?: string;
      director_name?: string;
      secretary_name?: string;
      city?: string;
    };
    const directorSignature = tenantData.director_signature_url || null;
    const secretarySignature = tenantData.secretary_signature_url || null;
    const directorName = tenantData.director_name || "Le/La Directeur(trice)";
    const secretaryName = tenantData.secretary_name || "Le/La Secrétaire Général(e)";

    const printContent = `
      <!DOCTYPE html>
      <html lang="fr">
      <head>
        <meta charset="UTF-8">
        <title>${certificateTitles[certificateType]}</title>
        <style>
          @page { 
            size: A4; 
            margin: 15mm;
          }
          * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
          }
          html, body {
            height: 100%;
            width: 100%;
            overflow: hidden;
          }
          body {
            font-family: 'Times New Roman', Times, serif;
            font-size: 12pt;
            line-height: 1.5;
            color: #333;
          }
          .page {
            width: 100%;
            height: 100vh;
            max-height: 297mm;
            padding: 10mm;
            display: flex;
            flex-direction: column;
            page-break-after: avoid;
            page-break-inside: avoid;
          }
          .header {
            text-align: center;
            border-bottom: 2px double #1a365d;
            padding-bottom: 12px;
            margin-bottom: 15px;
          }
          .school-logo {
            width: 60px;
            height: 60px;
            margin: 0 auto 8px;
          }
          .school-name {
            font-size: 18pt;
            font-weight: bold;
            color: #1a365d;
            margin-bottom: 4px;
          }
          .school-info {
            font-size: 9pt;
            color: #666;
            line-height: 1.3;
          }
          .title {
            text-align: center;
            font-size: 16pt;
            font-weight: bold;
            text-transform: uppercase;
            letter-spacing: 3px;
            margin: 20px 0;
            color: #1a365d;
            text-decoration: underline;
            text-underline-offset: 6px;
          }
          .content {
            flex: 1;
            text-align: justify;
            padding: 0 15px;
          }
          .content p {
            margin-bottom: 12px;
          }
          .student-info {
            text-align: center;
            margin: 15px 0;
            padding: 10px;
            background: linear-gradient(180deg, transparent 40%, #fef3c7 40%);
          }
          .student-name {
            font-weight: bold;
            font-size: 14pt;
            text-transform: uppercase;
            color: #1a365d;
          }
          .details {
            margin: 10px 0;
            padding: 8px 15px;
            background: #f8f9fa;
            border-radius: 4px;
            font-size: 11pt;
          }
          .purpose {
            font-style: italic;
            margin-top: 15px;
            padding-top: 10px;
            border-top: 1px dashed #ccc;
          }
          .footer {
            margin-top: auto;
            padding-top: 15px;
          }
          .date-location {
            text-align: right;
            margin-bottom: 20px;
            font-size: 11pt;
          }
          .signatures {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            gap: 20px;
          }
          .signature-block {
            text-align: center;
            min-width: 180px;
          }
          .signature-title {
            font-weight: bold;
            font-size: 10pt;
            margin-bottom: 5px;
            color: #1a365d;
          }
          .signature-image {
            height: 50px;
            max-width: 150px;
            object-fit: contain;
            margin: 5px auto;
          }
          .signature-placeholder {
            height: 50px;
            border-bottom: 1px solid #333;
            margin: 5px auto;
            width: 120px;
          }
          .signature-name {
            font-size: 10pt;
            font-weight: 500;
          }
          .stamp-area {
            border: 1.5px dashed #999;
            width: 80px;
            height: 80px;
            display: flex;
            align-items: center;
            justify-content: center;
            color: #999;
            font-size: 8pt;
            border-radius: 50%;
          }
          .ref-number {
            font-size: 8pt;
            color: #888;
            text-align: center;
            margin-top: 10px;
            padding-top: 8px;
            border-top: 1px solid #eee;
          }
          @media print {
            .page {
              height: 100%;
              page-break-after: avoid;
            }
          }
        </style>
      </head>
      <body>
        <div class="page">
          <div class="header">
            ${tenant.logo_url ? `<img src="${escapeHTML(tenant.logo_url)}" alt="Logo" class="school-logo" />` : ''}
            <div class="school-name">${escapeHTML(tenant.name)}</div>
            <div class="school-info">
              ${escapeHTML(tenant.address || "")}
              ${tenant.phone ? ` • Tél: ${escapeHTML(tenant.phone)}` : ""}
              ${tenant.email ? ` • ${escapeHTML(tenant.email)}` : ""}
            </div>
          </div>

          <div class="title">${certificateTitles[certificateType]}</div>

          <div class="content">
            <p>Je soussigné(e), <strong>${escapeHTML(directorName)}</strong>, Directeur/Directrice de l'établissement <strong>${escapeHTML(tenant.name)}</strong>, atteste par la présente que :</p>
            
            <div class="student-info">
              <span class="student-name">${escapeHTML(selectedStudent.last_name)} ${escapeHTML(selectedStudent.first_name)}</span>
            </div>
            
            <div class="details">
              <strong>Date de naissance :</strong> ${escapeHTML(birthDate)}<br>
              ${selectedStudent.registration_number ? `<strong>N° Enregistrement :</strong> ${escapeHTML(selectedStudent.registration_number)}` : ""}
            </div>
            
            <p>${certificateContent[certificateType]}</p>
            
            <p class="purpose">
              En foi de quoi, la présente attestation est délivrée à l'intéressé(e) pour servir et valoir ce que de droit.
            </p>
          </div>

          <div class="footer">
            <div class="date-location">
              Fait à ${escapeHTML(tenantData.city || "_______________")}, le ${escapeHTML(today)}
            </div>
            
            <div class="signatures">
              <div class="signature-block">
                <div class="signature-title">Le/La Secrétaire Général(e)</div>
                ${secretarySignature
        ? `<img src="${escapeHTML(secretarySignature)}" alt="Signature" class="signature-image" />`
        : '<div class="signature-placeholder"></div>'
      }
                <div class="signature-name">${escapeHTML(secretaryName)}</div>
              </div>
              
              <div class="stamp-area">Cachet</div>
              
              <div class="signature-block">
                <div class="signature-title">Le/La Directeur(trice)</div>
                ${directorSignature
        ? `<img src="${escapeHTML(directorSignature)}" alt="Signature" class="signature-image" />`
        : '<div class="signature-placeholder"></div>'
      }
                <div class="signature-name">${escapeHTML(directorName)}</div>
              </div>
            </div>
            
            <div class="ref-number">
              Réf: ATT-${certificateType.toUpperCase().substring(0, 3)}-${Date.now().toString(36).toUpperCase()} | Document généré électroniquement - Validité vérifiable auprès de l'établissement
            </div>
          </div>
        </div>
      </body>
      </html>
    `;

    const printWindow = window.open("", "_blank");
    if (printWindow) {
      printWindow.document.write(printContent);
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => {
        printWindow.print();
        setIsLoading(false);
      }, 500);
    } else {
      toast.error(t("certificates.printWindowError"));
      setIsLoading(false);
    }
  };

  const filteredStudents = students.filter((s) =>
    `${s.first_name} ${s.last_name} ${s.registration_number || ""}`
      .toLowerCase()
      .includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("certificates.title")}</h1>
        <p className="text-muted-foreground">{t("certificates.subtitle")}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Student Selection */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Search className="h-5 w-5" />
              {t("certificates.selectStudentTitle", { student: StudentLabel })}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>{t("certificates.fieldClass")}</Label>
                <Select value={selectedClassroom} onValueChange={setSelectedClassroom}>
                  <SelectTrigger>
                    <SelectValue placeholder={t("certificates.placeholderClass")} />
                  </SelectTrigger>
                  <SelectContent>
                    {classrooms.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name} {c.level && `(${c.level.name})`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t("certificates.fieldSearch")}</Label>
                <Input
                  placeholder={t("certificates.placeholderSearch")}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>

            <div className="max-h-64 overflow-y-auto space-y-2">
              {filteredStudents.length === 0 ? (
                <p className="text-center text-muted-foreground py-4">
                  {selectedClassroom ? t("certificates.noStudentFound", { student: studentLabel }) : t("certificates.selectClassFirst")}
                </p>
              ) : (
                filteredStudents.map((student) => (
                  <div
                    key={student.id}
                    onClick={() => handleSelectStudent(student)}
                    className={`p-3 rounded-lg border cursor-pointer transition-colors ${selectedStudent?.id === student.id
                      ? "border-primary bg-primary/5"
                      : "hover:bg-muted/50"
                      }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium">
                        {student.last_name} {student.first_name}
                      </span>
                      {student.registration_number && (
                        <Badge variant="outline">{student.registration_number}</Badge>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        {/* Certificate Generation */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Award className="h-5 w-5" />
              {t("certificates.generateTitle")}
            </CardTitle>
            <CardDescription>
              {selectedStudent
                ? t("certificates.generateFor", { name: `${selectedStudent.last_name} ${selectedStudent.first_name}` })
                : t("certificates.generateSelectStudent", { student: studentLabel })}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>{t("certificates.fieldType")}</Label>
              <Select
                value={certificateType}
                onValueChange={(v) => setCertificateType(v as CertificateType)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="enrollment">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4" />
                      {t("certificates.typeEnrollment")}
                    </div>
                  </SelectItem>
                  <SelectItem value="attendance">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4" />
                      {t("certificates.typeAttendance")}
                    </div>
                  </SelectItem>
                  <SelectItem value="level">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4" />
                      {t("certificates.typeLevel")}
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {selectedStudent && enrollment && (
              <div className="p-3 bg-muted rounded-lg text-sm space-y-1">
                <p><strong>{t("certificates.year")}:</strong> {enrollment.academic_year.name}</p>
                <p><strong>{t("certificates.class")}:</strong> {enrollment.classroom.name}</p>
                {enrollment.level && (
                  <p><strong>{t("certificates.level")}:</strong> {enrollment.level.name}</p>
                )}
              </div>
            )}

            <Button
              onClick={generateCertificate}
              disabled={!selectedStudent || !enrollment || isLoading}
              className="w-full"
            >
              <Printer className="h-4 w-4 mr-2" />
              {isLoading ? t("certificates.generating") : t("certificates.generatePrint")}
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Certificate Types Info */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <FileText className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <h3 className="font-medium">{t("certificates.typeEnrollment")}</h3>
                <p className="text-sm text-muted-foreground">
                  {t("certificates.typeEnrollmentDesc", { student: studentLabel })}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <FileText className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <h3 className="font-medium">{t("certificates.typeAttendance")}</h3>
                <p className="text-sm text-muted-foreground">
                  {t("certificates.typeAttendanceDesc", { student: studentLabel })}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-purple-100 rounded-lg">
                <FileText className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <h3 className="font-medium">{t("certificates.typeLevel")}</h3>
                <p className="text-sm text-muted-foreground">
                  {t("certificates.typeLevelDesc", { student: studentLabel })}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Certificates;
