import { Building2 } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { avatarFallbackStyle, initialsFromName } from "@/lib/relation/avatar-color";
import type { RelationEntityType } from "@/lib/relation/types";

const SIZE: Record<"sm" | "md" | "lg", string> = {
  sm: "h-10 w-10 text-xs",
  md: "h-12 w-12 text-sm",
  lg: "h-16 w-16 text-base",
};

export function RelationAvatar({
  name,
  imageUrl,
  entityType = "person",
  size = "md",
  className,
}: {
  name: string;
  imageUrl?: string | null;
  entityType?: RelationEntityType | null;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const isCompany = entityType === "company";
  const style = avatarFallbackStyle(name);

  return (
    <Avatar
      className={cn(
        SIZE[size],
        isCompany ? "rounded-xl" : "rounded-full",
        "bg-muted",
        className,
      )}
    >
      {imageUrl ? (
        <AvatarImage
          src={imageUrl}
          alt=""
          className={cn("object-cover", isCompany ? "rounded-xl" : "rounded-full")}
        />
      ) : null}
      <AvatarFallback
        className={cn(isCompany ? "rounded-xl" : "rounded-full", "font-semibold")}
        style={style}
      >
        {isCompany ? (
          <span className="flex flex-col items-center gap-0.5">
            <Building2 className="h-[45%] w-[45%] opacity-80" />
          </span>
        ) : (
          initialsFromName(name)
        )}
      </AvatarFallback>
    </Avatar>
  );
}
