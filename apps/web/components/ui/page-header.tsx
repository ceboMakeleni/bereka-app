import { cn } from "@/lib/utils"
import { LucideIcon } from "lucide-react"

interface PageHeaderProps {
    title: string
    description?: string
    icon?: LucideIcon
    children?: React.ReactNode
    className?: string
}

export function PageHeader({ title, description, icon: Icon, children, className }: PageHeaderProps) {
    return (
        <div className={cn("flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between", className)}>
            <div className="space-y-1">
                <div className="flex items-center gap-2">
                    {Icon && <Icon className="h-6 w-6 text-primary" />}
                    <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
                </div>
                {description && (
                    <p className="text-muted-foreground">{description}</p>
                )}
            </div>
            {children && (
                <div className="flex items-center gap-2 mt-2 sm:mt-0">
                    {children}
                </div>
            )}
        </div>
    )
}
