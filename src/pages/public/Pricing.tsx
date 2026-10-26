import { Link } from "react-router-dom";
import { Check, Zap, Shield, Users, Star, ArrowRight, GraduationCap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  INCLUDED_FEATURES,
  PUBLIC_PLANS,
  SALES_EMAIL,
  TRIAL_DAYS,
  formatEur,
  type PublicPlan,
} from "@/lib/pricing";

// ─── Plan data ────────────────────────────────────────────────────────────────
// Grille du 2026-10-26 : src/lib/pricing.ts (miroir de plan_catalog.py).

function planPrice(plan: PublicPlan) {
  if (plan.priceMonthly === null || plan.priceYearly === null) {
    return { price: "Sur devis", detail: "selon le nombre d'établissements" };
  }
  return {
    price: formatEur(plan.priceMonthly),
    detail: `/ mois — ${formatEur(plan.priceYearly)}/an (2 mois offerts)`,
  };
}

const FAQ = [
  {
    q: "Y a-t-il une offre gratuite ?",
    a: `Non. Chaque établissement dispose de ${TRIAL_DAYS} jours d'essai avec toutes les fonctionnalités (jusqu'à 500 élèves), puis choisit l'offre adaptée à son effectif.`,
  },
  {
    q: "Puis-je changer d'offre à tout moment ?",
    a: "Oui, vous pouvez passer à une offre supérieure quand votre effectif augmente. Une offre doit couvrir le nombre d'élèves inscrits.",
  },
  {
    q: "Y a-t-il des frais d'installation ?",
    a: "Aucun frais caché. Le prix affiché est tout inclus. Nous vous aidons à importer vos données existantes gratuitement.",
  },
  {
    q: "Quels modes de paiement acceptez-vous ?",
    a: "Les prix sont indiqués en euros et se règlent en francs guinéens (GNF) au taux du jour, par Orange Money, MTN MoMo ou virement bancaire. Votre abonnement est activé dès vérification du paiement — aucune carte bancaire requise.",
  },
  {
    q: "Mes données sont-elles sécurisées ?",
    a: "Oui. Chaque établissement dispose d'un espace isolé (multi-tenant RLS PostgreSQL). Les données sont chiffrées en transit et au repos, hébergées en Europe.",
  },
  {
    q: "Puis-je annuler sans pénalité ?",
    a: "Absolument. Annulez à tout moment depuis votre tableau de bord. Votre accès reste actif jusqu'à la fin de la période payée.",
  },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function Pricing() {
  return (
    <div className="min-h-screen bg-white dark:bg-gray-950">
      {/* Nav */}
      <nav className="border-b border-gray-100 dark:border-gray-800 px-6 py-4 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 font-bold text-indigo-700 dark:text-indigo-400 text-lg">
          <GraduationCap className="w-6 h-6" />
          Academy Guinéenne
        </Link>
        <Link to="/auth">
          <Button size="sm">Se connecter</Button>
        </Link>
      </nav>

      {/* Hero */}
      <section className="text-center py-20 px-6">
        <Badge className="mb-4 bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300 hover:bg-indigo-100">
          <Zap className="w-3.5 h-3.5 mr-1" />
          Tarifs simples, sans surprise
        </Badge>
        <h1 className="text-4xl md:text-5xl font-extrabold text-gray-900 dark:text-white mb-4">
          La bonne offre pour chaque{" "}
          <span className="text-indigo-600 dark:text-indigo-400">établissement</span>
        </h1>
        <p className="text-lg text-gray-500 dark:text-gray-400 max-w-xl mx-auto">
          Toutes les fonctionnalités dans chaque offre : seul votre effectif compte.
          {` ${TRIAL_DAYS} jours d'essai, sans carte bancaire.`}
        </p>
      </section>

      {/* Pricing cards */}
      <section className="max-w-7xl mx-auto px-6 pb-20">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-8 items-start">
          {PUBLIC_PLANS.map((plan) => {
            const { price, detail } = planPrice(plan);
            const onQuote = plan.priceMonthly === null;
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
                      Recommandé
                    </Badge>
                  </div>
                )}

                {/* Plan header */}
                <div>
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-1">{plan.name}</h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400">{plan.description}</p>
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
                    <a href={`mailto:${SALES_EMAIL}?subject=${encodeURIComponent("Offre Entreprise")}`}>
                      Nous contacter
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </a>
                  ) : (
                    <Link to="/inscription">
                      {`Essai ${TRIAL_DAYS} jours`}
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </Link>
                  )}
                </Button>

                {/* Feature list */}
                <ul className="space-y-3 pt-2 border-t border-gray-100 dark:border-gray-800">
                  {[plan.students, ...INCLUDED_FEATURES].map((f) => (
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
          Prix en euros, payables en francs guinéens (GNF) au taux du jour par Mobile Money ou virement bancaire.
        </p>
      </section>

      {/* Trust badges */}
      <section className="bg-gray-50 dark:bg-gray-900/50 border-y border-gray-100 dark:border-gray-800 py-14 px-6">
        <div className="max-w-4xl mx-auto">
          <p className="text-center text-sm text-gray-500 dark:text-gray-400 mb-10 uppercase tracking-widest font-medium">
            Pourquoi Academy Guinéenne
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 text-center">
            {[
              { icon: Shield, title: "Données sécurisées", desc: "Isolation complète par établissement, chiffrement TLS, hébergement RGPD." },
              { icon: Users, title: "Adapté à l'Afrique", desc: "Conçu pour les établissements francophones, paiements locaux, multi-devises." },
              { icon: Zap, title: "Prêt en 24h", desc: "Import de vos données existantes, formation incluse, support réactif." },
            ].map(({ icon: Icon, title, desc }) => (
              <div key={title} className="flex flex-col items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center">
                  <Icon className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
                </div>
                <h3 className="font-semibold text-gray-900 dark:text-white">{title}</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="max-w-2xl mx-auto py-20 px-6">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white text-center mb-10">
          Questions fréquentes
        </h2>
        <div className="space-y-6">
          {FAQ.map(({ q, a }) => (
            <div key={q} className="border-b border-gray-100 dark:border-gray-800 pb-6">
              <p className="font-semibold text-gray-900 dark:text-white mb-2">{q}</p>
              <p className="text-sm text-gray-600 dark:text-gray-400">{a}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Footer CTA */}
      <section className="bg-indigo-700 dark:bg-indigo-900 text-white text-center py-16 px-6">
        <h2 className="text-3xl font-bold mb-3">Prêt à moderniser votre établissement ?</h2>
        <p className="text-indigo-200 mb-8 text-lg">
          {`${TRIAL_DAYS} jours d'essai · Sans carte bancaire · Annulable à tout moment`}
        </p>
        <Link to="/inscription">
          <Button size="lg" className="bg-white text-indigo-700 hover:bg-indigo-50 font-semibold h-12 px-8">
            {`Démarrer l'essai de ${TRIAL_DAYS} jours`}
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </Link>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-100 dark:border-gray-800 py-8 px-6 text-center text-xs text-gray-400">
        © {new Date().getFullYear()} Academy Guinéenne ·{" "}
        <Link to="/privacy" className="hover:underline">Confidentialité</Link>
        {" · "}
        <Link to="/terms" className="hover:underline">CGU</Link>
        {" · "}
        <a href={`mailto:${SALES_EMAIL}`} className="hover:underline">Contact</a>
      </footer>
    </div>
  );
}
