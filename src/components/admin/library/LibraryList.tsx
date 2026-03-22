import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Edit, Trash2, ExternalLink, FileText, Book, Video, Globe } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

interface LibraryListProps {
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

export function LibraryList({ resources, onEdit, onDelete }: LibraryListProps) {
    return (
        <div className="border rounded-md">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Ressource</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Catégorie</TableHead>
                        <TableHead>Auteur</TableHead>
                        <TableHead>Ajouté le</TableHead>
                        <TableHead>Vues</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {resources.map((res) => {
                        const Icon = TYPE_ICONS[res.resource_type] || FileText;
                        return (
                            <TableRow key={res.id}>
                                <TableCell>
                                    <div className="flex items-center gap-3">
                                        <Icon className="w-5 h-5 text-muted-foreground shrink-0" />
                                        <div>
                                            <p className="font-medium text-sm line-clamp-1">{res.title}</p>
                                            {res.is_featured && <Badge className="text-[8px] h-3 px-1 bg-yellow-400">VEDETTE</Badge>}
                                        </div>
                                    </div>
                                </TableCell>
                                <TableCell>
                                    <Badge variant="outline" className="text-[10px] uppercase">
                                        {res.resource_type}
                                    </Badge>
                                </TableCell>
                                <TableCell>
                                    {res.category ? (
                                        <Badge
                                            variant="secondary"
                                            className="text-[10px]"
                                            style={{ backgroundColor: `${res.category.color}20`, color: res.category.color }}
                                        >
                                            {res.category.name}
                                        </Badge>
                                    ) : "-"}
                                </TableCell>
                                <TableCell className="text-sm">{res.author || "-"}</TableCell>
                                <TableCell className="text-xs text-muted-foreground">
                                    {format(new Date(res.created_at), "dd MMM yyyy", { locale: fr })}
                                </TableCell>
                                <TableCell className="text-sm">{res.views_count}</TableCell>
                                <TableCell className="text-right">
                                    <div className="flex justify-end gap-1">
                                        {res.external_url && (
                                            <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
                                                <a href={res.external_url} target="_blank" rel="noopener noreferrer">
                                                    <ExternalLink className="w-4 h-4" />
                                                </a>
                                            </Button>
                                        )}
                                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEdit(res)}>
                                            <Edit className="w-4 h-4" />
                                        </Button>
                                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => onDelete(res.id)}>
                                            <Trash2 className="w-4 h-4" />
                                        </Button>
                                    </div>
                                </TableCell>
                            </TableRow>
                        );
                    })}
                </TableBody>
            </Table>
        </div>
    );
}
