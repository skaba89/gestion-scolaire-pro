import { Link } from "react-router-dom";
import { GraduationCap, BookOpen, Award, ChevronRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface PublicProgramsGridProps {
    levels: any[];
    fees: any[];
    levelsLoading: boolean;
    tenantSlug: string;
    formatAmount: (value: number) => string;
}

export const PublicProgramsGrid = ({
    levels,
    fees,
    levelsLoading,
    tenantSlug,
    formatAmount,
}: PublicProgramsGridProps) => {
    return (
        <section className="container mx-auto px-4 py-12">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {levelsLoading ? (
                    <div className="col-span-full flex justify-center py-12">
                        <Loader2 className="w-8 h-8 animate-spin text-primary" />
                    </div>
                ) : levels && levels.length > 0 ? (
                    levels.map((level) => {
                        const levelFee = fees?.find(f => f.applies_to_levels?.includes(level.id));

                        return (
                            <Card key={level.id} className="group hover:shadow-lg transition-all duration-300 border-border/50 hover:border-primary/30">
                                <CardHeader className="pb-4">
                                    <div className="flex items-start justify-between">
                                        <div className="p-3 rounded-xl bg-primary/10 group-hover:bg-primary/20 transition-colors">
                                            <GraduationCap className="w-6 h-6 text-primary" />
                                        </div>
                                        {level.order_index && (
                                            <Badge variant="secondary">Niveau {level.order_index}</Badge>
                                        )}
                                    </div>
                                    <CardTitle className="text-xl mt-4">{level.name}</CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="space-y-2">
                                        {levelFee && (
                                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                                <Award className="w-4 h-4" />
                                                <span>{formatAmount(levelFee.amount || 0)}/an</span>
                                            </div>
                                        )}
                                    </div>

                                    <Link to={`/admissions/${tenantSlug}?level=${level.id}`}>
                                        <Button className="w-full group-hover:bg-primary group-hover:text-primary-foreground" variant="outline">
                                            S'inscrire à ce programme
                                            <ChevronRight className="w-4 h-4 ml-2" />
                                        </Button>
                                    </Link>
                                </CardContent>
                            </Card>
                        );
                    })
                ) : (
                    <div className="col-span-full text-center py-12">
                        <BookOpen className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                        <h3 className="text-lg font-medium text-foreground mb-2">Aucun programme disponible</h3>
                        <p className="text-muted-foreground">Les programmes seront bientôt publiés.</p>
                    </div>
                )}
            </div>
        </section>
    );
};
