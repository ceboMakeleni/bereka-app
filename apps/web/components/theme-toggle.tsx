"use client"

import { useEffect, useState } from "react"
import { Moon, Sun } from "lucide-react"
import { Button } from "@/components/ui/button"

export function ThemeToggle() {
    const [theme, setTheme] = useState<'light' | 'dark'>('dark')
    const [mounted, setMounted] = useState(false)

    useEffect(() => {
        setMounted(true)
        const stored = localStorage.getItem('theme') as 'light' | 'dark' | null
        const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches
        const initial = stored ?? (systemDark ? 'dark' : 'light')
        setTheme(initial)
        document.documentElement.classList.toggle('dark', initial === 'dark')
    }, [])

    const toggle = () => {
        const next = theme === 'dark' ? 'light' : 'dark'
        setTheme(next)
        localStorage.setItem('theme', next)
        document.documentElement.classList.toggle('dark', next === 'dark')
    }

    // Prevent hydration mismatch — render nothing until mounted
    if (!mounted) return <div className="h-9 w-9" />

    return (
        <Button
            variant="ghost"
            size="icon"
            onClick={toggle}
            className="h-9 w-9 text-muted-foreground hover:text-foreground"
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
        >
            {theme === 'dark' ? (
                <Sun className="h-4 w-4" />
            ) : (
                <Moon className="h-4 w-4" />
            )}
        </Button>
    )
}
