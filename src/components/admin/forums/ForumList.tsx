import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MessageSquare, Users, Edit, Trash2, Plus } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { getCategoryInfo } from "./constants";

interface ForumListProps {
    forums: any[] | null;
    postCounts: Record<string, number> | null;
    onEdit: (forum: any) => void;
    onDelete: (id: string) => void;
    onNewForum: () => void;
}

export const ForumList = ({
    forums,
    postCounts,
    onEdit,
    onDelete,
    onNewForum,
}: ForumListProps) => {
    if (!forums || forums.length === 0) {
        return (
            <Card className="p-8 text-center">
                <MessageSquare className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-2">Aucun forum</h3>
                <p className="text-muted-foreground mb-4">
                    Créez votre premier forum de discussion
                </p>
                <Button onClick={onNewForum}>
                    <Plus className="h-4 w-4 mr-2" />
                    Créer un forum
                </Button>
            </Card>
        );
    }

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {forums.map((forum) => {
                const categoryInfo = getCategoryInfo(forum.category);
                return (
                    <Card key={forum.id} className={!forum.is_active ? "opacity-60" : ""}>
                        <CardHeader>
                            <div className="flex items-start justify-between">
                                <div className="flex items-center gap-2">
                                    <MessageSquare className="h-5 w-5 text-primary" />
                                    <CardTitle className="text-lg">{forum.title}</CardTitle>
                                </div>
                                <Badge className={categoryInfo.color}>{categoryInfo.label}</Badge>
                            </div>
                            <CardDescription className="line-clamp-2">{forum.description}</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-3">
                                <div className="flex items-center justify-between text-sm text-muted-foreground">
                                    <div className="flex items-center gap-1">
                                        <Users className="h-4 w-4" />
                                        <span>{postCounts?.[forum.id] || 0} discussions</span>
                                    </div>
                                    {!forum.is_active && (
                                        <Badge variant="secondary">Inactif</Badge>
                                    )}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                    Créé le {format(new Date(forum.created_at), "dd MMMM yyyy", { locale: fr })}
                                </div>
                                <div className="flex justify-end gap-2">
                                    <Button variant="ghost" size="sm" onClick={() => onEdit(forum)}>
                                        <Edit className="h-4 w-4" />
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => {
                                            if (confirm("Supprimer ce forum ?")) {
                                                onDelete(forum.id);
                                            }
                                        }}
                                    >
                                        <Trash2 className="h-4 w-4 text-destructive" />
                                    </Button>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                );
            })}
        </div>
    );
};
