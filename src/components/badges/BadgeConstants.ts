export interface BadgeTemplate {
    id: string;
    name: string;
    description: string;
    orientation: "portrait" | "landscape";
}

export const BADGE_TEMPLATES: BadgeTemplate[] = [
    { id: "standard", name: "Vertical Standard", description: "Format portrait classique", orientation: "portrait" },
    { id: "premium", name: "Premium Gold", description: "Design élégant avec accents dorés", orientation: "portrait" },
    { id: "university", name: "Université Moderne", description: "Format académique épuré", orientation: "portrait" },
    { id: "classic", name: "Horizontal ID", description: "Format carte d'identité paysage", orientation: "landscape" },
    { id: "compact", name: "Compact Luxe", description: "Format paysage minimaliste", orientation: "landscape" },
    { id: "modern", name: "Moderne", description: "Design épuré avec accent couleur", orientation: "portrait" },
    { id: "minimal", name: "Minimaliste", description: "Noir et blanc simple", orientation: "landscape" },
];

export interface BadgeProps {
    student: {
        first_name: string;
        last_name: string;
        photo_url: string | null;
        registration_number: string | null;
        classroomName?: string;
        levelName?: string;
    };
    badge: {
        badge_code: string;
        qr_code_data: string;
        date_expiry?: string;
    };
    tenant: {
        name: string;
        logo_url?: string | null;
        address?: string;
    };
    academicYear?: string;
}
