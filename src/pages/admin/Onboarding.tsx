import { SchoolWizard } from "@/components/onboarding/SchoolWizard";
import { OnboardingWizard } from "@/components/onboarding/OnboardingWizard";
import { useTenant } from "@/contexts/TenantContext";

export default function Onboarding() {
    const { tenant } = useTenant();

    // If tenant already exists, use the configuration wizard
    // otherwise use the creation wizard
    if (tenant) {
        return <OnboardingWizard />;
    }

    return <SchoolWizard />;
}
