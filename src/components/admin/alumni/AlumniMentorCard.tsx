import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Building2, Edit, Linkedin, Mail, Trash2 } from "lucide-react";

interface AlumniMentorCardProps {
    mentor: any;
    onEdit: (mentor: any) => void;
    onDelete: (id: string) => void;
}

export function AlumniMentorCard({ mentor, onEdit, onDelete }: AlumniMentorCardProps) {
    return (
        <Card>
            <CardHeader>
                <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                        <Avatar className="h-12 w-12">
                            <AvatarImage src={mentor.photo_url} />
                            <AvatarFallback>
                                {mentor.first_name[0]}{mentor.last_name[0]}
                            </AvatarFallback>
                        </Avatar>
                        <div>
                            <CardTitle className="text-lg">
                                {mentor.first_name} {mentor.last_name}
                            </CardTitle>
                            {mentor.graduation_year && (
                                <p className="text-sm text-muted-foreground">
                                    Promotion {mentor.graduation_year}
                                </p>
                            )}
                        </div>
                    </div>
                    <Badge variant={mentor.is_available ? "default" : "secondary"}>
                        {mentor.is_available ? "Disponible" : "Indisponible"}
                    </Badge>
                </div>
            </CardHeader>
            <CardContent className="space-y-3">
                {(mentor.current_position || mentor.current_company) && (
                    <div className="flex items-center gap-2 text-sm">
                        <Building2 className="h-4 w-4 text-muted-foreground" />
                        <span>
                            {mentor.current_position}
                            {mentor.current_position && mentor.current_company && " @ "}
                            {mentor.current_company}
                        </span>
                    </div>
                )}
                {mentor.industry && (
                    <Badge variant="outline">{mentor.industry}</Badge>
                )}
                {mentor.expertise_areas && mentor.expertise_areas.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                        {mentor.expertise_areas.slice(0, 3).map((exp: string) => (
                            <Badge key={exp} variant="secondary" className="text-xs">
                                {exp}
                            </Badge>
                        ))}
                        {mentor.expertise_areas.length > 3 && (
                            <Badge variant="secondary" className="text-xs">
                                +{mentor.expertise_areas.length - 3}
                            </Badge>
                        )}
                    </div>
                )}
                <div className="flex items-center gap-2 pt-2">
                    <Button variant="ghost" size="icon" onClick={() => onEdit(mentor)}>
                        <Edit className="h-4 w-4" />
                    </Button>
                    {mentor.linkedin_url && (
                        <Button variant="ghost" size="icon" asChild>
                            <a href={mentor.linkedin_url} target="_blank" rel="noopener noreferrer">
                                <Linkedin className="h-4 w-4" />
                            </a>
                        </Button>
                    )}
                    <Button variant="ghost" size="icon" asChild>
                        <a href={`mailto:${mentor.email}`}>
                            <Mail className="h-4 w-4" />
                        </a>
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                            if (confirm("Supprimer ce mentor ?")) {
                                onDelete(mentor.id);
                            }
                        }}
                    >
                        <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}
