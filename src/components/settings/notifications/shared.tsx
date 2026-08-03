import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Eye, EyeOff, ExternalLink, ChevronDown, ChevronUp } from "lucide-react";

// Extracted from NotificationSettings.tsx so the WhatsApp section (which
// reads/writes via the dedicated, secret-safe /notifications/settings/
// endpoint) can reuse the exact same look as the other channels instead of
// duplicating these two components.

export const SecretInput = ({
  id, label, value, onChange, placeholder, hint,
}: {
  id: string; label: string; value: string;
  onChange: (v: string) => void; placeholder?: string; hint?: string;
}) => {
  const [show, setShow] = useState(false);
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="pr-10 font-mono text-sm"
          autoComplete="off"
        />
        <button
          type="button"
          onClick={() => setShow(!show)}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        >
          {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
};

export const ChannelSection = ({
  icon, title, badge, badgeColor, description, docsUrl, children, defaultOpen = false,
}: {
  icon: React.ReactNode; title: string; badge?: string; badgeColor?: string;
  description: string; docsUrl?: string; children: React.ReactNode; defaultOpen?: boolean;
}) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 p-4 hover:bg-muted/30 transition-colors text-left"
      >
        <div className="flex-1 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
            {icon}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-medium">{title}</span>
              {badge && (
                <Badge variant="outline" className={`text-xs ${badgeColor}`}>
                  {badge}
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">{description}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {docsUrl && (
            <a
              href={docsUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="text-xs text-primary hover:underline flex items-center gap-1"
            >
              Docs <ExternalLink className="w-3 h-3" />
            </a>
          )}
          {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </div>
      </button>
      {open && (
        <div className="px-4 pb-4 border-t bg-muted/10 pt-4 space-y-4">
          {children}
        </div>
      )}
    </div>
  );
};
