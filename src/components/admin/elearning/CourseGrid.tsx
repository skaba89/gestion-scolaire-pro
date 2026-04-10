import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BookOpen, Users, Clock, Edit, Trash2, Eye } from "lucide-react";

interface CourseGridProps {
    courses: any[];
    onEdit: (course: any) => void;
    onDelete: (id: string) => void;
    onView: (id: string) => void;
}

export function CourseGrid({ courses, onEdit, onDelete, onView }: CourseGridProps) {
    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {courses.map((course) => (
                <Card key={course.id} className="overflow-hidden">
                    <div className="aspect-video bg-muted relative group">
                        {course.thumbnail_url ? (
                            <img
                                src={course.thumbnail_url}
                                alt={course.title}
                                className="w-full h-full object-cover"
                            />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center">
                                <BookOpen className="h-12 w-12 text-muted-foreground/50" />
                            </div>
                        )}
                        <div className="absolute top-2 right-2 flex gap-1">
                            <Badge variant={course.status === "published" ? "default" : "secondary"}>
                                {course.status === "published" ? "Publié" : "Brouillon"}
                            </Badge>
                        </div>
                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                            <Button size="icon" variant="secondary" onClick={() => onView(course.id)}>
                                <Eye className="h-4 w-4" />
                            </Button>
                            <Button size="icon" variant="secondary" onClick={() => onEdit(course)}>
                                <Edit className="h-4 w-4" />
                            </Button>
                            <Button size="icon" variant="destructive" onClick={() => onDelete(course.id)}>
                                <Trash2 className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                    <CardHeader>
                        <CardTitle className="line-clamp-1">{course.title}</CardTitle>
                        <p className="text-sm text-muted-foreground line-clamp-2">{course.description}</p>
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-center justify-between text-sm text-muted-foreground">
                            <div className="flex items-center gap-1">
                                <Users className="h-4 w-4" />
                                <span>{course.enrollments?.[0]?.count || 0} inscrits</span>
                            </div>
                            <div className="flex items-center gap-1">
                                <Clock className="h-4 w-4" />
                                <span>{course.duration_hours || 0}h</span>
                            </div>
                        </div>
                    </CardContent>
                    <CardFooter className="border-t pt-4">
                        <Button variant="ghost" className="w-full justify-between" onClick={() => onView(course.id)}>
                            Gérer le contenu
                            <Eye className="h-4 w-4" />
                        </Button>
                    </CardFooter>
                </Card>
            ))}
            {courses.length === 0 && (
                <div className="col-span-full py-12 text-center text-muted-foreground border-2 border-dashed rounded-lg">
                    <BookOpen className="h-12 w-12 mx-auto mb-4 opacity-20" />
                    <p>Aucun cours trouvé</p>
                </div>
            )}
        </div>
    );
}
