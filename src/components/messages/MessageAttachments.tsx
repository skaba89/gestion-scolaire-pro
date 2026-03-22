import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Paperclip, X, Download, FileText, Image as ImageIcon, File } from "lucide-react";
import { toast } from "sonner";

interface Attachment {
  name: string;
  url: string;
  type: string;
  size: number;
}

interface MessageAttachmentsProps {
  conversationId: string;
  userId: string;
  attachments: Attachment[];
  onAttachmentsChange: (attachments: Attachment[]) => void;
  readOnly?: boolean;
}

const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const getFileIcon = (type: string) => {
  if (type.startsWith("image/")) return ImageIcon;
  if (type.includes("pdf") || type.includes("document")) return FileText;
  return File;
};

export const MessageAttachments = ({
  conversationId,
  userId,
  attachments,
  onAttachmentsChange,
  readOnly = false,
}: MessageAttachmentsProps) => {
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files?.length) return;

    setIsUploading(true);
    const newAttachments: Attachment[] = [];

    try {
      for (const file of Array.from(files)) {
        // Limit file size to 10MB
        if (file.size > 10 * 1024 * 1024) {
          toast.error(`${file.name} est trop volumineux (max 10MB)`);
          continue;
        }

        const filePath = `${conversationId}/${userId}/${Date.now()}-${file.name}`;
        
        const { error: uploadError } = await supabase.storage
          .from("message-attachments")
          .upload(filePath, file);

        if (uploadError) {
          console.error("Upload error:", uploadError);
          toast.error(`Erreur lors de l'upload de ${file.name}`);
          continue;
        }

        const { data: urlData } = supabase.storage
          .from("message-attachments")
          .getPublicUrl(filePath);

        newAttachments.push({
          name: file.name,
          url: urlData.publicUrl,
          type: file.type,
          size: file.size,
        });
      }

      if (newAttachments.length > 0) {
        onAttachmentsChange([...attachments, ...newAttachments]);
        toast.success(`${newAttachments.length} fichier(s) ajouté(s)`);
      }
    } catch (error) {
      console.error("Upload error:", error);
      toast.error("Erreur lors de l'upload");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleRemoveAttachment = (index: number) => {
    const newAttachments = attachments.filter((_, i) => i !== index);
    onAttachmentsChange(newAttachments);
  };

  const handleDownload = async (attachment: Attachment) => {
    try {
      window.open(attachment.url, "_blank");
    } catch (error) {
      toast.error("Erreur lors du téléchargement");
    }
  };

  if (readOnly) {
    if (!attachments?.length) return null;
    
    return (
      <div className="flex flex-wrap gap-2 mt-2">
        {attachments.map((attachment, index) => {
          const Icon = getFileIcon(attachment.type);
          return (
            <button
              key={index}
              onClick={() => handleDownload(attachment)}
              className="flex items-center gap-2 px-3 py-1.5 bg-muted rounded-lg hover:bg-muted/80 transition-colors text-sm"
            >
              <Icon className="w-4 h-4 text-muted-foreground" />
              <span className="max-w-[150px] truncate">{attachment.name}</span>
              <Download className="w-3 h-3 text-muted-foreground" />
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleFileSelect}
        accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt"
      />

      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
        >
          <Paperclip className="w-4 h-4 mr-2" />
          {isUploading ? "Upload..." : "Joindre un fichier"}
        </Button>
        <span className="text-xs text-muted-foreground">Max 10MB par fichier</span>
      </div>

      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {attachments.map((attachment, index) => {
            const Icon = getFileIcon(attachment.type);
            return (
              <Badge
                key={index}
                variant="secondary"
                className="flex items-center gap-2 pr-1"
              >
                <Icon className="w-3 h-3" />
                <span className="max-w-[150px] truncate">{attachment.name}</span>
                <span className="text-xs text-muted-foreground">
                  ({formatFileSize(attachment.size)})
                </span>
                <button
                  type="button"
                  onClick={() => handleRemoveAttachment(index)}
                  className="ml-1 p-0.5 hover:bg-muted rounded"
                >
                  <X className="w-3 h-3" />
                </button>
              </Badge>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default MessageAttachments;
