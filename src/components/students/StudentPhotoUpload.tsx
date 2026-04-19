import { useState, useRef } from "react";
import { apiClient } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Camera, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";

interface StudentPhotoUploadProps {
  studentId: string;
  currentPhotoUrl?: string | null;
  studentName: string;
  onPhotoUpdated: (url: string | null) => void;
}

export function StudentPhotoUpload({
  studentId,
  currentPhotoUrl,
  studentName,
  onPhotoUpdated,
}: StudentPhotoUploadProps) {
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith("image/")) {
      toast.error("Veuillez sélectionner une image");
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error("L'image ne doit pas dépasser 5MB");
      return;
    }

    setUploading(true);

    try {
      // Generate unique filename
      const fileExt = file.name.split(".").pop();
      const fileName = `${studentId}-${Date.now()}.${fileExt}`;
      const filePath = `photos/${fileName}`;

      // Upload photo
      const uploadFormData = new FormData();
      uploadFormData.append('file', file);
      uploadFormData.append('type', 'student-photo');
      uploadFormData.append('student_id', studentId);

      const { data: uploadData } = await apiClient.post('/storage/upload/', uploadFormData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      if (!uploadData?.url) throw new Error('Upload failed');
      const publicUrl = uploadData.url;

      // Update student record
      await apiClient.patch(`/students/${studentId}/`, { photo_url: publicUrl });

      onPhotoUpdated(publicUrl);
      toast.success("Photo mise à jour avec succès");
    } catch (error: any) {
      console.error("Error uploading photo:", error);
      toast.error("Erreur lors du téléchargement de la photo");
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleRemovePhoto = async () => {
    if (!currentPhotoUrl) return;

    setUploading(true);

    try {
      // Update student record
      await apiClient.patch(`/students/${studentId}/`, { photo_url: null });

      onPhotoUpdated(null);
      toast.success("Photo supprimée");
    } catch (error: any) {
      console.error("Error removing photo:", error);
      toast.error("Erreur lors de la suppression");
    } finally {
      setUploading(false);
    }
  };

  const initials = studentName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="flex flex-col items-center gap-4">
      <Avatar className="w-24 h-24">
        <AvatarImage src={currentPhotoUrl || undefined} alt={studentName} />
        <AvatarFallback className="text-xl">{initials}</AvatarFallback>
      </Avatar>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileSelect}
        className="hidden"
      />

      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <Camera className="h-4 w-4 mr-2" />
          )}
          {currentPhotoUrl ? "Changer" : "Ajouter photo"}
        </Button>
        
        {currentPhotoUrl && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleRemovePhoto}
            disabled={uploading}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
