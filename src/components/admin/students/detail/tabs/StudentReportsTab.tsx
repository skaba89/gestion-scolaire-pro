import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, Download } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useTenantUrl } from "@/hooks/useTenantUrl";
import { useTranslation } from "react-i18next";

interface StudentReportsTabProps {
    ofStudentLabel: string;
}

export function StudentReportsTab({ ofStudentLabel }: StudentReportsTabProps) {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { getTenantUrl } = useTenantUrl();

    return (
        <Card>
            <CardHeader>
                <CardTitle>{t("studentsAdmin.bulletinsScolaires")}</CardTitle>
                <CardDescription>{t("studentsAdmin.telechargerLesBulletinsOfstudentlabel", { ofStudentLabel })}</CardDescription>
            </CardHeader>
            <CardContent>
                <div className="text-center py-8">
                    <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <p className="text-muted-foreground mb-4">
                        {t("studentsAdmin.lesBulletinsSontDisponiblesDans")}
                    </p>
                    <Button onClick={() => navigate(getTenantUrl("/admin/report-cards"))}>
                        <Download className="h-4 w-4 mr-2" />
                        {t("studentsAdmin.voirLesBulletins")}
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}
