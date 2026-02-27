import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { createServerSupabaseClient } from "@/lib/supabase-server"
import { redirect } from "next/navigation"

export default async function DashboardPage() {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) redirect('/login')

    // Fetch real balances from accounts table
    const { data: accounts } = await supabase
        .from('accounts')
        .select('type, balance_sats')
        .eq('user_id', user.id)

    const availableBalance = accounts?.find(a => a.type === 'AVAILABLE')?.balance_sats ?? 0
    const escrowBalance = accounts?.find(a => a.type === 'ESCROW')?.balance_sats ?? 0

    // Fetch active jobs count
    const { count: activeJobsCount } = await supabase
        .from('jobs')
        .select('*', { count: 'exact', head: true })
        .eq('creator_id', user.id)
        .in('status', ['OPEN', 'FUNDED', 'IN_PROGRESS', 'REVIEW', 'DISPUTED'])

    // Fetch jobs assigned to user as worker
    const { count: workingJobsCount } = await supabase
        .from('jobs')
        .select('*', { count: 'exact', head: true })
        .eq('worker_id', user.id)
        .in('status', ['IN_PROGRESS', 'REVIEW'])

    return (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">
                        Available Balance
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">{Number(availableBalance).toLocaleString()} sats</div>
                    <p className="text-xs text-muted-foreground">
                        Ready to spend or withdraw
                    </p>
                </CardContent>
            </Card>
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">
                        Escrowed Funds
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">{Number(escrowBalance).toLocaleString()} sats</div>
                    <p className="text-xs text-muted-foreground">
                        Locked in active jobs
                    </p>
                </CardContent>
            </Card>
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">
                        Your Posted Jobs
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">{activeJobsCount ?? 0}</div>
                    <p className="text-xs text-muted-foreground">
                        Active jobs you created
                    </p>
                </CardContent>
            </Card>
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">
                        Working On
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">{workingJobsCount ?? 0}</div>
                    <p className="text-xs text-muted-foreground">
                        Jobs assigned to you
                    </p>
                </CardContent>
            </Card>

            <div className="col-span-full mt-4">
                <h2 className="text-lg font-semibold mb-4">Quick Actions</h2>
                <div className="flex flex-wrap gap-4">
                    <Link href="/dashboard/wallet">
                        <Button>Top Up Wallet</Button>
                    </Link>
                    <Link href="/dashboard/jobs/create">
                        <Button variant="outline">Create New Job</Button>
                    </Link>
                    <Link href="/dashboard/jobs">
                        <Button variant="outline">Browse Jobs</Button>
                    </Link>
                </div>
            </div>
        </div>
    )
}
