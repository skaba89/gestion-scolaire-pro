import { useParams, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/api/client";
import { usePublicTenant } from "@/hooks/usePublicTenant";
import { resolveUploadUrl } from "@/utils/url";
import { tenantHeroStyle } from "@/utils/tenantBranding";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  GraduationCap,
  MapPin,
  Phone,
  Mail,
  FileText,
  CheckCircle2,
  Clock,
  Calendar,
  Users,
  BookOpen,
  ArrowRight,
  ArrowLeft,
  Loader2,
  ClipboardList,
  CreditCard,
  Building2,
} from "lucide-react";

const AdmissionInfo = () => {
  const { t } = useTranslation();

  const { tenantSlug } = useParams<{ tenantSlug: string }>();

  // Identity (name, contact, logo) — same proven endpoint as the landing page.
  const { data: tenant, isLoading } = usePublicTenant(tenantSlug);

  // Admission-specific data (levels + current academic year) — the only
  // public admissions endpoint the backend actually exposes for this.
  const { data: admissionInfo } = useQuery({
    queryKey: ["public-admission-info", tenantSlug],
    queryFn: async () => {
      if (!tenantSlug) return null;
      const { data } = await apiClient.get(
        `/admissions/public/tenant-info/${encodeURIComponent(tenantSlug)}/`
      );
      return data;
    },
    enabled: !!tenantSlug,
  });

  const levels = admissionInfo?.levels ?? [];
  const currentYear = admissionInfo?.current_academic_year ?? null;

  if (isLoading) {
    return (<div className="min-h-screen bg-muted/30 flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>);
  }

  if (!tenant) {
    return (
      <div className="min-h-screen bg-muted/30 flex items-center justify-center">
        <Card className="max-w-md"><CardContent className="p-8 text-center"><GraduationCap className="w-12 h-12 text-muted-foreground mx-auto mb-4" /><h1 className="text-xl font-bold mb-2">{t("publicJourney.info.notFoundTitle")}</h1><p className="text-muted-foreground mb-4">{t("publicJourney.info.notFoundText")}</p><Link to="/"><Button variant="outline">{t("publicJourney.info.backHome")}</Button></Link></CardContent></Card>
      </div>
    );
  }

  const tenantTypeLabels: Record<string, string> = {
    primary_school: t("publicJourney.info.types.primary_school"), middle_school: t("publicJourney.info.types.middle_school"), high_school: t("publicJourney.info.types.high_school"), university: t("publicJourney.info.types.university"), training_center: t("publicJourney.info.types.training_center"), school: t("publicJourney.info.types.school"),
  };

  const requiredDocuments = [
    t("publicJourney.info.docs.birth"),
    t("publicJourney.info.docs.schoolCertificate"),
    t("publicJourney.info.docs.transcript"),
    t("publicJourney.info.docs.photos"),
    t("publicJourney.info.docs.vaccination"),
    t("publicJourney.info.docs.residence"),
  ];

  const admissionSteps = [
    { step: 1, title: t("publicJourney.info.steps.form.title"), description: t("publicJourney.info.steps.form.description"), icon: ClipboardList },
    { step: 2, title: t("publicJourney.info.steps.documents.title"), description: t("publicJourney.info.steps.documents.description"), icon: FileText },
    { step: 3, title: t("publicJourney.info.steps.review.title"), description: t("publicJourney.info.steps.review.description"), icon: Clock },
    { step: 4, title: t("publicJourney.info.steps.decision.title"), description: t("publicJourney.info.steps.decision.description"), icon: Mail },
    { step: 5, title: t("publicJourney.info.steps.finalize.title"), description: t("publicJourney.info.steps.finalize.description"), icon: CreditCard },
  ];

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="bg-gradient-hero relative overflow-hidden" style={tenantHeroStyle(tenant.landing)}>
        <div className="container mx-auto px-4 py-12 relative">
          <Link to={`/${tenantSlug}`} className="inline-flex items-center text-primary-foreground/80 hover:text-primary-foreground mb-6"><ArrowLeft className="w-4 h-4 mr-2" />{t("publicJourney.info.backHome")}</Link><div className="float-right"><LanguageSwitcher /></div>
          <div className="flex flex-col md:flex-row items-center gap-6">
            {tenant.landing?.logo_url ? (<img src={resolveUploadUrl(tenant.landing.logo_url)} alt={tenant.name} className="w-20 h-20 rounded-xl object-cover bg-background/20 shadow-lg" />) : (<div className="w-20 h-20 rounded-xl bg-background/20 flex items-center justify-center shadow-lg"><GraduationCap className="w-10 h-10 text-primary-foreground" /></div>)}
            <div className="text-center md:text-left">
              <p className="text-primary-foreground/80 text-sm font-medium mb-1">{tenantTypeLabels[tenant.type || "school"]}</p>
              <h1 className="text-2xl md:text-3xl font-display font-bold text-primary-foreground mb-2">{tenant.name}</h1>
              <p className="text-primary-foreground/80 text-lg">{t("publicJourney.info.subtitle")}</p>
            </div>
          </div>
        </div>
      </header>
      <div className="container mx-auto px-4 py-8 space-y-8">
        {currentYear && (
          <Card className="border-primary/20 bg-primary/5"><CardContent className="py-4"><div className="flex items-center justify-between flex-wrap gap-4"><div className="flex items-center gap-3"><Calendar className="w-5 h-5 text-primary" /><span className="font-medium">{t("publicJourney.info.currentYear")}</span><Badge variant="default" className="text-base">{currentYear.name}</Badge></div><Link to={`/admissions/${tenantSlug}`}><Button size="lg">{t("publicJourney.info.applyNow")}<ArrowRight className="w-4 h-4 ml-2" /></Button></Link></div></CardContent></Card>
        )}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            <Card><CardHeader><CardTitle className="flex items-center gap-2"><ClipboardList className="w-5 h-5 text-primary" />{t("publicJourney.info.processTitle")}</CardTitle><CardDescription>{t("publicJourney.info.processDescription")}</CardDescription></CardHeader><CardContent><div className="space-y-6">{admissionSteps.map((step, index) => (<div key={step.step} className="flex gap-4"><div className="flex flex-col items-center"><div className="w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold">{step.step}</div>{index < admissionSteps.length - 1 && <div className="w-0.5 h-full bg-primary/20 mt-2" />}</div><div className="flex-1 pb-6"><div className="flex items-center gap-2 mb-1"><step.icon className="w-4 h-4 text-primary" /><h3 className="font-semibold">{step.title}</h3></div><p className="text-muted-foreground text-sm">{step.description}</p></div></div>))}</div></CardContent></Card>
            <Card><CardHeader><CardTitle className="flex items-center gap-2"><FileText className="w-5 h-5 text-primary" />{t("publicJourney.info.documentsTitle")}</CardTitle><CardDescription>{t("publicJourney.info.documentsDescription")}</CardDescription></CardHeader><CardContent><ul className="space-y-3">{requiredDocuments.map((doc, index) => (<li key={index} className="flex items-start gap-3"><CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" /><span>{doc}</span></li>))}</ul></CardContent></Card>
            {levels && levels.length > 0 && (<Card><CardHeader><CardTitle className="flex items-center gap-2"><BookOpen className="w-5 h-5 text-primary" />{t("publicJourney.info.levelsTitle")}</CardTitle></CardHeader><CardContent><div className="grid grid-cols-2 md:grid-cols-3 gap-3">{levels.map((level: any) => (<div key={level.id} className="p-3 rounded-lg bg-muted/50 border text-center"><GraduationCap className="w-6 h-6 text-primary mx-auto mb-2" /><p className="font-medium">{level.name}</p></div>))}</div></CardContent></Card>)}
            <Card><CardHeader><CardTitle>{t("publicJourney.info.faqTitle")}</CardTitle></CardHeader><CardContent><Accordion type="single" collapsible className="w-full"><AccordionItem value="item-1"><AccordionTrigger>{t("publicJourney.info.faq.when.q")}</AccordionTrigger><AccordionContent>{t("publicJourney.info.faq.when.a")}</AccordionContent></AccordionItem><AccordionItem value="item-2"><AccordionTrigger>{t("publicJourney.info.faq.duration.q")}</AccordionTrigger><AccordionContent>{t("publicJourney.info.faq.duration.a")}</AccordionContent></AccordionItem><AccordionItem value="item-3"><AccordionTrigger>{t("publicJourney.info.faq.edit.q")}</AccordionTrigger><AccordionContent>{t("publicJourney.info.faq.edit.a")}</AccordionContent></AccordionItem><AccordionItem value="item-4"><AccordionTrigger>{t("publicJourney.info.faq.payment.q")}</AccordionTrigger><AccordionContent>{t("publicJourney.info.faq.payment.a")}</AccordionContent></AccordionItem></Accordion></CardContent></Card>
          </div>
          <div className="space-y-6">
            <Card><CardHeader><CardTitle className="text-lg">{t("publicJourney.info.contactTitle")}</CardTitle></CardHeader><CardContent className="space-y-4">{tenant.email && (<div className="flex items-start gap-3"><Mail className="w-4 w-4 text-muted-foreground mt-1" /><div><p className="text-sm font-medium">{t("publicJourney.info.email")}</p><a href={`mailto:${tenant.email}`} className="text-sm text-primary hover:underline">{tenant.email}</a></div></div>)}{tenant.phone && (<div className="flex items-start gap-3"><Phone className="w-4 w-4 text-muted-foreground mt-1" /><div><p className="text-sm font-medium">{t("publicJourney.info.phone")}</p><a href={`tel:${tenant.phone}`} className="text-sm text-primary hover:underline">{tenant.phone}</a></div></div>)}{tenant.address && (<div className="flex items-start gap-3"><MapPin className="w-4 w-4 text-muted-foreground mt-1" /><div><p className="text-sm font-medium">{t("publicJourney.info.address")}</p><p className="text-sm text-muted-foreground">{tenant.address}</p></div></div>)}</CardContent></Card>
            <Card className="bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20"><CardContent className="pt-6 text-center"><Users className="w-12 h-12 text-primary mx-auto mb-4" /><h3 className="font-semibold text-lg mb-2">{t("publicJourney.info.readyTitle")}</h3><p className="text-sm text-muted-foreground mb-4">{t("publicJourney.info.readyText")}</p><Link to={`/admissions/${tenantSlug}`}><Button className="w-full" size="lg">{t("publicJourney.info.submitApplication")}<ArrowRight className="w-4 h-4 ml-2" /></Button></Link></CardContent></Card>
          </div>
        </div>
      </div>
      <footer className="bg-muted/50 border-t border-border py-6 mt-8"><div className="container mx-auto px-4 text-center"><p className="text-sm text-muted-foreground">© {new Date().getFullYear()} {tenant.name}. {t("publicJourney.common.rights")}</p></div></footer>
    </div>
  );
};

export default AdmissionInfo;
