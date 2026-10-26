import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Check, Zap, Shield, Users, Star, ArrowRight, GraduationCap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  INCLUDED_FEATURE_KEYS,
  PUBLIC_PLANS,
  SALES_EMAIL,
  TRIAL_DAYS,
  formatEur,
  planLabel,
} from "@/lib/pricing";

// ─── Content ──────────────────────────────────────────────────────────────────
// Grille du 2026-10-26 : src/lib/pricing.ts (miroir de plan_catalog.py) ;
// textes dans les locales (plans.* / pricing.*).

const FAQ_KEYS = ["free", "change", "setup", "payment", "security", "cancel"] as const;

const TRUST = [
  { icon: Shield, key: "secure" },
  { icon: Users, key: "africa" },
  { icon: Zap, key: "ready" },
] as const;

// ─── Component ────────────────────────────────────────────────────────────────

export default function Pricing() {
  const { t, i18n } = useTranslation();
  const days = { days: TRIAL_DAYS };

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950">
      {/* Nav */}
      <nav className="border-b border-gray-100 dark:border-gray-800 px-6 py-4 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 font-bold text-indigo-700 dark:text-indigo-400 text-lg">
          <GraduationCap className="w-6 h-6" />
          Academy Guinéenne
        </Link>
        <Link to="/auth">
          <Button size="sm">{t("pricing.signIn")}</Button>
        </Link>
      </nav>

      {/* Hero */}
      <section className="text-center py-20 px-6">
        <Badge className="mb-4 bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300 hover:bg-indigo-100">
          <Zap className="w-3.5 h-3.5 mr-1" />
          {t("pricing.badge")}
        </Badge>
        <h1 className="text-4xl md:text-5xl font-extrabold text-gray-900 dark:text-white mb-4">
          {t("pricing.heroTitle")}{" "}
          <span className="text-indigo-600 dark:text-indigo-400">{t("pricing.heroHighlight")}</span>
        </h1>
        <p className="text-lg text-gray-500 dark:text-gray-400 max-w-xl mx-auto">
          {t("pricing.heroText", days)}
        </p>
      </section>

      {/* Pricing cards */}
      <section className="max-w-7xl mx-auto px-6 pb-20">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-8 items-start">
          {PUBLIC_PLANS.map((plan) => {
            const { priceMonthly, priceYearly } = plan;
            const onQuote = priceMonthly === null || priceYearly === null;
            const price = onQuote ? t("plans.onQuote") : formatEur(priceMonthly, i18n.language);
            const detail = onQuote
              ? t("pricing.onQuoteDetail")
              : t("pricing.priceDetail", { yearly: formatEur(priceYearly, i18n.language) });
            return (
              <div
                key={plan.slug}
                className={`relative rounded-2xl border p-8 flex flex-col gap-6 transition-shadow ${
                  plan.highlight
                    ? "border-indigo-500 shadow-2xl shadow-indigo-100 dark:shadow-indigo-900/30 bg-white dark:bg-gray-900"
                    : "border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm"
                }`}
              >
                {plan.highlight && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                    <Badge className="bg-indigo-600 text-white hover:bg-indigo-600 px-4 py-1">
                      <Star className="w-3 h-3 mr-1" />
                      {t("pricing.recommended")}
                    </Badge>
                  </div>
                )}

                {/* Plan header */}
                <div>
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-1">{planLabel(t, plan.slug)}</h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400">{t(`plans.description.${plan.slug}`)}</p>
                </div>

                {/* Price */}
                <div className="flex flex-col gap-1">
                  <span className="text-3xl font-extrabold text-gray-900 dark:text-white">{price}</span>
                  <span className="text-sm text-gray-500 dark:text-gray-400">{detail}</span>
                </div>

                {/* CTA */}
                <Button
                  asChild
                  variant={plan.highlight ? "default" : "outline"}
                  className={`w-full h-11 ${plan.highlight ? "bg-indigo-600 hover:bg-indigo-700 text-white" : ""}`}
                >
                  {onQuote ? (
                    <a href={`mailto:${SALES_EMAIL}?subject=${encodeURIComponent(t("pricing.enterpriseSubject"))}`}>
                      {t("pricing.contactUs")}
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </a>
                  ) : (
                    <Link to="/inscription">
                      {t("pricing.trialCta", days)}
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </Link>
                  )}
                </Button>

                {/* Feature list */}
                <ul className="space-y-3 pt-2 border-t border-gray-100 dark:border-gray-800">
                  {[t(`plans.students.${plan.slug}`), ...INCLUDED_FEATURE_KEYS.map((key) => t(key))].map((f) => (
                    <li key={f} className="flex items-start gap-2.5 text-sm text-gray-700 dark:text-gray-300">
                      <Check className="w-4 h-4 text-indigo-500 flex-shrink-0 mt-0.5" />
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
        <p className="text-center text-sm text-gray-500 dark:text-gray-400 mt-8">
          {t("pricing.currencyNote")}
        </p>
      </section>

      {/* Trust badges */}
      <section className="bg-gray-50 dark:bg-gray-900/50 border-y border-gray-100 dark:border-gray-800 py-14 px-6">
        <div className="max-w-4xl mx-auto">
          <p className="text-center text-sm text-gray-500 dark:text-gray-400 mb-10 uppercase tracking-widest font-medium">
            {t("pricing.whyTitle")}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 text-center">
            {TRUST.map(({ icon: Icon, key }) => (
              <div key={key} className="flex flex-col items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center">
                  <Icon className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
                </div>
                <h3 className="font-semibold text-gray-900 dark:text-white">{t(`pricing.trust.${key}Title`)}</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">{t(`pricing.trust.${key}Desc`)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="max-w-2xl mx-auto py-20 px-6">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white text-center mb-10">
          {t("pricing.faqTitle")}
        </h2>
        <div className="space-y-6">
          {FAQ_KEYS.map((key) => (
            <div key={key} className="border-b border-gray-100 dark:border-gray-800 pb-6">
              <p className="font-semibold text-gray-900 dark:text-white mb-2">{t(`pricing.faq.${key}Q`)}</p>
              <p className="text-sm text-gray-600 dark:text-gray-400">{t(`pricing.faq.${key}A`, days)}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Footer CTA */}
      <section className="bg-indigo-700 dark:bg-indigo-900 text-white text-center py-16 px-6">
        <h2 className="text-3xl font-bold mb-3">{t("pricing.ctaTitle")}</h2>
        <p className="text-indigo-200 mb-8 text-lg">
          {t("pricing.ctaText", days)}
        </p>
        <Link to="/inscription">
          <Button size="lg" className="bg-white text-indigo-700 hover:bg-indigo-50 font-semibold h-12 px-8">
            {t("pricing.ctaButton", days)}
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </Link>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-100 dark:border-gray-800 py-8 px-6 text-center text-xs text-gray-400">
        © {new Date().getFullYear()} Academy Guinéenne ·{" "}
        <Link to="/privacy" className="hover:underline">{t("pricing.privacy")}</Link>
        {" · "}
        <Link to="/terms" className="hover:underline">{t("pricing.terms")}</Link>
        {" · "}
        <a href={`mailto:${SALES_EMAIL}`} className="hover:underline">{t("pricing.contact")}</a>
      </footer>
    </div>
  );
}
