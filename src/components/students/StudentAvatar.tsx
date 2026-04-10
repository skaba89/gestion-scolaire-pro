import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { resolveUploadUrl } from "@/utils/url";

interface StudentAvatarProps {
    photoUrl?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    className?: string;
    fallbackClassName?: string;
}

export const StudentAvatar = ({
    photoUrl,
    firstName,
    lastName,
    className,
    fallbackClassName,
}: StudentAvatarProps) => {
    const initials = `${firstName?.[0] || ""}${lastName?.[0] || ""}`.toUpperCase() || "?";

    return (
        <Avatar className={cn("h-10 w-10", className)}>
            <AvatarImage
                src={resolveUploadUrl(photoUrl) || undefined}
                alt={`${firstName || ""} ${lastName || ""}`}
                className="object-cover"
            />
            <AvatarFallback className={cn("bg-primary/10 text-primary font-medium", fallbackClassName)}>
                {initials}
            </AvatarFallback>
        </Avatar>
    );
};
