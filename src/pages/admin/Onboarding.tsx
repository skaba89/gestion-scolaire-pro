import { SchoolWizard } from "@/components/onboarding/SchoolWizard";
import { OnboardingWizard } from "@/components/onboarding/OnboardingWizard";
import { useTenant } from "@/contexts/TenantContext";

export default function Onboarding() {
    const { tenant, isLoading } = useTenant();

    // Don't show SchoolWizard (creation flow) while the tenant is still
    // resolving — that raced tenant === null with "still loading" and could
    // send an already-onboarded admin into the wrong wizard.
    if (isLoading) {
        return (
            <div className="p-6 text-sm text-muted-foreground">
                Chargement de votre établissement...
            </div>
        );
    }

    // If tenant already exists, use the configuration wizard
    // otherwise use the creation wizard
    if (tenant) {
        return <OnboardingWizard />;
    }

    return <SchoolWizard />;
}
