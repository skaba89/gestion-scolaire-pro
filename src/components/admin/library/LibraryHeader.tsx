import { Button } from "@/components/ui/button";
import { Plus, FolderOpen } from "lucide-react";
import { useTranslation } from "react-i18next";

interface LibraryHeaderProps {
    onOpenResourceDialog: () => void;
    onOpenCategoryDialog: () => void;
}

export function LibraryHeader({ onOpenResourceDialog, onOpenCategoryDialog }: LibraryHeaderProps) {
    const { t } = useTranslation();

    return (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
                <h1 className="text-2xl font-display font-bold text-foreground">
                    {t("library.title", "Bibliothèque")}
                </h1>
                <p className="text-muted-foreground">
                    {t("library.subtitle", "Gérez vos ressources pédagogiques")}
                </p>
            </div>
            <div className="flex gap-2">
                <Button variant="outline" onClick={onOpenCategoryDialog}>
                    <FolderOpen className="w-4 h-4 mr-2" />
                    Catégorie
                </Button>
                <Button onClick={onOpenResourceDialog}>
                    <Plus className="w-4 h-4 mr-2" />
                    Ajouter
                </Button>
            </div>
        </div>
    );
}
