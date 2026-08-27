import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import type { DesignTokens } from "../theme/tokens";
import { withAlpha } from "../theme/tokens";
import type { FAQSectionData } from "../types/sections";

interface FAQProps {
  section: FAQSectionData;
  tokens: DesignTokens;
}

export function FAQ({ section, tokens }: FAQProps) {
  const items = section.items || [];
  if (items.length === 0) return null;

  return (
    <section style={{ paddingTop: tokens.sectionSpacingY, paddingBottom: tokens.sectionSpacingY }}>
      <div className="mx-auto px-4 sm:px-6 lg:px-8" style={{ maxWidth: "48rem" }}>
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
        <Accordion type="single" collapsible className="space-y-3">
          {items.map((item, i) => (
            <AccordionItem
              key={i}
              value={`item-${i}`}
              className="border px-5"
              style={{ borderColor: withAlpha(tokens.primaryColor, 0.12), borderRadius: tokens.borderRadius }}
            >
              <AccordionTrigger className="text-left font-semibold hover:no-underline" style={{ color: tokens.textColor }}>
                {item.question}
              </AccordionTrigger>
              <AccordionContent className="leading-relaxed" style={{ color: tokens.mutedColor }}>
                {item.answer}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}
