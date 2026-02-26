import { createServerSupabaseClient } from "@/lib/supabase-server"
import { redirect } from "next/navigation"
import DashboardShell from "./DashboardShell"

export default async function DashboardLayout({
    children,
}: {
    children: React.ReactNode
}) {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        redirect('/login')
    }

    const { data: profile } = await supabase
        .from('profiles')
        .select('role, username')
        .eq('id', user.id)
        .single()

    const isAdmin = profile?.role === 'admin'
    const username = profile?.username || null

    return (
        <DashboardShell isAdmin={isAdmin} username={username}>
            {children}
        </DashboardShell>
    )
}
