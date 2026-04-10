import { Card, CardContent } from "@/components/ui/card";
import { BookOpen, FolderOpen, Star, Eye } from "lucide-react";

interface LibraryStatsProps {
    totalResources: number;
    totalCategories: number;
    featuredResources: number;
    totalViews: number;
}

export function LibraryStats({
    totalResources,
    totalCategories,
    featuredResources,
    totalViews,
}: LibraryStatsProps) {
    return (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
                <CardContent className="pt-6">
                    <div className="flex items-center gap-3">
                        <BookOpen className="w-8 h-8 text-primary" />
                        <div>
                            <p className="text-2xl font-bold">{totalResources}</p>
                            <p className="text-xs text-muted-foreground">Ressources</p>
                        </div>
                    </div>
                </CardContent>
            </Card>
            <Card>
                <CardContent className="pt-6">
                    <div className="flex items-center gap-3">
                        <FolderOpen className="w-8 h-8 text-blue-500" />
                        <div>
                            <p className="text-2xl font-bold">{totalCategories}</p>
                            <p className="text-xs text-muted-foreground">Catégories</p>
                        </div>
                    </div>
                </CardContent>
            </Card>
            <Card>
                <CardContent className="pt-6">
                    <div className="flex items-center gap-3">
                        <Star className="w-8 h-8 text-yellow-500" />
                        <div>
                            <p className="text-2xl font-bold">{featuredResources}</p>
                            <p className="text-xs text-muted-foreground">En vedette</p>
                        </div>
                    </div>
                </CardContent>
            </Card>
            <Card>
                <CardContent className="pt-6">
                    <div className="flex items-center gap-3">
                        <Eye className="w-8 h-8 text-green-500" />
                        <div>
                            <p className="text-2xl font-bold">{totalViews}</p>
                            <p className="text-xs text-muted-foreground">Vues totales</p>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
