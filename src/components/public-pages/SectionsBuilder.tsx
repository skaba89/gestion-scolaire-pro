import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Plus,
  Pencil,
  Trash2,
  ChevronUp,
  ChevronDown,
  GripVertical,
  LayoutTemplate,
} from "lucide-react";
import type { PublicPageSection } from "@/hooks/usePublicPages";
import {
  SECTION_TYPES,
  getSectionTypeConfig,
  emptySection,
  sectionPreviewLabel,
  type FieldConfig,
} from "@/lib/publicPageSectionTypes";

interface SectionsBuilderProps {
  sections: PublicPageSection[];
  onChange: (sections: PublicPageSection[]) => void;
}

/**
 * Visual widget builder for a public page's content — replaces what used
 * to be a raw JSON textarea (placeholder even showed a shape,
 * {"hero": {...}, "sections": []}, that didn't match what the page
 * renderer actually reads: an array of sections). A non-technical school
 * admin was never going to hand-write that JSON correctly.
 */
export function SectionsBuilder({ sections, onChange }: SectionsBuilderProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [draft, setDraft] = useState<PublicPageSection | null>(null);

  const move = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= sections.length) return;
    const next = [...sections];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  const remove = (index: number) => {
    onChange(sections.filter((_, i) => i !== index));
  };

  const startAdd = (type: string) => {
    setDraft(emptySection(type));
    setEditingIndex(sections.length);
    setPickerOpen(false);
  };

  const startEdit = (index: number) => {
    setDraft(JSON.parse(JSON.stringify(sections[index])));
    setEditingIndex(index);
  };

  const saveDraft = () => {
    if (!draft || editingIndex === null) return;
    const next = [...sections];
    next[editingIndex] = draft;
    onChange(next);
    setEditingIndex(null);
    setDraft(null);
  };

  return (
    <div className="space-y-3">
      {sections.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 gap-3 border-2 border-dashed rounded-xl text-muted-foreground">
          <LayoutTemplate className="w-8 h-8 opacity-40" />
          <p className="text-sm">Cette page n'a encore aucun contenu.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {sections.map((section, i) => {
            const cfg = getSectionTypeConfig(section.type);
            return (
              <Card key={i} className="border-muted-foreground/15">
                <CardContent className="p-3 flex items-center gap-3">
                  <GripVertical className="w-4 h-4 text-muted-foreground/50 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                        {cfg.label}
                      </span>
                    </div>
                    <p className="text-sm font-medium truncate mt-1">{sectionPreviewLabel(section)}</p>
                  </div>
                  <div className="flex items-center gap-0.5 flex-shrink-0">
                    <Button variant="ghost" size="icon" className="h-8 w-8" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Déplacer le widget vers le haut">
                      <ChevronUp className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" disabled={i === sections.length - 1} onClick={() => move(i, 1)} aria-label="Déplacer le widget vers le bas">
                      <ChevronDown className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => startEdit(i)} aria-label="Modifier ce widget">
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => remove(i)} aria-label="Supprimer ce widget">
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Button type="button" variant="outline" className="w-full" onClick={() => setPickerOpen(true)}>
        <Plus className="w-4 h-4 mr-2" />
        Ajouter un widget
      </Button>

      {/* Type picker */}
      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Choisir un type de widget</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[60vh] overflow-y-auto">
            {SECTION_TYPES.map((t) => (
              <button
                key={t.type}
                type="button"
                onClick={() => startAdd(t.type)}
                className="text-left p-4 rounded-xl border hover:border-primary hover:bg-primary/5 transition-colors"
              >
                <p className="font-semibold text-sm">{t.label}</p>
                <p className="text-xs text-muted-foreground mt-1">{t.description}</p>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={editingIndex !== null} onOpenChange={(open) => { if (!open) { setEditingIndex(null); setDraft(null); } }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          {draft && (
            <>
              <DialogHeader>
                <DialogTitle>{getSectionTypeConfig(draft.type).label}</DialogTitle>
              </DialogHeader>
              <SectionForm draft={draft} onChange={setDraft} />
              <DialogFooter>
                <Button variant="outline" onClick={() => { setEditingIndex(null); setDraft(null); }}>
                  Annuler
                </Button>
                <Button onClick={saveDraft}>Enregistrer</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SectionForm({
  draft,
  onChange,
}: {
  draft: PublicPageSection;
  onChange: (s: PublicPageSection) => void;
}) {
  const cfg = getSectionTypeConfig(draft.type);
  const settings = (draft.settings || {}) as Record<string, any>;
  const items = (draft.items || []) as Record<string, any>[];

  const setField = (key: string, value: any) => onChange({ ...draft, [key]: value });
  const setSetting = (key: string, value: any) =>
    onChange({ ...draft, settings: { ...settings, [key]: value } });

  const addItem = () => onChange({ ...draft, items: [...items, {}] });
  const removeItem = (i: number) => onChange({ ...draft, items: items.filter((_, idx) => idx !== i) });
  const updateItem = (i: number, key: string, value: any) => {
    const next = [...items];
    next[i] = { ...next[i], [key]: value };
    onChange({ ...draft, items: next });
  };
  const moveItem = (i: number, dir: -1 | 1) => {
    const target = i + dir;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    [next[i], next[target]] = [next[target], next[i]];
    onChange({ ...draft, items: next });
  };

  return (
    <div className="space-y-4">
      {cfg.hasTitle && (
        <div className="space-y-1.5">
          <Label>Titre</Label>
          <Input value={draft.title || ""} onChange={(e) => setField("title", e.target.value)} />
        </div>
      )}
      {cfg.hasSubtitle && (
        <div className="space-y-1.5">
          <Label>Sous-titre</Label>
          <Input value={draft.subtitle || ""} onChange={(e) => setField("subtitle", e.target.value)} />
        </div>
      )}
      {cfg.content && (
        <div className="space-y-1.5">
          <Label>{cfg.content.label}</Label>
          <Textarea
            rows={cfg.content.kind === "html" ? 8 : 4}
            className={cfg.content.kind === "html" ? "font-mono text-xs" : undefined}
            value={draft.content || ""}
            onChange={(e) => setField("content", e.target.value)}
          />
          {cfg.content.kind === "html" && (
            <p className="text-xs text-muted-foreground">
              Le HTML est nettoyé automatiquement à l'affichage (balises dangereuses retirées).
            </p>
          )}
        </div>
      )}

      {cfg.settingsFields.length > 0 && (
        <div className="space-y-3 rounded-lg border p-3 bg-muted/30">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Options</p>
          {cfg.settingsFields.map((f) => (
            <FieldInput
              key={f.key}
              field={f}
              value={settings[f.key]}
              onChange={(v) => setSetting(f.key, v)}
            />
          ))}
        </div>
      )}

      {cfg.itemFields && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>{cfg.itemLabel || "Éléments"} ({items.length})</Label>
            <Button type="button" size="sm" variant="outline" onClick={addItem}>
              <Plus className="w-3.5 h-3.5 mr-1" />
              Ajouter
            </Button>
          </div>
          <div className="space-y-3">
            {items.map((item, i) => (
              <div key={i} className="rounded-lg border p-3 space-y-2 relative">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">#{i + 1}</span>
                  <div className="flex items-center gap-0.5">
                    <Button type="button" variant="ghost" size="icon" className="h-6 w-6" disabled={i === 0} onClick={() => moveItem(i, -1)} aria-label="Déplacer cet élément vers le haut">
                      <ChevronUp className="w-3.5 h-3.5" />
                    </Button>
                    <Button type="button" variant="ghost" size="icon" className="h-6 w-6" disabled={i === items.length - 1} onClick={() => moveItem(i, 1)} aria-label="Déplacer cet élément vers le bas">
                      <ChevronDown className="w-3.5 h-3.5" />
                    </Button>
                    <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeItem(i)} aria-label="Supprimer cet élément">
                      <Trash2 className="w-3.5 h-3.5 text-destructive" />
                    </Button>
                  </div>
                </div>
                {cfg.itemFields!.map((f) => (
                  <FieldInput
                    key={f.key}
                    field={f}
                    value={item[f.key]}
                    onChange={(v) => updateItem(i, f.key, v)}
                    compact
                  />
                ))}
              </div>
            ))}
            {items.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-3">Aucun élément — cliquez "Ajouter".</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function FieldInput({
  field,
  value,
  onChange,
  compact,
}: {
  field: FieldConfig;
  value: any;
  onChange: (v: any) => void;
  compact?: boolean;
}) {
  const labelClass = compact ? "text-xs" : "text-sm";

  if (field.kind === "checkbox") {
    return (
      <div className="flex items-center gap-2">
        <Checkbox checked={!!value} onCheckedChange={(v) => onChange(!!v)} id={`f-${field.key}`} />
        <label htmlFor={`f-${field.key}`} className={labelClass}>{field.label}</label>
      </div>
    );
  }

  if (field.kind === "select" || field.kind === "icon") {
    return (
      <div className="space-y-1">
        <Label className={labelClass}>{field.label}</Label>
        <Select value={value || undefined} onValueChange={onChange}>
          <SelectTrigger className={compact ? "h-8 text-xs" : undefined}>
            <SelectValue placeholder="—" />
          </SelectTrigger>
          <SelectContent>
            {(field.options || []).map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  if (field.kind === "textarea") {
    return (
      <div className="space-y-1">
        <Label className={labelClass}>{field.label}</Label>
        <Textarea
          rows={compact ? 2 : 3}
          className={compact ? "text-xs" : undefined}
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <Label className={labelClass}>{field.label}</Label>
      <Input
        className={compact ? "h-8 text-xs" : undefined}
        placeholder={field.placeholder}
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
