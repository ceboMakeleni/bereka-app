"use client"

import Link from "next/link"
import { useRouter, usePathname } from "next/navigation"
import { useState, useEffect, useRef, useCallback } from "react"
import { LayoutDashboard, Wallet, Briefcase, PlusCircle, Settings, LogOut, ShieldCheck, Menu, X, AlertCircle, FileText, Bell, MessageSquare } from "lucide-react"
import { Button } from "@/components/ui/button"
import { createClient } from "@/lib/supabase"
import { ThemeToggle } from "@/components/theme-toggle"

const navItems = [
    { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/dashboard/wallet', label: 'Wallet', icon: Wallet },
    { href: '/dashboard/jobs', label: 'Jobs', icon: Briefcase },
    { href: '/dashboard/jobs/create', label: 'Create Job', icon: PlusCircle },
    { href: '/dashboard/applications', label: 'Applications', icon: FileText },
    { href: '/dashboard/notifications', label: 'Notifications', icon: Bell },
    { href: '/dashboard/messages', label: 'Messages', icon: MessageSquare },
    { href: '/dashboard/disputes', label: 'Disputes', icon: AlertCircle },
]

interface DashboardShellProps {
    children: React.ReactNode
    isAdmin: boolean
    username: string | null
}

export default function DashboardShell({ children, isAdmin, username }: DashboardShellProps) {
    const router = useRouter()
    const pathname = usePathname()
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
    const hamburgerRef = useRef<HTMLButtonElement>(null)
    const drawerRef = useRef<HTMLDivElement>(null)

    // Close mobile menu on navigation
    useEffect(() => {
        setMobileMenuOpen(false)
    }, [pathname])

    // Focus trap for mobile menu (WCAG 2.4.3)
    useEffect(() => {
        if (!mobileMenuOpen || !drawerRef.current) return

        const drawer = drawerRef.current
        const focusableSelectors = 'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
        const focusableElements = drawer.querySelectorAll<HTMLElement>(focusableSelectors)
        const firstFocusable = focusableElements[0]
        const lastFocusable = focusableElements[focusableElements.length - 1]

        // Focus the close button when drawer opens
        firstFocusable?.focus()

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault()
                closeMobileMenu()
                return
            }

            if (e.key === 'Tab') {
                if (e.shiftKey) {
                    if (document.activeElement === firstFocusable) {
                        e.preventDefault()
                        lastFocusable?.focus()
                    }
                } else {
                    if (document.activeElement === lastFocusable) {
                        e.preventDefault()
                        firstFocusable?.focus()
                    }
                }
            }
        }

        drawer.addEventListener('keydown', handleKeyDown)
        return () => drawer.removeEventListener('keydown', handleKeyDown)
    }, [mobileMenuOpen])

    const closeMobileMenu = useCallback(() => {
        setMobileMenuOpen(false)
        // Return focus to hamburger button (WCAG 2.4.3)
        setTimeout(() => hamburgerRef.current?.focus(), 0)
    }, [])

    const handleSignOut = async () => {
        const supabase = createClient()
        await supabase.auth.signOut()
        router.push('/login')
    }

    const isActive = (href: string) => {
        if (href === '/dashboard') return pathname === '/dashboard'
        return pathname.startsWith(href)
    }

    const NavLinks = ({ mobile = false }: { mobile?: boolean }) => (
        <>
            {navItems.map(item => (
                <Link
                    key={item.href}
                    href={item.href}
                    aria-current={isActive(item.href) ? 'page' : undefined}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2 transition-all hover:text-primary hover:bg-primary/10 ${isActive(item.href)
                        ? 'text-primary bg-primary/10 font-semibold'
                        : 'text-muted-foreground'
                        } ${mobile ? 'text-base' : ''}`}
                >
                    <item.icon className={`h-4 w-4 ${isActive(item.href) ? 'text-primary' : ''}`} aria-hidden="true" />
                    <span className={mobile ? '' : 'hidden md:inline'}>{item.label}</span>
                </Link>
            ))}
            {isAdmin && (
                <Link
                    href="/dashboard/admin"
                    aria-current={isActive('/dashboard/admin') ? 'page' : undefined}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2 transition-all hover:text-primary hover:bg-primary/10 ${isActive('/dashboard/admin')
                        ? 'text-primary bg-primary/10 font-semibold'
                        : 'text-muted-foreground'
                        } ${mobile ? 'text-base' : ''}`}
                >
                    <ShieldCheck className={`h-4 w-4 ${isActive('/dashboard/admin') ? 'text-primary' : ''}`} aria-hidden="true" />
                    <span className={mobile ? '' : 'hidden md:inline'}>Admin</span>
                </Link>
            )}
        </>
    )

    return (
        <div className="flex min-h-screen w-full flex-col bg-background md:flex-row font-sans">
            {/* Desktop Sidebar */}
            <aside className="fixed inset-y-0 left-0 z-10 hidden w-16 flex-col border-r bg-card/50 backdrop-blur-xl sm:flex md:w-64 transition-all duration-300" aria-label="Sidebar">
                <div className="flex h-16 items-center border-b border-border/50 px-4 lg:px-6">
                    <Link href="/" className="flex items-center gap-2 font-bold text-lg tracking-tight hover:opacity-80 transition-opacity">
                        <div className="w-8 h-8 rounded-xl bg-primary flex items-center justify-center shadow-lg shadow-primary/20">
                            <Briefcase className="w-4 h-4 text-primary-foreground" aria-hidden="true" />
                        </div>
                        <span className="hidden md:inline bg-clip-text text-transparent bg-gradient-to-r from-foreground to-foreground/70">Bereka</span>
                    </Link>
                </div>
                {username && (
                    <div className="px-5 py-4 border-b border-border/50 flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-primary to-accent flex items-center justify-center text-primary-foreground font-semibold shadow-sm hidden md:flex" aria-hidden="true">
                            {username.charAt(0).toUpperCase()}
                        </div>
                        <div className="hidden md:block overflow-hidden">
                            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Signed in</p>
                            <p className="text-sm font-semibold truncate text-foreground">{username}</p>
                        </div>
                    </div>
                )}
                <nav className="flex flex-1 flex-col gap-1.5 p-4" aria-label="Main navigation">
                    <NavLinks />
                </nav>
                <div className="mt-auto p-4 space-y-2 border-t border-border/50 bg-muted/20">
                    <Link
                        href="/dashboard/settings"
                        aria-current={isActive('/dashboard/settings') ? 'page' : undefined}
                        className={`flex items-center gap-3 rounded-lg px-3 py-2 transition-all hover:text-primary hover:bg-primary/10 ${isActive('/dashboard/settings')
                            ? 'text-primary bg-primary/10 font-semibold'
                            : 'text-muted-foreground'
                            }`}
                    >
                        <Settings className="h-4 w-4" aria-hidden="true" />
                        <span className="hidden md:inline">Settings</span>
                    </Link>
                    <div className="flex items-center justify-between">
                        <ThemeToggle />
                    </div>
                </div>
            </aside>

            {/* Mobile Overlay */}
            {mobileMenuOpen && (
                <div
                    className="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm sm:hidden transition-all duration-300"
                    onClick={closeMobileMenu}
                    aria-hidden="true"
                />
            )}

            {/* Mobile Drawer */}
            <aside
                ref={drawerRef}
                role="dialog"
                aria-modal="true"
                aria-label="Navigation menu"
                className={`fixed inset-y-0 left-0 z-50 w-72 bg-card border-r shadow-2xl transform transition-transform duration-300 cubic-bezier(0.4, 0, 0.2, 1) sm:hidden flex flex-col ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
                    }`}
                {...(!mobileMenuOpen && { 'aria-hidden': 'true' })}
            >
                <div className="flex h-16 items-center justify-between border-b px-4">
                    <Link href="/" className="flex items-center gap-2 font-bold text-lg">
                        <div className="w-8 h-8 rounded-xl bg-primary flex items-center justify-center">
                            <Briefcase className="w-4 h-4 text-primary-foreground" aria-hidden="true" />
                        </div>
                        Bereka
                    </Link>
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={closeMobileMenu}
                        className="rounded-full"
                        aria-label="Close navigation menu"
                    >
                        <X className="h-5 w-5" aria-hidden="true" />
                    </Button>
                </div>
                {username && (
                    <div className="px-4 py-4 border-b flex items-center gap-3 bg-muted/10">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-primary to-accent flex items-center justify-center text-primary-foreground font-semibold shadow-sm" aria-hidden="true">
                            {username.charAt(0).toUpperCase()}
                        </div>
                        <div className="overflow-hidden">
                            <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Signed in</p>
                            <p className="text-base font-semibold truncate text-foreground">{username}</p>
                        </div>
                    </div>
                )}
                <nav className="flex flex-col gap-1 p-4 overflow-y-auto" aria-label="Main navigation">
                    <NavLinks mobile />
                </nav>
                <div className="mt-auto p-4 border-t space-y-2 bg-muted/10">
                    <Link
                        href="/dashboard/settings"
                        aria-current={isActive('/dashboard/settings') ? 'page' : undefined}
                        className={`flex items-center gap-3 rounded-lg px-3 py-3 transition-all hover:text-primary hover:bg-primary/10 ${isActive('/dashboard/settings')
                            ? 'text-primary bg-primary/10 font-semibold'
                            : 'text-muted-foreground'
                            }`}
                    >
                        <Settings className="h-4 w-4" aria-hidden="true" />
                        <span>Settings</span>
                    </Link>
                    <div className="flex items-center justify-between">
                        <ThemeToggle />
                        <Button
                            variant="ghost"
                            className="flex-1 justify-start gap-3 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg p-3 h-auto"
                            onClick={handleSignOut}
                        >
                            <LogOut className="h-4 w-4" aria-hidden="true" />
                            <span className="font-medium">Sign Out</span>
                        </Button>
                    </div>
                </div>
            </aside>

            {/* Main Content */}
            <div className="flex flex-col flex-1 sm:gap-4 sm:py-4 sm:pl-16 md:pl-64 min-w-0">
                <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b bg-background/80 backdrop-blur-xl px-4 sm:static sm:h-auto sm:border-0 sm:bg-transparent sm:px-8 transition-all duration-200">
                    {/* Mobile hamburger */}
                    <Button
                        ref={hamburgerRef}
                        variant="ghost"
                        size="icon"
                        className="sm:hidden -ml-2"
                        onClick={() => setMobileMenuOpen(true)}
                        aria-expanded={mobileMenuOpen}
                        aria-controls="mobile-nav-drawer"
                        aria-label="Open navigation menu"
                    >
                        <Menu className="h-5 w-5" aria-hidden="true" />
                    </Button>
                    <div className="font-bold text-lg sm:hidden flex items-center gap-2" aria-hidden="true">
                        <div className="w-6 h-6 rounded-md bg-primary flex items-center justify-center">
                            <Briefcase className="w-3 h-3 text-primary-foreground" />
                        </div>
                        Bereka
                    </div>
                    <div className="ml-auto flex items-center gap-3">
                        <Button variant="outline" size="sm" onClick={handleSignOut} className="hidden sm:flex rounded-full px-4 border-border/50 hover:bg-destructive/5 hover:text-destructive hover:border-destructive/30 transition-all">
                            <LogOut className="h-3.5 w-3.5 mr-2" aria-hidden="true" />
                            <span className="font-medium">Sign Out</span>
                        </Button>
                    </div>
                </header>
                <main id="main-content" className="flex-1 items-start p-4 sm:px-8 sm:py-2 max-w-7xl mx-auto w-full" tabIndex={-1}>
                    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                        {children}
                    </div>
                </main>
            </div>
        </div>
    )
}
