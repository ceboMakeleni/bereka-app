"use client"

import { useState, useEffect } from "react"
import { useParams } from "next/navigation"
import { createClient } from "@/lib/supabase"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Separator } from "@/components/ui/separator"
import { User, Briefcase, CheckCircle, Calendar, ArrowLeft, Star } from "lucide-react"
import Link from "next/link"

interface PublicProfile {
    id: string
    username: string | null
    bio: string | null
    role: string
    skills: string[] | null
    avatar_url: string | null
    has_wallet: boolean
    updated_at: string | null
}

interface JobStats {
    completed: number
    posted: number
}

function getRoleBadge(role: string) {
    switch (role) {
        case 'admin':
            return <Badge variant="destructive" className="text-xs">Admin</Badge>
        case 'client':
            return <Badge className="bg-blue-500/20 text-blue-500 border-blue-500/30 text-xs">Client</Badge>
        case 'worker':
            return <Badge className="bg-green-500/20 text-green-500 border-green-500/30 text-xs">Worker</Badge>
        default:
            return <Badge variant="secondary" className="text-xs">{role}</Badge>
    }
}

export default function ProfilePage() {
    const params = useParams()
    const profileId = params.id as string

    const [profile, setProfile] = useState<PublicProfile | null>(null)
    const [stats, setStats] = useState<JobStats>({ completed: 0, posted: 0 })
    const [loading, setLoading] = useState(true)
    const [isOwnProfile, setIsOwnProfile] = useState(false)

    useEffect(() => {
        const fetchProfile = async () => {
            const supabase = createClient()

            // Check if this is the user's own profile
            const { data: { user } } = await supabase.auth.getUser()
            if (user?.id === profileId) {
                setIsOwnProfile(true)
            }

            // Fetch from profiles_public view (safe — hides lnbits keys)
            const { data: profileData, error: profileError } = await supabase
                .from('profiles_public')
                .select('*')
                .eq('id', profileId)
                .single()

            if (profileError || !profileData) {
                console.error('Failed to fetch profile:', profileError)
                setLoading(false)
                return
            }

            setProfile(profileData)

            // Fetch job stats
            const [completedResult, postedResult] = await Promise.all([
                supabase
                    .from('jobs')
                    .select('id', { count: 'exact', head: true })
                    .eq('worker_id', profileId)
                    .eq('status', 'COMPLETED'),
                supabase
                    .from('jobs')
                    .select('id', { count: 'exact', head: true })
                    .eq('creator_id', profileId),
            ])

            setStats({
                completed: completedResult.count ?? 0,
                posted: postedResult.count ?? 0,
            })

            setLoading(false)
        }
        fetchProfile()
    }, [profileId])

    if (loading) {
        return (
            <div className="p-6 max-w-2xl mx-auto space-y-6">
                <Skeleton className="h-8 w-32" />
                <Card>
                    <CardContent className="p-8 space-y-4">
                        <div className="flex items-center gap-4">
                            <Skeleton className="h-20 w-20 rounded-full" />
                            <div className="space-y-2">
                                <Skeleton className="h-6 w-40" />
                                <Skeleton className="h-4 w-24" />
                            </div>
                        </div>
                        <Skeleton className="h-4 w-full" />
                        <Skeleton className="h-4 w-3/4" />
                    </CardContent>
                </Card>
            </div>
        )
    }

    if (!profile) {
        return (
            <div className="p-6 max-w-2xl mx-auto text-center space-y-4">
                <User className="h-12 w-12 mx-auto text-muted-foreground" />
                <h2 className="text-xl font-semibold">Profile not found</h2>
                <p className="text-muted-foreground">This user doesn&apos;t exist or their profile is unavailable.</p>
                <Button asChild variant="outline">
                    <Link href="/dashboard">
                        <ArrowLeft className="h-4 w-4 mr-2" />
                        Back to Dashboard
                    </Link>
                </Button>
            </div>
        )
    }

    return (
        <div className="p-6 max-w-2xl mx-auto space-y-6 animate-fade-in">
            <Button variant="ghost" size="sm" asChild className="text-muted-foreground hover:text-foreground">
                <Link href="/dashboard">
                    <ArrowLeft className="h-4 w-4 mr-1" />
                    Back
                </Link>
            </Button>

            <Card>
                <CardContent className="p-8">
                    {/* Profile Header */}
                    <div className="flex items-start gap-5">
                        <div className="shrink-0">
                            {profile.avatar_url ? (
                                <img
                                    src={profile.avatar_url}
                                    alt={profile.username ?? 'User'}
                                    className="h-20 w-20 rounded-full object-cover border-2 border-border"
                                />
                            ) : (
                                <div className="h-20 w-20 rounded-full bg-gradient-to-tr from-primary to-accent flex items-center justify-center text-primary-foreground text-2xl font-bold shadow-lg shadow-primary/20">
                                    {(profile.username ?? '?').charAt(0).toUpperCase()}
                                </div>
                            )}
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-3 flex-wrap">
                                <h1 className="text-2xl font-bold text-foreground">
                                    {profile.username ?? 'Anonymous'}
                                </h1>
                                {getRoleBadge(profile.role)}
                                {profile.has_wallet && (
                                    <Badge variant="outline" className="text-xs text-yellow-500 border-yellow-500/30">
                                        ⚡ Lightning
                                    </Badge>
                                )}
                            </div>
                            {isOwnProfile && (
                                <p className="text-xs text-muted-foreground mt-1">
                                    This is your profile ·{' '}
                                    <Link href="/dashboard/settings" className="text-primary hover:underline">
                                        Edit settings
                                    </Link>
                                </p>
                            )}
                        </div>
                    </div>

                    <Separator className="my-6" />

                    {/* Bio */}
                    {profile.bio && (
                        <div className="mb-6">
                            <h3 className="text-sm font-medium text-muted-foreground mb-2">About</h3>
                            <p className="text-sm text-foreground leading-relaxed">{profile.bio}</p>
                        </div>
                    )}

                    {/* Skills */}
                    {profile.skills && profile.skills.length > 0 && (
                        <div className="mb-6">
                            <h3 className="text-sm font-medium text-muted-foreground mb-2">Skills</h3>
                            <div className="flex flex-wrap gap-2">
                                {profile.skills.map((skill) => (
                                    <Badge key={skill} variant="secondary" className="text-xs">
                                        {skill}
                                    </Badge>
                                ))}
                            </div>
                        </div>
                    )}

                    <Separator className="my-6" />

                    {/* Stats */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                        <div className="text-center p-4 rounded-lg bg-muted/50">
                            <CheckCircle className="h-5 w-5 mx-auto mb-1 text-green-500" />
                            <p className="text-2xl font-bold text-foreground">{stats.completed}</p>
                            <p className="text-xs text-muted-foreground">Jobs Completed</p>
                        </div>
                        <div className="text-center p-4 rounded-lg bg-muted/50">
                            <Briefcase className="h-5 w-5 mx-auto mb-1 text-blue-500" />
                            <p className="text-2xl font-bold text-foreground">{stats.posted}</p>
                            <p className="text-xs text-muted-foreground">Jobs Posted</p>
                        </div>
                        <div className="text-center p-4 rounded-lg bg-muted/50 col-span-2 sm:col-span-1">
                            <Calendar className="h-5 w-5 mx-auto mb-1 text-purple-500" />
                            <p className="text-sm font-bold text-foreground">
                                {profile.updated_at
                                    ? new Date(profile.updated_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
                                    : 'N/A'}
                            </p>
                            <p className="text-xs text-muted-foreground">Member Since</p>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
