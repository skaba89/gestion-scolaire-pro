import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileText, Book, Video, Globe, MoreVertical, Edit, Trash2, ExternalLink, Star } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

interface LibraryGridProps {
    resources: any[];
    onEdit: (resource: any) => void;
    onDelete: (id: string) => void;
}

const TYPE_ICONS: Record<string, any> = {
    document: FileText,
    book: Book,
    video: Video,
    link: Globe,
};

const TYPE_COLORS: Record<string, string> = {
    document: "text-blue-500 bg-blue-50",
    book: "text-green-500 bg-green-50",
    video: "text-red-500 bg-red-50",
    link: "text-purple-500 bg-purple-50",
};

export function LibraryGrid({ resources, onEdit, onDelete }: LibraryGridProps) {
    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {resources.map((res) => {
                const Icon = TYPE_ICONS[res.resource_type] || FileText;
                return (
                    <Card key={res.id} className="group relative overflow-hidden flex flex-col">
                        {res.is_featured && (
                            <div className="absolute top-2 right-2 z-10">
                                <Star className="w-5 h-5 text-yellow-500 fill-yellow-500" />
                            </div>
                        )}
                        <CardHeader className="p-4 flex flex-row items-start justify-between">
                            <div className={`p-2 rounded-lg ${TYPE_COLORS[res.resource_type] || "bg-muted"}`}>
                                <Icon className="w-6 h-6" />
                            </div>
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="icon" className="h-8 w-8">
                                        <MoreVertical className="w-4 h-4" />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                    <DropdownMenuItem onClick={() => onEdit(res)}>
                                        <Edit className="w-4 h-4 mr-2" />
                                        Modifier
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => onDelete(res.id)} className="text-destructive">
                                        <Trash2 className="w-4 h-4 mr-2" />
                                        Supprimer
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </CardHeader>
                        <CardContent className="p-4 pt-0 flex-1">
                            <div className="flex gap-2 mb-2">
                                <Badge variant="outline" className="text-[10px] uppercase">
                                    {res.resource_type}
                                </Badge>
                                {res.category && (
                                    <Badge
                                        variant="secondary"
                                        className="text-[10px]"
                                        style={{ backgroundColor: `${res.category.color}20`, color: res.category.color }}
                                    >
                                        {res.category.name}
                                    </Badge>
                                )}
                            </div>
                            <h3 className="font-bold text-sm line-clamp-2 mb-1 group-hover:text-primary transition-colors">
                                {res.title}
                            </h3>
                            {res.author && <p className="text-xs text-muted-foreground mb-2">Par {res.author}</p>}
                            <p className="text-xs text-muted-foreground line-clamp-3">
                                {res.description}
                            </p>
                        </CardContent>
                        <CardFooter className="p-4 pt-0 flex justify-between items-center text-[10px] text-muted-foreground">
                            <span>{res.views_count} vues</span>
                            {res.external_url && (
                                <Button variant="ghost" size="sm" asChild className="h-7 px-2">
                                    <a href={res.external_url} target="_blank" rel="noopener noreferrer">
                                        <ExternalLink className="w-3 h-3 mr-1" />
                                        Ouvrir
                                    </a>
                                </Button>
                            )}
                        </CardFooter>
                    </Card>
                );
            })}
        </div>
    );
}
