import { BookOpen } from "lucide-react";

interface PublicSubjectsSectionProps {
    subjects: any[];
}

export const PublicSubjectsSection = ({ subjects }: PublicSubjectsSectionProps) => {
    if (!subjects || subjects.length === 0) return null;

    return (
        <section className="bg-muted/30 py-16">
            <div className="container mx-auto px-4">
                <h2 className="text-2xl font-display font-bold text-foreground mb-8">
                    Matières enseignées
                </h2>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
                    {subjects.map((subject) => (
                        <div
                            key={subject.id}
                            className="bg-card p-4 rounded-xl border border-border/50 hover:border-primary/30 transition-colors text-center"
                        >
                            <div
                                className="w-10 h-10 rounded-lg mx-auto mb-2 flex items-center justify-center bg-primary/10"
                            >
                                <BookOpen className="w-5 h-5 text-primary" />
                            </div>
                            <p className="text-sm font-medium text-foreground">{subject.name}</p>
                            {subject.code && (
                                <p className="text-xs text-muted-foreground">{subject.code}</p>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
};
