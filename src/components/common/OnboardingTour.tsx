import { useEffect } from "react";
import { useOnboardingStore } from "@/hooks/useOnboarding";

const TOUR_STEPS = [
  {
    element: "[data-tour='sidebar']",
    popover: {
      title: "Navigation principale",
      description:
        "Accédez à toutes les fonctionnalités depuis ce menu : élèves, enseignants, notes, emplois du temps et bien plus.",
      side: "right" as const,
      align: "start" as const,
    },
  },
  {
    element: "[data-tour='dashboard']",
    popover: {
      title: "Tableau de bord",
      description:
        "Visualisez en un coup d'œil les indicateurs clés de votre établissement : inscriptions, présences, notes moyennes.",
      side: "bottom" as const,
    },
  },
  {
    element: "[data-tour='students']",
    popover: {
      title: "Gestion des élèves",
      description:
        "Gérez les dossiers élèves, suivez les absences, consultez les bulletins et communiquez avec les familles.",
      side: "right" as const,
    },
  },
  {
    element: "[data-tour='messages']",
    popover: {
      title: "Messagerie intégrée",
      description:
        "Communiquez en toute sécurité avec les élèves, parents et enseignants.",
      side: "right" as const,
    },
  },
  {
    element: "[data-tour='notifications']",
    popover: {
      title: "Notifications",
      description:
        "Soyez alerté des absences, nouvelles inscriptions et messages importants en temps réel.",
      side: "bottom" as const,
    },
  },
  {
    element: "[data-tour='settings']",
    popover: {
      title: "Paramètres",
      description:
        "Configurez votre établissement : logo, couleurs, modules, sécurité et permissions des utilisateurs.",
      side: "right" as const,
    },
  },
];

/**
 * Headless onboarding tour powered by driver.js.
 * Renders nothing itself — driver.js manages its own DOM overlay.
 *
 * Activate by setting `isActive = true` in the onboarding store.
 */
export function OnboardingTour() {
  const { isActive, completeTour, skipTour } = useOnboardingStore();

  useEffect(() => {
    if (!isActive) return;

    let driverInstance: { destroy: () => void; drive: () => void } | null = null;

    import("driver.js")
      .then(({ driver }) => {
        driverInstance = driver({
          showProgress: true,
          progressText: "Étape {{current}} sur {{total}}",
          nextBtnText: "Suivant →",
          prevBtnText: "← Précédent",
          doneBtnText: "Terminer ✓",
          animate: true,
          overlayOpacity: 0.55,
          smoothScroll: true,
          onDestroyStarted: () => {
            // Called when user clicks the × or presses Escape
            skipTour();
          },
          onDestroyed: () => {
            completeTour();
          },
          steps: TOUR_STEPS.map((step) => ({
            element: step.element,
            popover: step.popover,
          })),
        });

        // Only start if at least the first target exists in the DOM
        if (document.querySelector(TOUR_STEPS[0].element)) {
          driverInstance.drive();
        } else {
          // Elements not rendered (wrong page) — silently skip
          completeTour();
        }
      })
      .catch(() => {
        // driver.js not installed — skip silently
        completeTour();
      });

    return () => {
      try {
        driverInstance?.destroy();
      } catch {
        // Ignore cleanup errors
      }
    };
  }, [isActive, completeTour, skipTour]);

  return null;
}

export default OnboardingTour;
