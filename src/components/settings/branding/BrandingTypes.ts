export interface BrandingFormData {
    name: string;
    official_name: string;
    logo_url: string;
    primary_color: string;
    secondary_color: string;
    accent_color: string;
    show_logo_text: boolean;
    favicon_url: string;
    sidebar_position: "left" | "right";
    sidebar_layout: "standard" | "compact";
    font_family: string;
    menu_active_color: string;
    menu_bg_color: string;
    tab_active_color: string;
    student_label_mode: "automatic" | "student" | "pupil";
}

export interface BrandingSectionProps {
    formData: BrandingFormData;
    setFormData: (updates: Partial<BrandingFormData> | ((prev: BrandingFormData) => BrandingFormData)) => void;
    isUpdating?: boolean;
}
