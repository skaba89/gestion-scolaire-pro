import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Globe,
  Eye,
  Save,
  Image,
  Palette,
  Megaphone,
  Camera,
  Share2,
  Settings,
  Plus,
  Trash2,
  Pin,
  Edit3,
  ChevronDown,
  ChevronUp,
  X,
  Loader2,
  School,
  ExternalLink,
} from "lucide-react";
import { apiClient } from "@/api/client";
import { useAuth } from "@/contexts/AuthContext";
import { resolveUploadUrl } from "@/utils/url";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Announcement {
  id: string;
  title: string;
  content: string;
  date: string;
  pinned: boolean;
  category: string;
}

interface LandingSettings {
  // Général
  name?: string;
  tagline?: string;
  description?: string;
  motto?: string;
  opening_hours?: string;
  founded_year?: number | string;
  accreditation?: string;
  // Médias
  logo_url?: string;
  banner_url?: string;
  // Couleurs
  primary_color?: string;
  secondary_color?: string;
  // Annonces
  announcements?: Announcement[];
  // Galerie
  gallery?: string[];
  // Réseaux
  facebook?: string;
  instagram?: string;
  twitter?: string;
  youtube?: string;
  // Options
  show_stats?: boolean;
  show_programs?: boolean;
  show_gallery?: boolean;
}

type TabKey = "general" | "media" | "colors" | "announcements" | "gallery" | "social" | "options";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateId() {
  return Math.random().toString(36).slice(2, 11);
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function TabButton({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.FC<{ className?: string }>;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg whitespace-nowrap transition-all ${
        active
          ? "bg-[#1e3a5f] text-white shadow-sm"
          : "text-gray-600 hover:text-[#1e3a5f] hover:bg-blue-50"
      }`}
    >
      <Icon className="w-4 h-4" />
      {label}
    </button>
  );
}

function FormField({
  label,
  help,
  children,
}: {
  label: string;
  help?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-semibold text-gray-700">{label}</label>
      {children}
      {help && <p className="text-xs text-gray-400">{help}</p>}
    </div>
  );
}

function TextInput({
  value,
  onChange,
  placeholder,
  type = "text",
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  disabled?: boolean;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-lg text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all disabled:bg-gray-50 disabled:text-gray-400"
    />
  );
}

function TextareaInput({
  value,
  onChange,
  placeholder,
  rows = 4,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-lg text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all resize-y"
    />
  );
}

function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
}) {
  return (
    <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-100">
      <div>
        <p className="text-sm font-semibold text-gray-800">{label}</p>
        {description && <p className="text-xs text-gray-400 mt-0.5">{description}</p>}
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={`relative w-11 h-6 rounded-full transition-all duration-200 flex-shrink-0 ${
          checked ? "bg-blue-600" : "bg-gray-300"
        }`}
        role="switch"
        aria-checked={checked}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform duration-200 ${
            checked ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: General
// ---------------------------------------------------------------------------

function TabGeneral({
  data,
  onChange,
}: {
  data: LandingSettings;
  onChange: (patch: Partial<LandingSettings>) => void;
}) {
  return (
    <div className="grid sm:grid-cols-2 gap-5">
      <FormField label="Nom de l'établissement" help="Nom affiché sur votre page publique">
        <TextInput
          value={data.name ?? ""}
          onChange={(v) => onChange({ name: v })}
          placeholder="Ex: Université La Source"
        />
      </FormField>

      <FormField label="Accroche (tagline)" help="Courte phrase qui résume votre établissement">
        <TextInput
          value={data.tagline ?? ""}
          onChange={(v) => onChange({ tagline: v })}
          placeholder="Ex: Former les talents de demain"
        />
      </FormField>

      <div className="sm:col-span-2">
        <FormField label="Description" help="Présentation générale de votre établissement">
          <TextareaInput
            value={data.description ?? ""}
            onChange={(v) => onChange({ description: v })}
            placeholder="Décrivez votre établissement, vos valeurs, votre mission..."
            rows={5}
          />
        </FormField>
      </div>

      <FormField label="Devise / Motto">
        <TextInput
          value={data.motto ?? ""}
          onChange={(v) => onChange({ motto: v })}
          placeholder="Ex: Savoir, Savoir-faire, Savoir-être"
        />
      </FormField>

      <FormField label="Horaires d'ouverture">
        <TextInput
          value={data.opening_hours ?? ""}
          onChange={(v) => onChange({ opening_hours: v })}
          placeholder="Ex: Lun-Ven 8h-18h, Sam 9h-12h"
        />
      </FormField>

      <FormField label="Année de fondation">
        <TextInput
          value={String(data.founded_year ?? "")}
          onChange={(v) => onChange({ founded_year: v })}
          placeholder="Ex: 1978"
          type="number"
        />
      </FormField>

      <FormField label="Accréditation / Certification">
        <TextInput
          value={data.accreditation ?? ""}
          onChange={(v) => onChange({ accreditation: v })}
          placeholder="Ex: ISO 9001, Certifié Qualiopi..."
        />
      </FormField>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Media
// ---------------------------------------------------------------------------

function TabMedia({
  data,
  onChange,
}: {
  data: LandingSettings;
  onChange: (patch: Partial<LandingSettings>) => void;
}) {
  return (
    <div className="flex flex-col gap-8">
      {/* Logo */}
      <div className="p-6 bg-gray-50 rounded-2xl border border-gray-100">
        <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
          <School className="w-4 h-4 text-blue-600" />
          Logo de l&apos;établissement
        </h3>
        <FormField
          label="URL du logo"
          help="Recommandé : format carré PNG ou SVG, fond transparent, 512×512px minimum"
        >
          <TextInput
            value={data.logo_url ?? ""}
            onChange={(v) => onChange({ logo_url: v })}
            placeholder="https://exemple.com/logo.png"
          />
        </FormField>
        {data.logo_url && (
          <div className="mt-4 flex items-center gap-4">
            <img
              src={resolveUploadUrl(data.logo_url)}
              alt="Logo preview"
              className="w-24 h-24 rounded-xl object-cover border border-gray-200 bg-white"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
            <p className="text-xs text-gray-400">Aperçu du logo</p>
          </div>
        )}
      </div>

      {/* Banner */}
      <div className="p-6 bg-gray-50 rounded-2xl border border-gray-100">
        <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
          <Image className="w-4 h-4 text-blue-600" />
          Bannière / Photo de couverture
        </h3>
        <FormField
          label="URL de la bannière"
          help="Recommandé : format paysage 1920×480px, JPG ou WebP"
        >
          <TextInput
            value={data.banner_url ?? ""}
            onChange={(v) => onChange({ banner_url: v })}
            placeholder="https://exemple.com/banner.jpg"
          />
        </FormField>
        {data.banner_url && (
          <div className="mt-4">
            <img
              src={data.banner_url}
              alt="Banner preview"
              className="w-full h-32 object-cover rounded-xl border border-gray-200"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
            <p className="text-xs text-gray-400 mt-2">Aperçu de la bannière</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Colors
// ---------------------------------------------------------------------------

function TabColors({
  data,
  onChange,
}: {
  data: LandingSettings;
  onChange: (patch: Partial<LandingSettings>) => void;
}) {
  const primaryColor = data.primary_color ?? "#1e3a5f";
  const secondaryColor = data.secondary_color ?? "#3b82f6";

  return (
    <div className="flex flex-col gap-6">
      <div className="p-6 bg-gray-50 rounded-2xl border border-gray-100">
        <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
          <Palette className="w-4 h-4 text-blue-600" />
          Couleurs de la page publique
        </h3>
        <div className="grid sm:grid-cols-2 gap-6">
          {/* Primary */}
          <FormField label="Couleur principale" help="Utilisée pour les titres et boutons principaux">
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={primaryColor}
                onChange={(e) => onChange({ primary_color: e.target.value })}
                className="w-12 h-10 rounded-lg border border-gray-200 cursor-pointer p-0.5 bg-white"
              />
              <TextInput
                value={primaryColor}
                onChange={(v) => onChange({ primary_color: v })}
                placeholder="#1e3a5f"
              />
            </div>
          </FormField>

          {/* Secondary */}
          <FormField label="Couleur secondaire" help="Utilisée pour les accents et badges">
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={secondaryColor}
                onChange={(e) => onChange({ secondary_color: e.target.value })}
                className="w-12 h-10 rounded-lg border border-gray-200 cursor-pointer p-0.5 bg-white"
              />
              <TextInput
                value={secondaryColor}
                onChange={(v) => onChange({ secondary_color: v })}
                placeholder="#3b82f6"
              />
            </div>
          </FormField>
        </div>
      </div>

      {/* Preview */}
      <div className="p-6 rounded-2xl border-2 border-dashed border-gray-200">
        <p className="text-xs text-gray-400 uppercase tracking-widest mb-4 font-semibold">Aperçu</p>
        <div
          className="rounded-xl p-6 text-white text-center"
          style={{ backgroundColor: primaryColor }}
        >
          <h3 className="text-xl font-bold mb-2">Titre de la page</h3>
          <p className="text-sm opacity-80 mb-4">Sous-titre descriptif de l&apos;établissement</p>
          <button
            className="px-5 py-2 rounded-lg text-sm font-semibold transition-opacity"
            style={{ backgroundColor: secondaryColor, color: "#fff" }}
          >
            Bouton d&apos;action
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Announcements
// ---------------------------------------------------------------------------

const BLANK_ANNOUNCEMENT: Omit<Announcement, "id"> = {
  title: "",
  content: "",
  date: new Date().toISOString().split("T")[0],
  pinned: false,
  category: "general",
};

function TabAnnouncements({
  data,
  onChange,
}: {
  data: LandingSettings;
  onChange: (patch: Partial<LandingSettings>) => void;
}) {
  const announcements = data.announcements ?? [];
  const [form, setForm] = useState<Omit<Announcement, "id">>(BLANK_ANNOUNCEMENT);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const setAnnouncements = (list: Announcement[]) => onChange({ announcements: list });

  const handleSave = () => {
    if (!form.title.trim()) {
      toast.error("Le titre de l'annonce est requis.");
      return;
    }
    if (editingId) {
      setAnnouncements(announcements.map((a) => (a.id === editingId ? { ...form, id: editingId } : a)));
      setEditingId(null);
    } else {
      setAnnouncements([{ ...form, id: generateId() }, ...announcements]);
    }
    setForm(BLANK_ANNOUNCEMENT);
    setFormOpen(false);
  };

  const handleEdit = (a: Announcement) => {
    setForm({ title: a.title, content: a.content, date: a.date, pinned: a.pinned, category: a.category });
    setEditingId(a.id);
    setFormOpen(true);
  };

  const handleDelete = (id: string) => {
    setAnnouncements(announcements.filter((a) => a.id !== id));
  };

  const handlePin = (id: string) => {
    setAnnouncements(announcements.map((a) => (a.id === id ? { ...a, pinned: !a.pinned } : a)));
  };

  const handleCancel = () => {
    setForm(BLANK_ANNOUNCEMENT);
    setEditingId(null);
    setFormOpen(false);
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Add button */}
      {!formOpen && (
        <button
          onClick={() => setFormOpen(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-[#1e3a5f] text-white text-sm font-semibold rounded-xl hover:bg-[#162d4a] transition-all w-fit shadow-sm"
        >
          <Plus className="w-4 h-4" />
          Nouvelle annonce
        </button>
      )}

      {/* Form */}
      {formOpen && (
        <div className="p-6 bg-blue-50 rounded-2xl border border-blue-100 flex flex-col gap-4">
          <h3 className="font-semibold text-[#1e3a5f] flex items-center gap-2">
            <Megaphone className="w-4 h-4" />
            {editingId ? "Modifier l'annonce" : "Nouvelle annonce"}
          </h3>
          <div className="grid sm:grid-cols-2 gap-4">
            <FormField label="Titre *">
              <TextInput
                value={form.title}
                onChange={(v) => setForm({ ...form, title: v })}
                placeholder="Titre de l'annonce"
              />
            </FormField>
            <FormField label="Date">
              <TextInput
                value={form.date}
                onChange={(v) => setForm({ ...form, date: v })}
                type="date"
              />
            </FormField>
            <div className="sm:col-span-2">
              <FormField label="Contenu">
                <TextareaInput
                  value={form.content}
                  onChange={(v) => setForm({ ...form, content: v })}
                  placeholder="Contenu de l'annonce..."
                  rows={3}
                />
              </FormField>
            </div>
            <FormField label="Catégorie">
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-lg text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="general">Général</option>
                <option value="academic">Académique</option>
                <option value="event">Événement</option>
                <option value="urgent">Urgent</option>
                <option value="administrative">Administratif</option>
              </select>
            </FormField>
            <div className="flex items-center gap-3 mt-1">
              <input
                type="checkbox"
                id="pinned"
                checked={form.pinned}
                onChange={(e) => setForm({ ...form, pinned: e.target.checked })}
                className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <label htmlFor="pinned" className="text-sm text-gray-700 font-medium cursor-pointer">
                Épingler en haut de la liste
              </label>
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button
              onClick={handleSave}
              className="px-5 py-2 bg-[#1e3a5f] text-white text-sm font-semibold rounded-lg hover:bg-[#162d4a] transition-all"
            >
              {editingId ? "Enregistrer" : "Ajouter"}
            </button>
            <button
              onClick={handleCancel}
              className="px-5 py-2 bg-white text-gray-600 text-sm font-medium rounded-lg border border-gray-200 hover:bg-gray-50 transition-all"
            >
              Annuler
            </button>
          </div>
        </div>
      )}

      {/* List */}
      {announcements.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <Megaphone className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Aucune annonce. Créez votre première annonce.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {[...announcements]
            .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0))
            .map((ann) => (
              <div
                key={ann.id}
                className={`p-4 bg-white rounded-xl border flex items-start gap-4 ${
                  ann.pinned ? "border-blue-200 bg-blue-50/30" : "border-gray-100"
                }`}
              >
                {ann.pinned && <Pin className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <p className="font-semibold text-gray-900 text-sm">{ann.title}</p>
                    <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full">
                      {ann.category}
                    </span>
                  </div>
                  {ann.content && (
                    <p className="text-gray-500 text-xs line-clamp-2 mb-1">{ann.content}</p>
                  )}
                  <p className="text-gray-400 text-xs">{ann.date}</p>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => handlePin(ann.id)}
                    className={`p-1.5 rounded-lg transition-colors ${
                      ann.pinned ? "text-blue-600 bg-blue-100" : "text-gray-400 hover:text-gray-700 hover:bg-gray-100"
                    }`}
                    title="Épingler"
                  >
                    <Pin className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleEdit(ann)}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                    title="Modifier"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDelete(ann.id)}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                    title="Supprimer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Gallery
// ---------------------------------------------------------------------------

function TabGallery({
  data,
  onChange,
}: {
  data: LandingSettings;
  onChange: (patch: Partial<LandingSettings>) => void;
}) {
  const gallery = data.gallery ?? [];
  const [newUrl, setNewUrl] = useState("");

  const addPhoto = () => {
    const url = newUrl.trim();
    if (!url) return;
    if (gallery.includes(url)) {
      toast.error("Cette URL est déjà dans la galerie.");
      return;
    }
    onChange({ gallery: [...gallery, url] });
    setNewUrl("");
  };

  const removePhoto = (url: string) => {
    onChange({ gallery: gallery.filter((u) => u !== url) });
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Add URL */}
      <div className="flex gap-3">
        <input
          type="url"
          value={newUrl}
          onChange={(e) => setNewUrl(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addPhoto()}
          placeholder="https://exemple.com/photo.jpg"
          className="flex-1 px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
        />
        <button
          onClick={addPhoto}
          disabled={!newUrl.trim()}
          className="px-4 py-2.5 bg-[#1e3a5f] text-white text-sm font-semibold rounded-xl hover:bg-[#162d4a] disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Ajouter
        </button>
      </div>

      {/* Grid */}
      {gallery.length === 0 ? (
        <div className="text-center py-12 text-gray-400 border-2 border-dashed border-gray-200 rounded-2xl">
          <Camera className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Aucune photo dans la galerie.</p>
          <p className="text-xs mt-1">Ajoutez des URLs de photos pour enrichir votre page publique.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {gallery.map((url, i) => (
            <div key={i} className="relative group rounded-xl overflow-hidden bg-gray-100 aspect-video">
              <img
                src={url}
                alt={`Photo ${i + 1}`}
                className="w-full h-full object-cover"
                onError={(e) => {
                  const el = e.target as HTMLImageElement;
                  el.parentElement!.classList.add("border", "border-red-200", "bg-red-50");
                  el.style.display = "none";
                }}
              />
              <button
                onClick={() => removePhoto(url)}
                className="absolute top-1.5 right-1.5 p-1 bg-white/90 rounded-full text-red-600 opacity-0 group-hover:opacity-100 transition-opacity shadow-sm hover:bg-white"
                title="Supprimer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-gray-400">
        {gallery.length} photo{gallery.length !== 1 ? "s" : ""} dans la galerie
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Social
// ---------------------------------------------------------------------------

function TabSocial({
  data,
  onChange,
}: {
  data: LandingSettings;
  onChange: (patch: Partial<LandingSettings>) => void;
}) {
  const socials = [
    { key: "facebook" as const, label: "Facebook", placeholder: "https://facebook.com/votrepagé" },
    { key: "instagram" as const, label: "Instagram", placeholder: "https://instagram.com/votre_compte" },
    { key: "twitter" as const, label: "Twitter / X", placeholder: "https://twitter.com/votre_compte" },
    { key: "youtube" as const, label: "YouTube", placeholder: "https://youtube.com/@votrechaine" },
  ];

  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-gray-500">
        Ajoutez les liens vers vos réseaux sociaux. Ils seront affichés sur votre page publique.
      </p>
      {socials.map(({ key, label, placeholder }) => (
        <FormField key={key} label={label}>
          <TextInput
            value={(data[key] as string) ?? ""}
            onChange={(v) => onChange({ [key]: v })}
            placeholder={placeholder}
            type="url"
          />
        </FormField>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Options
// ---------------------------------------------------------------------------

function TabOptions({
  data,
  onChange,
}: {
  data: LandingSettings;
  onChange: (patch: Partial<LandingSettings>) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-gray-500 mb-2">
        Choisissez les sections à afficher sur votre page publique.
      </p>
      <Toggle
        checked={data.show_stats ?? true}
        onChange={(v) => onChange({ show_stats: v })}
        label="Afficher les statistiques"
        description="Nombre d'élèves, filières, etc."
      />
      <Toggle
        checked={data.show_programs ?? true}
        onChange={(v) => onChange({ show_programs: v })}
        label="Afficher les programmes"
        description="Liste des formations et niveaux disponibles."
      />
      <Toggle
        checked={data.show_gallery ?? true}
        onChange={(v) => onChange({ show_gallery: v })}
        label="Afficher la galerie photos"
        description="Section photos de l'établissement."
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

const TABS: { key: TabKey; label: string; icon: React.FC<{ className?: string }> }[] = [
  { key: "general", label: "Général", icon: School },
  { key: "media", label: "Médias", icon: Image },
  { key: "colors", label: "Couleurs", icon: Palette },
  { key: "announcements", label: "Annonces", icon: Megaphone },
  { key: "gallery", label: "Galerie", icon: Camera },
  { key: "social", label: "Réseaux sociaux", icon: Share2 },
  { key: "options", label: "Options", icon: Settings },
];

export default function LandingPageEditor() {
  const { tenant } = useAuth();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabKey>("general");
  const [localData, setLocalData] = useState<LandingSettings>({});
  const [isDirty, setIsDirty] = useState(false);

  // Fetch current tenant settings
  const { data: tenantData, isLoading } = useQuery({
    queryKey: ["tenant-settings-landing"],
    queryFn: async () => {
      const response = await apiClient.get("/tenants/me");
      return response.data;
    },
    enabled: !!tenant,
  });

  // Sync server data to local state
  useEffect(() => {
    if (tenantData) {
      setLocalData({
        name: tenantData.name ?? "",
        tagline: tenantData.landing?.tagline ?? "",
        description: tenantData.description ?? tenantData.landing?.description ?? "",
        motto: tenantData.landing?.motto ?? "",
        opening_hours: tenantData.landing?.opening_hours ?? "",
        founded_year: tenantData.landing?.founded_year ?? "",
        accreditation: tenantData.landing?.accreditation ?? "",
        logo_url: tenantData.logo_url ?? tenantData.landing?.logo_url ?? "",
        banner_url: tenantData.landing?.banner_url ?? "",
        primary_color: tenantData.landing?.primary_color ?? "#1e3a5f",
        secondary_color: tenantData.landing?.secondary_color ?? "#3b82f6",
        announcements: tenantData.landing?.announcements ?? [],
        gallery: tenantData.landing?.gallery ?? [],
        facebook: tenantData.landing?.facebook ?? "",
        instagram: tenantData.landing?.instagram ?? "",
        twitter: tenantData.landing?.twitter ?? "",
        youtube: tenantData.landing?.youtube ?? "",
        show_stats: tenantData.landing?.show_stats ?? true,
        show_programs: tenantData.landing?.show_programs ?? true,
        show_gallery: tenantData.landing?.show_gallery ?? true,
      });
    }
  }, [tenantData]);

  // Mutation: PATCH /tenants/settings
  const saveMutation = useMutation({
    mutationFn: async (payload: { landing: LandingSettings }) => {
      const response = await apiClient.patch("/tenants/settings", payload);
      return response.data;
    },
    onSuccess: () => {
      toast.success("Page publique mise à jour avec succès !");
      setIsDirty(false);
      queryClient.invalidateQueries({ queryKey: ["tenant-settings-landing"] });
    },
    onError: (error: any) => {
      const msg =
        error?.response?.data?.detail ??
        error?.message ??
        "Une erreur est survenue lors de la sauvegarde.";
      toast.error(msg);
    },
  });

  const handleChange = (patch: Partial<LandingSettings>) => {
    setLocalData((prev) => ({ ...prev, ...patch }));
    setIsDirty(true);
  };

  const handleSave = () => {
    const { name, description, logo_url, ...rest } = localData;
    saveMutation.mutate({
      landing: {
        ...rest,
        // Also include top-level fields that might be sent alongside landing
        name,
        description,
        logo_url,
      },
    });
  };

  const tenantSlug = tenantData?.slug ?? "";

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ================================================================ */}
      {/* HEADER                                                           */}
      {/* ================================================================ */}
      <div className="bg-white border-b border-gray-100 px-4 sm:px-6 lg:px-8 py-5">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-[#1e3a5f] flex items-center gap-2">
              <Globe className="w-6 h-6 text-blue-600" />
              Page publique de l&apos;établissement
            </h1>
            <p className="text-gray-500 text-sm mt-1">
              Personnalisez ce que voient les visiteurs sur votre page publique.
            </p>
          </div>
          <div className="flex items-center gap-3">
            {tenantSlug && (
              <a
                href={`/ecole/${tenantSlug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 transition-all"
              >
                <Eye className="w-4 h-4" />
                Prévisualiser
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
            <button
              onClick={handleSave}
              disabled={saveMutation.isPending || !isDirty}
              className="flex items-center gap-2 px-5 py-2 bg-[#1e3a5f] text-white text-sm font-semibold rounded-xl hover:bg-[#162d4a] disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm"
            >
              {saveMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              {saveMutation.isPending ? "Enregistrement..." : isDirty ? "Enregistrer *" : "Enregistré"}
            </button>
          </div>
        </div>
      </div>

      {/* ================================================================ */}
      {/* CONTENT                                                          */}
      {/* ================================================================ */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col lg:flex-row gap-8">
          {/* Sidebar tabs (desktop) */}
          <aside className="hidden lg:flex flex-col gap-1 w-48 flex-shrink-0">
            {TABS.map((tab) => (
              <TabButton
                key={tab.key}
                active={activeTab === tab.key}
                onClick={() => setActiveTab(tab.key)}
                icon={tab.icon}
                label={tab.label}
              />
            ))}
          </aside>

          {/* Mobile tab scroll */}
          <div className="lg:hidden flex gap-2 overflow-x-auto pb-2 scrollbar-hide -mx-4 px-4">
            {TABS.map((tab) => (
              <TabButton
                key={tab.key}
                active={activeTab === tab.key}
                onClick={() => setActiveTab(tab.key)}
                icon={tab.icon}
                label={tab.label}
              />
            ))}
          </div>

          {/* Main content */}
          <main className="flex-1 min-w-0">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 lg:p-8">
              {/* Tab heading */}
              <div className="mb-6 pb-5 border-b border-gray-100">
                {(() => {
                  const tab = TABS.find((t) => t.key === activeTab);
                  const Icon = tab?.icon ?? Settings;
                  return (
                    <h2 className="text-lg font-bold text-[#1e3a5f] flex items-center gap-2">
                      <Icon className="w-5 h-5 text-blue-600" />
                      {tab?.label}
                    </h2>
                  );
                })()}
              </div>

              {/* Tab content */}
              {activeTab === "general" && (
                <TabGeneral data={localData} onChange={handleChange} />
              )}
              {activeTab === "media" && (
                <TabMedia data={localData} onChange={handleChange} />
              )}
              {activeTab === "colors" && (
                <TabColors data={localData} onChange={handleChange} />
              )}
              {activeTab === "announcements" && (
                <TabAnnouncements data={localData} onChange={handleChange} />
              )}
              {activeTab === "gallery" && (
                <TabGallery data={localData} onChange={handleChange} />
              )}
              {activeTab === "social" && (
                <TabSocial data={localData} onChange={handleChange} />
              )}
              {activeTab === "options" && (
                <TabOptions data={localData} onChange={handleChange} />
              )}
            </div>

            {/* Unsaved changes banner */}
            {isDirty && (
              <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between gap-4">
                <p className="text-sm text-amber-700 font-medium">
                  Vous avez des modifications non enregistrées.
                </p>
                <button
                  onClick={handleSave}
                  disabled={saveMutation.isPending}
                  className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white text-sm font-semibold rounded-lg hover:bg-amber-700 transition-all"
                >
                  {saveMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                  Enregistrer maintenant
                </button>
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
