import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AppRole } from "@/queries/users";
import {
    Shield,
    Settings2,
    GraduationCap,
    School,
    BookOpen,
    Users as UsersIcon,
    Wallet,
    Briefcase,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
    getRoleLabel as getRoleLabelBase,
    getRoleDescription,
    getPermissionCategories,
    ROLE_PERMISSIONS
} from "@/lib/permissions";
import { useStudentLabel } from "@/hooks/useStudentLabel";

const ROLE_COLORS: Record<AppRole, string> = {
    SUPER_ADMIN: "bg-red-500",
    TENANT_ADMIN: "bg-purple-500",
    DIRECTOR: "bg-blue-500",
    DEPARTMENT_HEAD: "bg-indigo-500",
    TEACHER: "bg-green-500",
    STUDENT: "bg-yellow-500",
    PARENT: "bg-orange-500",
    ACCOUNTANT: "bg-cyan-500",
    STAFF: "bg-gray-500",
};

const ROLE_ICONS: Record<AppRole, any> = {
    SUPER_ADMIN: Shield,
    TENANT_ADMIN: Settings2,
    DIRECTOR: GraduationCap,
    DEPARTMENT_HEAD: School,
    TEACHER: BookOpen,
    STUDENT: GraduationCap,
    PARENT: UsersIcon,
    ACCOUNTANT: Wallet,
    STAFF: Briefcase,
};

export const UserRoles = () => {
    const { studentLabel, studentsLabel, StudentLabel, StudentsLabel } = useStudentLabel();
    const permissionCategories = getPermissionCategories(StudentsLabel);

    const getRoleLabel = (role: AppRole) => {
        return getRoleLabelBase(role, StudentLabel);
    };

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {(Object.keys(ROLE_COLORS) as AppRole[]).map((role) => (
                <Card key={role} className="border-none shadow-md hover:shadow-lg transition-all duration-300">
                    <CardHeader className={`${ROLE_COLORS[role]} text-white rounded-t-xl`}>
                        <div className="flex justify-between items-center">
                            <CardTitle className="flex items-center gap-2 text-lg">
                                {(() => {
                                    const Icon = ROLE_ICONS[role];
                                    return <Icon className="w-5 h-5 text-white/90" />;
                                })()}
                                {getRoleLabel(role)}
                            </CardTitle>
                        </div>
                        <CardDescription className="text-white/80">
                            {getRoleDescription(role, studentLabel, studentsLabel)}
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="pt-6">
                        <div className="space-y-4">
                            <div>
                                <p className="text-sm font-medium mb-3 text-muted-foreground uppercase tracking-wider text-xs">
                                    Permissions
                                </p>
                                <ScrollArea className="h-[200px] pr-4">
                                    <div className="space-y-4">
                                        {permissionCategories.map((category) => {
                                            const rolePerms = (ROLE_PERMISSIONS as any)[role] || [];
                                            const categoryPerms = category.permissions.filter((p) =>
                                                rolePerms.includes(p.key)
                                            );

                                            if (categoryPerms.length === 0) return null;

                                            return (
                                                <div key={category.name} className="space-y-2">
                                                    <p className="text-xs font-semibold text-primary/80">
                                                        {category.name}
                                                    </p>
                                                    <div className="flex flex-wrap gap-1.5">
                                                        {categoryPerms.map((perm) => (
                                                            <Badge
                                                                key={perm.key}
                                                                variant="secondary"
                                                                className="text-[10px] bg-muted hover:bg-muted/80 text-foreground border border-border"
                                                            >
                                                                {perm.label}
                                                            </Badge>
                                                        ))}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </ScrollArea>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            ))}
        </div>
    );
};
