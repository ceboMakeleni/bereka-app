import { cn } from "@/lib/utils"
import { LucideIcon, Inbox } from "lucide-react"
import { Button } from "@/components/ui/button"
import Link from "next/link"

interface EmptyStateProps {
    icon?: LucideIcon
    title: string
    description?: string
    actionLabel?: string
    actionHref?: string
    onAction?: () => void
    className?: string
}

export function EmptyState({
    icon: Icon = Inbox,
    title,
    description,
    actionLabel,
    actionHref,
    onAction,
    className,
}: EmptyStateProps) {
    return (
        <div className={cn(
            "flex flex-col items-center justify-center py-12 px-4 text-center",
            className
        )}>
            <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
                <Icon className="w-6 h-6 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold mb-1">{title}</h3>
            {description && (
                <p className="text-sm text-muted-foreground max-w-sm mb-4">{description}</p>
            )}
            {actionLabel && actionHref && (
                <Link href={actionHref}>
                    <Button size="sm">{actionLabel}</Button>
                </Link>
            )}
            {actionLabel && onAction && !actionHref && (
                <Button size="sm" onClick={onAction}>{actionLabel}</Button>
            )}
        </div>
    )
}
