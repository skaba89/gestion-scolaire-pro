import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useStudentLabel } from "@/hooks/useStudentLabel";
import { getRoleLabel as getRoleLabelBase } from "@/lib/permissions";
import { UserWithRoles, AppRole } from "@/queries/users";
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
import { useAuth } from "@/contexts/AuthContext";

interface UserStatsProps {
    users: UserWithRoles[];
    roleFilter: string;
    setRoleFilter: (role: string) => void;
}

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

export const UserStats = ({
    users,
    roleFilter,
    setRoleFilter,
}: UserStatsProps) => {
    const { StudentLabel } = useStudentLabel();
    const { hasRole } = useAuth();

    const getRoleLabel = (role: AppRole) => {
        return getRoleLabelBase(role, StudentLabel);
    };

    const roleStats = users.reduce((acc, user) => {
        user.roles.forEach((role) => {
            acc[role] = (acc[role] || 0) + 1;
        });
        return acc;
    }, {} as Record<AppRole, number>);

    return (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-4 px-1">
            {(Object.keys(ROLE_COLORS) as AppRole[])
                .filter(role => hasRole("SUPER_ADMIN") || role !== "SUPER_ADMIN")
                .map((role) => (
                    <Card
                        key={role}
                        className={cn(
                            "group relative overflow-hidden cursor-pointer transition-all duration-300 hover:scale-105 hover:shadow-xl border-none",
                            roleFilter === role ? "ring-2 ring-primary ring-offset-2 shadow-lg" : "shadow-md bg-white/50 backdrop-blur-sm"
                        )}
                        onClick={() => {
                            if (roleFilter === role) {
                                setRoleFilter("all");
                            } else {
                                setRoleFilter(role);
                            }
                        }}
                    >
                        {/* Background Decorative Gradient */}
                        <div className={cn(
                            "absolute inset-0 opacity-5 transition-opacity group-hover:opacity-10",
                            ROLE_COLORS[role]
                        )} />

                        <CardContent className="p-4 text-center relative z-10 flex flex-col items-center justify-center min-h-[110px]">
                            <div className={cn(
                                "w-12 h-12 rounded-2xl flex items-center justify-center mb-3 shadow-lg transition-all duration-500 group-hover:rotate-12 group-hover:scale-110",
                                ROLE_COLORS[role],
                                "bg-opacity-10 text-current"
                            )}>
                                {(() => {
                                    const Icon = ROLE_ICONS[role] || Shield;
                                    return <Icon className={cn("w-6 h-6", ROLE_COLORS[role].replace('bg-', 'text-'))} />;
                                })()}
                            </div>

                            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 mb-1">
                                {getRoleLabel(role)}
                            </p>
                            <p className="text-2xl font-black font-display leading-none">
                                {roleStats[role] || 0}
                            </p>
                        </CardContent>
                    </Card>
                ))}
        </div>
    );
};
