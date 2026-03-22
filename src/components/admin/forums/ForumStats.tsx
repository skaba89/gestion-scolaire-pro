import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface ForumStatsProps {
    activeCount: number;
    totalPosts: number;
    categoryCount: number;
    inactiveCount: number;
}

export const ForumStats = ({
    activeCount,
    totalPosts,
    categoryCount,
    inactiveCount,
}: ForumStatsProps) => {
    return (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
                <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                        Forums actifs
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">{activeCount}</div>
                </CardContent>
            </Card>
            <Card>
                <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                        Total discussions
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">{totalPosts}</div>
                </CardContent>
            </Card>
            <Card>
                <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                        Catégories
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">{categoryCount}</div>
                </CardContent>
            </Card>
            <Card>
                <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                        Forums inactifs
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">{inactiveCount}</div>
                </CardContent>
            </Card>
        </div>
    );
};
