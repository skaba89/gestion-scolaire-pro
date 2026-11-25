import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useMutation } from "@tanstack/react-query";
import { usePublicTenant } from "@/hooks/usePublicTenant";
import { apiClient } from "@/api/client";
import { resolveUploadUrl } from "@/utils/url";
import { tenantHeroStyle } from "@/utils/tenantBranding";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { 
  GraduationCap, 
  ArrowLeft,
  MapPin,
  Phone,
  Mail,
  Globe,
  Clock,
  ChevronRight,
  Loader2,
  UserPlus,
  Send,
  CheckCircle,
  MessageSquare
} from "lucide-react";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { toast } from "sonner";
import { z } from "zod";

const contactSchema = z.object({
  name: z.string().trim().min(2, "publicJourney.contact.errors.name").max(100),
  email: z.string().trim().email("publicJourney.contact.errors.email").max(255),
  phone: z.string().optional(),
  subject: z.string().trim().min(3, "publicJourney.contact.errors.subject").max(200),
  message: z.string().trim().min(10, "publicJourney.contact.errors.message").max(2000),
});

type ContactFormData = z.infer<typeof contactSchema>;

const Contact = () => {
  const { tenantSlug } = useParams<{ tenantSlug: string }>();
  const { t } = useTranslation();
  const [submitted, setSubmitted] = useState(false);
  const [formData, setFormData] = useState<ContactFormData>({ name: "", email: "", phone: "", subject: "", message: "" });
  // Pot de miel : champ invisible qu'un visiteur ne remplit jamais (même schéma que ContactForm).
  const [honeypot, setHoneypot] = useState("");
  const [errors, setErrors] = useState<Partial<Record<keyof ContactFormData, string>>>({});

  const { data: tenant, isLoading: tenantLoading } = usePublicTenant(tenantSlug);

  const submitMutation = useMutation({
    // CONTACT-FAKE-SEND-01 (2026-11-25) : le message était « envoyé » après une simple attente, sans
    // jamais quitter le navigateur. Il part désormais vers la route déjà utilisée par les autres
    // formulaires de contact (pot de miel, limite de débit, consentement RGPD) et arrive dans
    // « Messages reçus » de l'établissement.
    mutationFn: async (data: ContactFormData) => {
      await apiClient.post(`/tenants/public/${encodeURIComponent(tenantSlug ?? "")}/submit-form/`, {
        name: data.name,
        email: data.email,
        phone: data.phone || undefined,
        subject: data.subject,
        message: data.message,
        website: honeypot || undefined,
      });
      return data;
    },
    onSuccess: () => { setSubmitted(true); toast.success(t("publicJourney.contact.sent")); },
    onError: () => { toast.error(t("publicJourney.contact.sendError")); },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const result = contactSchema.safeParse(formData);
    if (!result.success) {
      const fieldErrors: Partial<Record<keyof ContactFormData, string>> = {};
      result.error.issues.forEach((err) => { if (err.path[0]) { fieldErrors[err.path[0] as keyof ContactFormData] = err.message; } });
      setErrors(fieldErrors);
      return;
    }
    setErrors({});
    submitMutation.mutate(result.data);
  };

  const updateField = (field: keyof ContactFormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) { setErrors(prev => ({ ...prev, [field]: undefined })); }
  };

  if (tenantLoading) {
    return (<div className="min-h-screen flex items-center justify-center bg-background"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>);
  }

  if (!tenant) {
    return (<div className="min-h-screen flex flex-col items-center justify-center bg-background"><h1 className="text-2xl font-bold text-foreground mb-4">{t("publicJourney.contact.notFound")}</h1><Link to="/"><Button variant="outline"><ArrowLeft className="w-4 w-4 mr-2" />{t("publicJourney.contact.backHome")}</Button></Link></div>);
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-background">
        <header className="bg-gradient-hero text-primary-foreground" style={tenantHeroStyle(tenant.landing)}><div className="container mx-auto px-4 py-4"><div className="flex items-center justify-between"><Link to={`/ecole/${tenantSlug}`} className="flex items-center gap-3">{tenant.landing?.logo_url ? (<img src={resolveUploadUrl(tenant.landing.logo_url)} alt={tenant.name} className="h-12 w-auto object-contain" />) : (<div className="h-12 w-12 rounded-lg bg-primary-foreground/20 flex items-center justify-center"><GraduationCap className="w-6 h-6" /></div>)}<span className="font-display font-bold text-xl hidden sm:block">{tenant.name}</span></Link><LanguageSwitcher /></div></div></header>
        <div className="container mx-auto px-4 py-20"><Card className="max-w-lg mx-auto text-center"><CardContent className="p-12"><div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center mx-auto mb-6"><CheckCircle className="w-8 h-8 text-green-500" /></div><h1 className="text-2xl font-display font-bold text-foreground mb-4">{t("publicJourney.contact.sentTitle")}</h1><p className="text-muted-foreground mb-6">{t("publicJourney.contact.sentText")}</p><Link to={`/ecole/${tenantSlug}`}><Button><ArrowLeft className="w-4 h-4 mr-2" />{t("publicJourney.contact.backHome")}</Button></Link></CardContent></Card></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-gradient-hero text-primary-foreground" style={tenantHeroStyle(tenant.landing)}><div className="container mx-auto px-4 py-4"><div className="flex items-center justify-between"><Link to={`/ecole/${tenantSlug}`} className="flex items-center gap-3">{tenant.landing?.logo_url ? (<img src={resolveUploadUrl(tenant.landing.logo_url)} alt={tenant.name} className="h-12 w-auto object-contain" />) : (<div className="h-12 w-12 rounded-lg bg-primary-foreground/20 flex items-center justify-center"><GraduationCap className="w-6 h-6" /></div>)}<span className="font-display font-bold text-xl hidden sm:block">{tenant.name}</span></Link><div className="flex items-center gap-4"><LanguageSwitcher /><Link to={`/admissions/${tenantSlug}`}><Button className="bg-sky hover:bg-sky/90"><UserPlus className="w-4 h-4 mr-2" />{t("publicJourney.contact.apply")}</Button></Link></div></div></div></header>
      <div className="bg-muted/50 border-b"><div className="container mx-auto px-4 py-3"><nav className="flex items-center gap-2 text-sm"><Link to={`/ecole/${tenantSlug}`} className="text-muted-foreground hover:text-foreground">{t("publicJourney.contact.home")}</Link><ChevronRight className="w-4 w-4 text-muted-foreground" /><span className="text-foreground font-medium">{t("publicJourney.contact.breadcrumb")}</span></nav></div></div>
      <section className="bg-gradient-to-b from-muted/50 to-background py-16"><div className="container mx-auto px-4"><div className="max-w-3xl"><h1 className="text-4xl md:text-5xl font-display font-bold text-foreground mb-4">{t("publicJourney.contact.title")}</h1><p className="text-lg text-muted-foreground">{t("publicJourney.contact.intro")}</p></div></div></section>
      <div className="container mx-auto px-4 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2"><Card><CardHeader><CardTitle className="flex items-center gap-2"><MessageSquare className="w-5 h-5" />{t("publicJourney.contact.formTitle")}</CardTitle></CardHeader><CardContent><form onSubmit={handleSubmit} className="space-y-6"><div className="absolute w-px h-px overflow-hidden opacity-0 -z-10" style={{ left: "-9999px" }} aria-hidden="true"><label htmlFor="contact-website">{t("publicJourney.contactForm.honeypot")}</label><input id="contact-website" name="website" type="text" tabIndex={-1} autoComplete="off" value={honeypot} onChange={(e) => setHoneypot(e.target.value)} /></div><div className="grid grid-cols-1 md:grid-cols-2 gap-4"><div className="space-y-2"><Label htmlFor="name">{t("publicJourney.contact.name")}</Label><Input id="name" value={formData.name} onChange={(e) => updateField("name", e.target.value)} placeholder={t("publicJourney.contact.namePlaceholder")} className={errors.name ? "border-destructive" : ""} />{errors.name && <p className="text-sm text-destructive">{t(errors.name)}</p>}</div><div className="space-y-2"><Label htmlFor="email">{t("publicJourney.contact.email")}</Label><Input id="email" type="email" value={formData.email} onChange={(e) => updateField("email", e.target.value)} placeholder="votre@email.com" className={errors.email ? "border-destructive" : ""} />{errors.email && <p className="text-sm text-destructive">{t(errors.email)}</p>}</div></div><div className="grid grid-cols-1 md:grid-cols-2 gap-4"><div className="space-y-2"><Label htmlFor="phone">{t("publicJourney.contact.phone")}</Label><Input id="phone" type="tel" value={formData.phone} onChange={(e) => updateField("phone", e.target.value)} placeholder="+33 6 00 00 00 00" /></div><div className="space-y-2"><Label htmlFor="subject">{t("publicJourney.contact.subject")}</Label><Input id="subject" value={formData.subject} onChange={(e) => updateField("subject", e.target.value)} placeholder={t("publicJourney.contact.subjectPlaceholder")} className={errors.subject ? "border-destructive" : ""} />{errors.subject && <p className="text-sm text-destructive">{t(errors.subject)}</p>}</div></div><div className="space-y-2"><Label htmlFor="message">{t("publicJourney.contact.message")}</Label><Textarea id="message" value={formData.message} onChange={(e) => setFormData({ ...formData, message: e.target.value })} placeholder={t("publicJourney.contact.messagePlaceholder")} rows={6} className={errors.message ? "border-destructive" : ""} />{errors.message && <p className="text-sm text-destructive">{t(errors.message)}</p>}</div><Button type="submit" className="w-full md:w-auto" disabled={submitMutation.isPending}>{submitMutation.isPending ? (<><Loader2 className="w-4 w-4 mr-2 animate-spin" />{t("publicJourney.contact.sending")}</>) : (<><Send className="w-4 w-4 mr-2" />{t("publicJourney.contact.send")}</>)}</Button></form></CardContent></Card></div>
          <div className="space-y-6">
            <Card><CardHeader><CardTitle>{t("publicJourney.contact.infoTitle")}</CardTitle></CardHeader><CardContent className="space-y-4">{tenant.address && (<div className="flex items-start gap-3"><div className="p-2 rounded-lg bg-muted"><MapPin className="w-4 h-4 text-muted-foreground" /></div><div><p className="font-medium text-sm text-foreground">{t("publicJourney.contact.address")}</p><p className="text-sm text-muted-foreground">{tenant.address}</p></div></div>)}{tenant.phone && (<div className="flex items-start gap-3"><div className="p-2 rounded-lg bg-muted"><Phone className="w-4 h-4 text-muted-foreground" /></div><div><p className="font-medium text-sm text-foreground">{t("publicJourney.contact.phone")}</p><a href={`tel:${tenant.phone}`} className="text-sm text-primary hover:underline">{tenant.phone}</a></div></div>)}{tenant.email && (<div className="flex items-start gap-3"><div className="p-2 rounded-lg bg-muted"><Mail className="w-4 h-4 text-muted-foreground" /></div><div><p className="font-medium text-sm text-foreground">{t("publicJourney.contact.emailLabel")}</p><a href={`mailto:${tenant.email}`} className="text-sm text-primary hover:underline">{tenant.email}</a></div></div>)}{tenant.website && (<div className="flex items-start gap-3"><div className="p-2 rounded-lg bg-muted"><Globe className="w-4 h-4 text-muted-foreground" /></div><div><p className="font-medium text-sm text-foreground">{t("publicJourney.contact.website")}</p><a href={tenant.website} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline">{tenant.website.replace(/^https?:\/\//, '')}</a></div></div>)}</CardContent></Card>
            {/* Horaires publiés par l'établissement (landing.opening_hours) ; plus d'horaires inventés. */}
            {tenant.landing?.opening_hours && (<Card className="bg-muted/50"><CardContent className="p-6"><div className="flex items-center gap-3 mb-3"><Clock className="w-5 h-5 text-muted-foreground" /><h3 className="font-semibold text-foreground">{t("publicJourney.contact.hours")}</h3></div><p className="text-sm text-foreground whitespace-pre-line">{tenant.landing.opening_hours}</p></CardContent></Card>)}
            <Card className="bg-gradient-primary text-primary-foreground border-0"><CardContent className="p-6 text-center"><UserPlus className="w-8 h-8 mx-auto mb-3 opacity-80" /><h3 className="font-semibold mb-2">{t("publicJourney.contact.readyTitle")}</h3><p className="text-sm text-primary-foreground/80 mb-4">{t("publicJourney.contact.readyText")}</p><Link to={`/admissions/${tenantSlug}`}><Button className="w-full bg-sky hover:bg-sky/90">{t("publicJourney.contact.applyNow")}</Button></Link></CardContent></Card>
          </div>
        </div>
      </div>
      <footer className="bg-card border-t border-border py-8"><div className="container mx-auto px-4 text-center"><p className="text-sm text-muted-foreground">© {new Date().getFullYear()} {tenant.name}. {t("publicJourney.common.rights")}</p></div></footer>
    </div>
  );
};

export default Contact;
