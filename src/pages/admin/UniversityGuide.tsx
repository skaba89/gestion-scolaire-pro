import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  BookOpen,
  Printer,
  Download,
  Building2,
  Settings,
  Users,
  GraduationCap,
  Calendar,
  CreditCard,
  FileText,
  Award,
  BarChart3
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";

// Import custom sections
import { OverviewSection } from "./university-guide/sections/OverviewSection";
import { SetupSection } from "./university-guide/sections/SetupSection";
import { DepartmentsSection } from "./university-guide/sections/DepartmentsSection";
import { UsersSection } from "./university-guide/sections/UsersSection";
import { StudentsSection } from "./university-guide/sections/StudentsSection";
import { AcademicsSection } from "./university-guide/sections/AcademicsSection";
import { ScheduleSection } from "./university-guide/sections/ScheduleSection";
import { FinancesSection } from "./university-guide/sections/FinancesSection";
import { DocumentsSection } from "./university-guide/sections/DocumentsSection";
import { AlumniSection } from "./university-guide/sections/AlumniSection";
import { ReportsSection } from "./university-guide/sections/ReportsSection";

interface GuideSection {
  id: string;
  title: string;
  icon: React.ReactNode;
  content: React.ReactNode;
}

export default function UniversityGuide() {
  const { t } = useTranslation();
  const [activeSection, setActiveSection] = useState("overview");

  const handlePrint = () => {
    window.print();
  };

  const sections: GuideSection[] = useMemo(() => [
    { id: "overview", title: t("universityGuide.sectionOverview"), icon: <Building2 className="h-5 w-5" />, content: <OverviewSection /> },
    { id: "setup", title: t("universityGuide.sectionSetup"), icon: <Settings className="h-5 w-5" />, content: <SetupSection /> },
    { id: "departments", title: t("universityGuide.sectionDepartments"), icon: <Building2 className="h-5 w-5" />, content: <DepartmentsSection /> },
    { id: "users", title: t("universityGuide.sectionUsers"), icon: <Users className="h-5 w-5" />, content: <UsersSection /> },
    { id: "students", title: t("universityGuide.sectionStudents"), icon: <GraduationCap className="h-5 w-5" />, content: <StudentsSection /> },
    { id: "academics", title: t("universityGuide.sectionAcademics"), icon: <BookOpen className="h-5 w-5" />, content: <AcademicsSection /> },
    { id: "schedule", title: t("universityGuide.sectionSchedule"), icon: <Calendar className="h-5 w-5" />, content: <ScheduleSection /> },
    { id: "finances", title: t("universityGuide.sectionFinances"), icon: <CreditCard className="h-5 w-5" />, content: <FinancesSection /> },
    { id: "documents", title: t("universityGuide.sectionDocuments"), icon: <FileText className="h-5 w-5" />, content: <DocumentsSection /> },
    { id: "alumni", title: t("universityGuide.sectionAlumni"), icon: <Award className="h-5 w-5" />, content: <AlumniSection /> },
    { id: "reports", title: t("universityGuide.sectionReports"), icon: <BarChart3 className="h-5 w-5" />, content: <ReportsSection /> },
  ], [t]);

  return (
    <div className="space-y-6 print:space-y-4">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 print:hidden">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <BookOpen className="h-8 w-8 text-primary" />
            {t("universityGuide.pageTitle")}
          </h1>
          <p className="text-muted-foreground mt-1">
            {t("universityGuide.pageSubtitle")}
          </p>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" onClick={handlePrint}>
            <Printer className="h-4 w-4 mr-2" />
            {t("universityGuide.print")}
          </Button>
          <Button variant="outline" onClick={handlePrint}>
            <Download className="h-4 w-4 mr-2" />
            {t("universityGuide.downloadPdf")}
          </Button>
        </div>
      </div>

      {/* Print Header */}
      <div className="hidden print:block text-center mb-8">
        <h1 className="text-3xl font-bold">{t("universityGuide.printTitle")}</h1>
        <p className="text-lg text-muted-foreground">{t("universityGuide.printSubtitle")}</p>
      </div>

      {/* Navigation Tabs */}
      <div className="print:hidden">
        <Tabs value={activeSection} onValueChange={setActiveSection}>
          <ScrollArea className="w-full">
            <TabsList className="inline-flex w-max">
              {sections.map((section) => (
                <TabsTrigger key={section.id} value={section.id} className="gap-2">
                  {section.icon}
                  <span>{section.title}</span>
                </TabsTrigger>
              ))}
            </TabsList>
          </ScrollArea>

          {sections.map((section) => (
            <TabsContent key={section.id} value={section.id} className="mt-6">
              <Card>
                <CardContent className="p-6 md:p-8">
                  {section.content}
                </CardContent>
              </Card>
            </TabsContent>
          ))}
        </Tabs>
      </div>

      {/* Print version - all sections */}
      <div className="hidden print:block space-y-8">
        {sections.map((section, index) => (
          <div key={section.id} className="break-before-page first:break-before-auto">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-2xl font-bold">{index + 1}.</span>
              <h2 className="text-2xl font-bold">{section.title}</h2>
            </div>
            <div className="prose prose-sm max-w-none">
              {section.content}
            </div>
          </div>
        ))}
      </div>

      {/* Table of contents for print */}
      <div className="hidden print:block break-before-page">
        <h2 className="text-2xl font-bold mb-4">{t("universityGuide.tableOfContents")}</h2>
        <ul className="space-y-2">
          {sections.map((section, index) => (
            <li key={section.id} className="flex items-center gap-2">
              <span className="font-medium">{index + 1}.</span>
              <span>{section.title}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
