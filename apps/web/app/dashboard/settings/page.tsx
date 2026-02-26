"use client"

import { useState, useEffect, useRef } from "react"
import { createClient } from "@/lib/supabase"
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import { Camera, X, Wallet, Zap } from "lucide-react"

interface Profile {
    username: string | null
    bio: string | null
    role: string
    lnbits_id: string | null
    skills: string[] | null
    avatar_url: string | null
}

type WalletStatus = "idle" | "creating" | "success" | "error"

const SUGGESTED_SKILLS = [
    'JavaScript', 'TypeScript', 'React', 'Node.js', 'Python',
    'Design', 'Writing', 'Marketing', 'Data Entry', 'Testing',
    'Translation', 'Video Editing', 'Community Management', 'Research'
]

export default function SettingsPage() {
    const [profile, setProfile] = useState<Profile | null>(null)
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [username, setUsername] = useState("")
    const [bio, setBio] = useState("")
    const [skills, setSkills] = useState<string[]>([])
    const [skillInput, setSkillInput] = useState("")
    const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
    const [uploadingAvatar, setUploadingAvatar] = useState(false)
    const [walletStatus, setWalletStatus] = useState<WalletStatus>("idle")
    const fileInputRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        const fetchProfile = async () => {
            const supabase = createClient()
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return

            const { data } = await supabase
                .from('profiles')
                .select('username, bio, role, lnbits_id, skills, avatar_url')
                .eq('id', user.id)
                .single()

            if (data) {
                setProfile(data)
                setUsername(data.username ?? "")
                setBio(data.bio ?? "")
                setSkills(data.skills ?? [])
                setAvatarUrl(data.avatar_url)
            }
            setLoading(false)
        }
        fetchProfile()
    }, [])

    const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        // Validate file type and size
        if (!file.type.startsWith('image/')) {
            toast.error('Please select an image file')
            return
        }
        if (file.size > 5 * 1024 * 1024) {
            toast.error('Image must be less than 5MB')
            return
        }

        setUploadingAvatar(true)
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        try {
            const fileExt = file.name.split('.').pop()
            const filePath = `${user.id}/avatar.${fileExt}`

            const { error: uploadError } = await supabase.storage
                .from('avatars')
                .upload(filePath, file, { upsert: true })

            if (uploadError) throw uploadError

            const { data: { publicUrl } } = supabase.storage
                .from('avatars')
                .getPublicUrl(filePath)

            // Add cache buster
            const url = `${publicUrl}?t=${Date.now()}`
            setAvatarUrl(url)

            // Save to profile
            await supabase
                .from('profiles')
                .update({ avatar_url: url })
                .eq('id', user.id)

            toast.success('Avatar updated!')
        } catch (err: any) {
            toast.error(err.message || 'Failed to upload avatar')
        } finally {
            setUploadingAvatar(false)
        }
    }

    const addSkill = (skill: string) => {
        const trimmed = skill.trim()
        if (trimmed && !skills.includes(trimmed) && skills.length < 10) {
            setSkills([...skills, trimmed])
            setSkillInput("")
        }
    }

    const removeSkill = (skill: string) => {
        setSkills(skills.filter(s => s !== skill))
    }

    const handleSkillKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault()
            addSkill(skillInput)
        }
    }

    const handleCreateWallet = async () => {
        setWalletStatus("creating")
        const supabase = createClient()
        try {
            const { error } = await supabase.functions.invoke("create-wallet", {
                body: {},
            })
            if (error) throw error
            setWalletStatus("success")
            // Refresh profile to show wallet status
            const { data: { user } } = await supabase.auth.getUser()
            if (user) {
                const { data } = await supabase
                    .from("profiles")
                    .select("username, bio, role, lnbits_id, skills, avatar_url")
                    .eq("id", user.id)
                    .single()
                if (data) setProfile(data)
            }
            toast.success("Lightning wallet created successfully!")
        } catch (err: any) {
            setWalletStatus("error")
            toast.error(err.message || "Failed to create wallet. Please try again.")
        }
    }

    const handleSave = async () => {
        if (username.trim().length < 3) {
            toast.error('Username must be at least 3 characters')
            return
        }

        setSaving(true)
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        const { error } = await supabase
            .from('profiles')
            .update({
                username: username.trim() || null,
                bio: bio.trim() || null,
                skills: skills.length > 0 ? skills : null,
                updated_at: new Date().toISOString()
            })
            .eq('id', user.id)

        if (error) {
            toast.error(error.message)
        } else {
            toast.success('Profile updated successfully!')
        }
        setSaving(false)
    }

    if (loading) return <div className="p-8">Loading...</div>

    return (
        <div className="max-w-3xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div>
                <h1 className="text-3xl font-extrabold tracking-tight">Settings</h1>
                <p className="text-muted-foreground mt-2 text-lg">Manage your profile, skills, and wallet configuration.</p>
            </div>

            {/* Avatar */}
            <Card className="border-border/50 bg-card/40 backdrop-blur-md shadow-sm overflow-hidden">
                <CardHeader className="bg-muted/10 border-b border-border/50 pb-4">
                    <CardTitle>Profile Picture</CardTitle>
                    <CardDescription>Upload a profile photo to personalize your account.</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col sm:flex-row items-start sm:items-center gap-6 pt-6 mb-4">
                    <div
                        className="relative h-24 w-24 rounded-full bg-muted flex flex-shrink-0 items-center justify-center overflow-hidden border-2 border-dashed border-primary/30 cursor-pointer hover:border-primary transition-colors shadow-sm"
                        onClick={() => fileInputRef.current?.click()}
                    >
                        {avatarUrl ? (
                            <img src={avatarUrl} alt="Avatar" className="h-full w-full object-cover" />
                        ) : (
                            <Camera className="h-8 w-8 text-muted-foreground/50" />
                        )}
                        {uploadingAvatar && (
                            <div className="absolute inset-0 bg-background/80 flex items-center justify-center backdrop-blur-sm">
                                <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                            </div>
                        )}
                    </div>
                    <div className="space-y-2">
                        <Button
                            variant="secondary"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={uploadingAvatar}
                            className="font-medium hover:bg-secondary/80"
                        >
                            {uploadingAvatar ? 'Uploading...' : 'Change Photo'}
                        </Button>
                        <p className="text-sm text-muted-foreground">Max 5MB. Recommended square image (JPG, PNG, WebP).</p>
                    </div>
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        className="hidden"
                        onChange={handleAvatarUpload}
                    />
                </CardContent>
            </Card>

            {/* Profile Info */}
            <Card className="border-border/50 bg-card/40 backdrop-blur-md shadow-sm">
                <CardHeader className="bg-muted/10 border-b border-border/50 pb-4">
                    <CardTitle>Public Profile</CardTitle>
                    <CardDescription>Update how you appear to others on the platform.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6 pt-6">
                    <div className="space-y-3">
                        <Label htmlFor="username" className="text-sm font-semibold">Username</Label>
                        <Input
                            id="username"
                            value={username}
                            onChange={e => setUsername(e.target.value)}
                            placeholder="your_username"
                            minLength={3}
                            className="bg-background/50 border-border/50 focus-visible:ring-primary/50"
                        />
                        <p className="text-xs text-muted-foreground">This is your public display name. Minimum 3 characters.</p>
                    </div>

                    <div className="space-y-3">
                        <Label htmlFor="bio" className="text-sm font-semibold">Bio</Label>
                        <Textarea
                            id="bio"
                            value={bio}
                            onChange={e => setBio(e.target.value)}
                            placeholder="Tell potential clients or workers about your experience and what you do best..."
                            rows={4}
                            className="bg-background/50 border-border/50 focus-visible:ring-primary/50 resize-y"
                        />
                    </div>

                    <div className="space-y-4 pt-2">
                        <Label className="text-sm font-semibold">Skills & Expertise</Label>

                        <div className="flex flex-wrap gap-2">
                            {skills.map(skill => (
                                <Badge key={skill} variant="secondary" className="px-3 py-1 gap-1.5 text-sm bg-secondary/60 hover:bg-secondary border-border/50">
                                    {skill}
                                    <button
                                        onClick={() => removeSkill(skill)}
                                        className="ml-1 rounded-full hover:bg-destructive/20 hover:text-destructive transition-colors p-0.5"
                                        aria-label={`Remove ${skill}`}
                                    >
                                        <X className="h-3.5 w-3.5" />
                                    </button>
                                </Badge>
                            ))}
                        </div>

                        <div className="flex gap-3">
                            <Input
                                value={skillInput}
                                onChange={e => setSkillInput(e.target.value)}
                                onKeyDown={handleSkillKeyDown}
                                placeholder="E.g., React, Go, Video Editing..."
                                disabled={skills.length >= 10}
                                className="bg-background/50 border-border/50 focus-visible:ring-primary/50"
                            />
                            <Button
                                variant="secondary"
                                onClick={() => addSkill(skillInput)}
                                disabled={!skillInput.trim() || skills.length >= 10}
                                className="px-6 font-medium"
                            >
                                Add
                            </Button>
                        </div>

                        {skills.length < 10 && (
                            <div className="space-y-2">
                                <p className="text-xs font-medium text-muted-foreground">Suggested Skills:</p>
                                <div className="flex flex-wrap gap-2">
                                    {SUGGESTED_SKILLS
                                        .filter(s => !skills.includes(s))
                                        .slice(0, 8)
                                        .map(s => (
                                            <Button
                                                key={s}
                                                variant="outline"
                                                size="sm"
                                                className="h-7 text-xs rounded-full border-border/50 bg-background/50 hover:bg-primary/10 hover:text-primary hover:border-primary/30 transition-colors"
                                                onClick={() => addSkill(s)}
                                            >
                                                + {s}
                                            </Button>
                                        ))
                                    }
                                </div>
                            </div>
                        )}
                        <p className="text-xs text-muted-foreground/80 font-medium">{skills.length}/10 skills added.</p>
                    </div>

                    <div className="pt-6 border-t border-border/40">
                        <Button
                            onClick={handleSave}
                            disabled={saving}
                            className="bg-gradient-to-r from-primary to-accent hover:opacity-90 transition-opacity font-semibold px-8"
                        >
                            {saving ? 'Saving Changes...' : 'Save Profile'}
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {/* Account Info */}
            <Card className="border-border/50 bg-card/40 backdrop-blur-md shadow-sm">
                <CardHeader className="bg-muted/10 border-b border-border/50 pb-4">
                    <CardTitle>Account Status</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6 pt-6">
                    <div className="grid gap-6 sm:grid-cols-2">
                        <div className="space-y-2 p-4 rounded-xl bg-background/50 border border-border/40">
                            <span className="text-sm font-semibold text-muted-foreground block">Account Role</span>
                            <div className="flex items-center gap-2">
                                <Badge variant="secondary" className="capitalize px-3 py-1 bg-primary/10 text-primary border-primary/20">
                                    {profile?.role ?? 'Worker'}
                                </Badge>
                            </div>
                        </div>
                        <div className="space-y-2 p-4 rounded-xl bg-background/50 border border-border/40">
                            <span className="text-sm font-semibold text-muted-foreground block">Lightning Wallet</span>
                            <div className="flex items-center gap-2">
                                <Badge variant={profile?.lnbits_id ? 'default' : 'outline'} className={profile?.lnbits_id ? "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20 px-3 py-1" : "px-3 py-1"}>
                                    {profile?.lnbits_id ? 'Active & Provisioned' : 'Not Provisioned'}
                                </Badge>
                            </div>
                        </div>
                    </div>

                    {!profile?.lnbits_id && (
                        <div className="pt-4 mt-2 border-t border-border/40">
                            <div className="flex flex-col sm:flex-row gap-4 items-center justify-between p-4 rounded-xl bg-yellow-500/5 border border-yellow-500/20">
                                <div>
                                    <h4 className="font-semibold text-yellow-600 dark:text-yellow-500 mb-1 flex items-center gap-2"><Zap className="h-4 w-4" /> Wallet Required</h4>
                                    <p className="text-sm text-muted-foreground">
                                        You need a Lightning wallet to receive payments or fund jobs.
                                    </p>
                                </div>
                                <Button
                                    onClick={handleCreateWallet}
                                    disabled={walletStatus === "creating"}
                                    className="w-full sm:w-auto gap-2 bg-yellow-500 hover:bg-yellow-600 text-white border-0 shadow-md"
                                >
                                    <Wallet className="h-4 w-4" />
                                    {walletStatus === "creating" ? "Creating wallet..." : "Create Wallet Now"}
                                </Button>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}
