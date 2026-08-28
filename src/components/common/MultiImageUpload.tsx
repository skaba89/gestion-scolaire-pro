import { useRef, useState } from "react";
import { Upload, X, Loader2, GripVertical } from "lucide-react";
import { compressImage } from "@/lib/imageCompression";
import { resolveUploadUrl } from "@/utils/url";
import { apiClient } from "@/api/client";
import { useToast } from "@/hooks/use-toast";

interface MultiImageUploadProps {
  /** Stored image paths/URLs, in display order — whatever the parent
   * form field already holds (e.g. settings.gallery). */
  images: string[];
  onChange: (images: string[]) => void;
  /** Shown when the list is empty. */
  emptyLabel?: string;
  /** Shown under the upload control. */
  helpText?: string;
  maxSizeMb?: number;
  disabled?: boolean;
}

/**
 * Real multi-photo upload, reusing the exact upload path already proven
 * by src/components/settings/branding/LogoSection.tsx (compressImage +
 * POST /storage/upload/) — extended to accept several files at once and
 * manage an ordered list instead of a single value.
 *
 * Built for settings.gallery (audit 2026-08-28: this field previously had
 * no real upload UI at all — admins could only paste an external image
 * URL into a text input, and even that would silently break once pasted
 * because the render side never called resolveUploadUrl() on it either
 * — both fixed alongside this component).
 */
export function MultiImageUpload({
  images,
  onChange,
  emptyLabel = "Aucune photo",
  helpText,
  maxSizeMb = 5,
  disabled = false,
}: MultiImageUploadProps) {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploadingCount, setUploadingCount] = useState(0);
  const [erroredUrls, setErroredUrls] = useState<Set<string>>(new Set());
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const uploadOne = async (file: File): Promise<string | null> => {
    if (!file.type.startsWith("image/")) {
      toast({ title: "Erreur", description: `${file.name} n'est pas une image.`, variant: "destructive" });
      return null;
    }
    if (file.size > maxSizeMb * 1024 * 1024) {
      toast({ title: "Erreur", description: `${file.name} dépasse ${maxSizeMb} Mo.`, variant: "destructive" });
      return null;
    }
    try {
      const compressed = await compressImage(file, { maxWidthOrHeight: 1600, quality: 0.85, outputType: "image/webp" });
      const formData = new FormData();
      formData.append("file", compressed);
      const response = await apiClient.post("/storage/upload/", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      if (!response.data?.url) throw new Error("L'upload a échoué");
      return response.data.url as string;
    } catch (error: any) {
      toast({
        title: "Erreur",
        description: error.response?.data?.detail || error.message || `Échec de l'envoi de ${file.name}.`,
        variant: "destructive",
      });
      return null;
    }
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const fileArray = Array.from(files);
    setUploadingCount(fileArray.length);
    try {
      const results = await Promise.all(fileArray.map(uploadOne));
      const uploaded = results.filter((u): u is string => Boolean(u));
      if (uploaded.length > 0) {
        onChange([...images, ...uploaded]);
        toast({
          title: uploaded.length === 1 ? "Photo ajoutée" : `${uploaded.length} photos ajoutées`,
          description: "N'oubliez pas d'enregistrer pour publier ces changements.",
        });
      }
    } finally {
      setUploadingCount(0);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const removeAt = (index: number) => {
    onChange(images.filter((_, i) => i !== index));
  };

  const moveTo = (from: number, to: number) => {
    if (from === to || to < 0 || to >= images.length) return;
    const next = [...images];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    onChange(next);
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={(e) => handleFiles(e.target.files)}
          disabled={disabled || uploadingCount > 0}
          className="block w-full text-sm text-muted-foreground
            file:mr-4 file:py-2 file:px-4
            file:rounded-lg file:border-0
            file:text-sm file:font-semibold
            file:bg-primary file:text-primary-foreground
            hover:file:bg-primary/90
            disabled:opacity-50 disabled:cursor-not-allowed"
        />
        {uploadingCount > 0 && (
          <p className="flex items-center gap-2 text-xs text-muted-foreground mt-2">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            Envoi de {uploadingCount} photo{uploadingCount > 1 ? "s" : ""}...
          </p>
        )}
        {helpText && <p className="text-xs text-muted-foreground mt-2 whitespace-pre-line">{helpText}</p>}
      </div>

      {images.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground border-2 border-dashed border-border rounded-2xl">
          <Upload className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">{emptyLabel}</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {images.map((url, i) => {
            const errored = erroredUrls.has(url);
            return (
              <div
                key={`${url}-${i}`}
                draggable
                onDragStart={() => setDragIndex(i)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => { if (dragIndex !== null) moveTo(dragIndex, i); setDragIndex(null); }}
                onDragEnd={() => setDragIndex(null)}
                className="relative group rounded-xl overflow-hidden bg-muted aspect-video border border-border"
              >
                {errored ? (
                  <div className="w-full h-full flex flex-col items-center justify-center text-center text-muted-foreground p-2">
                    <X className="w-6 h-6 text-amber-500 mb-1" />
                    <p className="text-xs">Image inaccessible</p>
                  </div>
                ) : (
                  <img
                    src={resolveUploadUrl(url)}
                    alt={`Photo ${i + 1}`}
                    className="w-full h-full object-cover"
                    onError={() => setErroredUrls((prev) => new Set(prev).add(url))}
                  />
                )}
                <div className="absolute top-1.5 left-1.5 p-1 bg-white/80 rounded-md text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab" title="Glisser pour réordonner">
                  <GripVertical className="w-3.5 h-3.5" />
                </div>
                <button
                  type="button"
                  onClick={() => removeAt(i)}
                  className="absolute top-1.5 right-1.5 p-1 bg-white/90 rounded-full text-red-600 opacity-0 group-hover:opacity-100 transition-opacity shadow-sm hover:bg-white"
                  title="Supprimer"
                  disabled={disabled}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
