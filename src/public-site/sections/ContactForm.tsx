import { useState } from "react";
import { Send } from "lucide-react";
import { apiClient } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { DesignTokens } from "../theme/tokens";
import { withAlpha } from "../theme/tokens";
import type { ContactFormSectionData } from "../types/sections";

interface ContactFormProps {
  section: ContactFormSectionData;
  tokens: DesignTokens;
  tenantSlug: string;
}

/** Same wire contract as PublicPageView.tsx's ContactFormSection —
 * POST /tenants/public/:slug/submit-form/, honeypot `website` field,
 * server persists + notifies. Not a stub. */
export function ContactForm({ section, tokens, tenantSlug }: ContactFormProps) {
  const [formData, setFormData] = useState({ name: "", email: "", phone: "", subject: "", message: "", website: "" });
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await apiClient.post(`/tenants/public/${tenantSlug}/submit-form/`, {
        name: formData.name,
        email: formData.email,
        phone: formData.phone || undefined,
        subject: formData.subject || undefined,
        message: formData.message,
        website: formData.website || undefined,
      });
      setSubmitted(true);
    } catch {
      setError("Une erreur est survenue. Merci de réessayer ou de nous contacter directement.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section
      style={{
        backgroundColor: withAlpha(tokens.primaryColor, 0.03),
        paddingTop: tokens.sectionSpacingY,
        paddingBottom: tokens.sectionSpacingY,
      }}
    >
      <div className="mx-auto px-4 sm:px-6 lg:px-8" style={{ maxWidth: "42rem" }}>
        {(section.title || section.subtitle) && (
          <div className="text-center mb-10">
            {section.title && (
              <h2
                className="text-3xl md:text-4xl font-bold mb-3"
                style={{ color: tokens.textColor, fontFamily: tokens.fontHeading }}
              >
                {section.title}
              </h2>
            )}
            {section.subtitle && <p style={{ color: tokens.mutedColor }}>{section.subtitle}</p>}
          </div>
        )}

        {submitted ? (
          <div
            className="bg-white p-8 md:p-12 text-center border"
            style={{ borderColor: withAlpha(tokens.primaryColor, 0.1), borderRadius: tokens.borderRadius }}
          >
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6"
              style={{ backgroundColor: withAlpha(tokens.primaryColor, 0.1) }}
            >
              <Send className="w-8 h-8" style={{ color: tokens.primaryColor }} />
            </div>
            <h3 className="text-xl font-bold mb-2" style={{ color: tokens.textColor }}>Message envoyé !</h3>
            <p style={{ color: tokens.mutedColor }}>
              Merci pour votre message. Nous vous répondrons dans les plus brefs délais.
            </p>
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="bg-white p-6 md:p-10 border"
            style={{ borderColor: withAlpha(tokens.primaryColor, 0.1), borderRadius: tokens.borderRadius }}
          >
            {/* Honeypot: visually hidden, out of tab order — a real visitor
                never fills this in; see PublicPageView.tsx's identical
                pattern for the full rationale. */}
            <div className="absolute w-px h-px overflow-hidden opacity-0 -z-10" style={{ left: "-9999px" }} aria-hidden="true">
              <label htmlFor="cf-website">Ne pas remplir ce champ</label>
              <input
                id="cf-website"
                name="website"
                type="text"
                tabIndex={-1}
                autoComplete="off"
                value={formData.website}
                onChange={(e) => setFormData({ ...formData, website: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5">
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: tokens.textColor }}>
                  Nom complet <span className="text-red-500">*</span>
                </label>
                <Input required placeholder="Votre nom" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: tokens.textColor }}>
                  Email <span className="text-red-500">*</span>
                </label>
                <Input required type="email" placeholder="votre@email.com" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: tokens.textColor }}>Téléphone</label>
                <Input type="tel" placeholder="+224 6XX XX XX XX" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: tokens.textColor }}>
                  Sujet <span className="text-red-500">*</span>
                </label>
                <Input required placeholder="Sujet de votre message" value={formData.subject} onChange={(e) => setFormData({ ...formData, subject: e.target.value })} />
              </div>
            </div>
            <div className="mt-4 md:mt-5">
              <label className="block text-sm font-medium mb-1.5" style={{ color: tokens.textColor }}>
                Message <span className="text-red-500">*</span>
              </label>
              <Textarea required rows={5} placeholder="Décrivez votre demande..." value={formData.message} onChange={(e) => setFormData({ ...formData, message: e.target.value })} />
            </div>
            {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
            <Button
              type="submit"
              disabled={submitting}
              className="w-full mt-6 h-12 text-base font-semibold hover:shadow-lg transition-all disabled:opacity-60"
              style={{ backgroundColor: tokens.primaryColor, color: "white", borderRadius: tokens.buttonRadius }}
            >
              <Send className="w-5 h-5" />
              {submitting ? "Envoi..." : "Envoyer le message"}
            </Button>
          </form>
        )}
      </div>
    </section>
  );
}
