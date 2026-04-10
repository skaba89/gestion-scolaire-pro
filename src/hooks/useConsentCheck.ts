import { useState, useEffect } from "react";

// Dummy hook for sovereign architecture
// We'll implement actual consent tracking in the backend later
export function useConsentCheck() {
    const [needsConsent, setNeedsConsent] = useState(false);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        // For now, we assume consent is given or not needed for onboarding
        setNeedsConsent(false);
        setLoading(false);
    }, []);

    const checkConsent = async () => {
        setLoading(false);
    };

    return { needsConsent, loading, recheckConsent: checkConsent };
}
