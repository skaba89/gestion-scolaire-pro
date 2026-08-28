/** Barrel + the shared "section registry": maps a SiteSection's `type` to
 * the component that renders it. Every site template composes its page
 * from this same set — templates differ by which tokens they resolve
 * and which sections they choose/order, not by duplicate components. */
export { Hero } from "./Hero";
export { Text } from "./Text";
export { Stats } from "./Stats";
export { CTA } from "./CTA";
export { Testimonials } from "./Testimonials";
export { FAQ } from "./FAQ";
export { Gallery } from "./Gallery";
export { Carousel } from "./Carousel";
export { ContactForm } from "./ContactForm";
export { ProgramsSection } from "./ProgramsSection";
export { ResultsSection } from "./ResultsSection";
export { SchoolLifeSection } from "./SchoolLifeSection";
export { EventsSection } from "./EventsSection";
export { NewsSection } from "./NewsSection";
export { PremiumNavbar } from "./PremiumNavbar";
export type { NavLink } from "./PremiumNavbar";
export { PremiumFooter } from "./PremiumFooter";
