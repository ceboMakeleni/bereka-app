"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Card, CardHeader, CardTitle, CardContent, CardFooter, CardDescription } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { createClient } from "@/lib/supabase"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { createJobSchema, validate } from "@/lib/validations"

export default function CreateJobPage() {
    const router = useRouter()
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState("")
    const [categories, setCategories] = useState<{ id: string; name: string }[]>([])
    const [formData, setFormData] = useState({
        title: "",
        description: "",
        budget: 0,
        category: "",
        deadline: "",
    })

    useEffect(() => {
        const fetchCategories = async () => {
            const supabase = createClient()
            const { data } = await supabase.from('job_categories').select('id, name').order('name')
            if (data) setCategories(data)
        }
        fetchCategories()
    }, [])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError("")

        // Validate with Zod
        const result = validate(createJobSchema, {
            title: formData.title,
            description: formData.description,
            budget: formData.budget,
            category: formData.category || undefined,
            deadline: formData.deadline || undefined,
        })
        if (!result.success) {
            setError(result.error)
            return
        }

        setLoading(true)

        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
            setError("Please login first")
            setLoading(false)
            return
        }

        try {
            // Check available balance first
            const { data: account } = await supabase
                .from('accounts')
                .select('balance_sats')
                .eq('user_id', user.id)
                .eq('type', 'AVAILABLE')
                .single()

            if (!account || account.balance_sats < formData.budget) {
                setError(`Insufficient balance. You have ${account?.balance_sats ?? 0} sats but this job requires ${formData.budget} sats. Please top up your wallet first.`)
                setLoading(false)
                return
            }

            // 1. Create Job in DB
            const { data: job, error: jobError } = await supabase
                .from('jobs')
                .insert({
                    title: formData.title,
                    description: formData.description,
                    budget_sats: formData.budget,
                    creator_id: user.id,
                    status: 'OPEN',
                    category: formData.category || null,
                    deadline: formData.deadline ? new Date(formData.deadline).toISOString() : null,
                })
                .select()
                .single()

            if (jobError) throw jobError

            // 2. Fund Escrow
            const { data: fundData, error: fundError } = await supabase.functions.invoke('fund-escrow', {
                body: { jobId: job.id }
            })

            if (fundError) {
                setError("Job created but funding failed. You can fund this job from the job detail page.")
                router.push(`/dashboard/jobs/${job.id}`)
                setLoading(false)
                return
            }

            router.push("/dashboard/jobs")

        } catch (e: any) {
            console.error(e)
            setError(e.message || "Failed to create job")
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="max-w-2xl mx-auto py-8">
            <Card>
                <CardHeader>
                    <CardTitle>Post a New Micro-Task</CardTitle>
                    <CardDescription>
                        Create a task and fund it with sats from your wallet.
                        The budget will be held in escrow until the job is completed.
                    </CardDescription>
                </CardHeader>
                <form onSubmit={handleSubmit}>
                    <CardContent className="space-y-4">
                        {error && (
                            <div className="text-sm text-destructive bg-destructive/10 p-3 rounded">
                                {error}
                            </div>
                        )}
                        <div className="space-y-2">
                            <Label htmlFor="title">Job Title</Label>
                            <Input
                                id="title"
                                required
                                placeholder="e.g. Fix CSS bug on landing page"
                                value={formData.title}
                                onChange={e => setFormData({ ...formData, title: e.target.value })}
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="category">Category</Label>
                            <Select
                                value={formData.category}
                                onValueChange={(val) => setFormData({ ...formData, category: val })}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Select a category..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {categories.map(cat => (
                                        <SelectItem key={cat.id} value={cat.name}>{cat.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="description">Description</Label>
                            <Textarea
                                id="description"
                                required
                                placeholder="Describe the task in detail..."
                                className="min-h-[150px]"
                                value={formData.description}
                                onChange={e => setFormData({ ...formData, description: e.target.value })}
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="budget">Budget (Satoshis)</Label>
                                <Input
                                    id="budget"
                                    type="number"
                                    required
                                    min={100}
                                    placeholder="e.g. 1000"
                                    value={formData.budget || ''}
                                    onChange={e => {
                                        const val = parseInt(e.target.value)
                                        setFormData({ ...formData, budget: isNaN(val) ? 0 : val })
                                    }}
                                />
                                <p className="text-xs text-muted-foreground">
                                    Funds will be escrowed immediately. Min: 100 sats.
                                </p>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="deadline">Deadline (optional)</Label>
                                <Input
                                    id="deadline"
                                    type="date"
                                    value={formData.deadline}
                                    onChange={e => setFormData({ ...formData, deadline: e.target.value })}
                                />
                                <p className="text-xs text-muted-foreground">
                                    When should this be completed by?
                                </p>
                            </div>
                        </div>
                    </CardContent>
                    <CardFooter>
                        <Button type="submit" disabled={loading} className="w-full">
                            {loading ? "Creating & Funding..." : "Post Job"}
                        </Button>
                    </CardFooter>
                </form>
            </Card>
        </div>
    )
}
