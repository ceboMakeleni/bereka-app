"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase"
import Link from "next/link"
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ShareButton } from "@/components/ShareButton"
import { SocialShareButtons } from "@/components/SocialShareButtons"
import { generateJobUrl, generateShareText } from "@/lib/share-utils"
import { CalendarClock, Search, ChevronDown, ChevronUp } from "lucide-react"

interface Job {
    id: string
    title: string
    description: string
    budget_sats: number
    status: string
    category: string | null
    deadline: string | null
    created_at: string
}

const ITEMS_PER_PAGE = 12

export default function JobsPage() {
    const [jobs, setJobs] = useState<Job[]>([])
    const [categories, setCategories] = useState<string[]>([])
    const [loading, setLoading] = useState(true)
    const [searchQuery, setSearchQuery] = useState("")
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
    const [sortBy, setSortBy] = useState<"newest" | "budget_high" | "budget_low" | "deadline">("newest")
    const [minBudget, setMinBudget] = useState("")
    const [maxBudget, setMaxBudget] = useState("")
    const [currentPage, setCurrentPage] = useState(1)
    const [totalCount, setTotalCount] = useState(0)
    const [showAllCategories, setShowAllCategories] = useState(false)
    const MAX_VISIBLE_CATEGORIES = 5

    useEffect(() => {
        fetchCategories()
    }, [])

    useEffect(() => {
        fetchJobs()
    }, [searchQuery, selectedCategory, sortBy, minBudget, maxBudget, currentPage])

    const fetchCategories = async () => {
        const supabase = createClient()
        const { data } = await supabase
            .from('job_categories')
            .select('name')
            .order('name')

        if (data) {
            setCategories(data.map(c => c.name))
        }
    }

    const fetchJobs = async () => {
        setLoading(true)
        const supabase = createClient()

        // Build query
        let query = supabase
            .from('jobs')
            .select('id, title, budget_sats, status, description, category, deadline, created_at', { count: 'exact' })
            .in('status', ['OPEN', 'FUNDED'])

        // Apply filters
        if (selectedCategory) {
            query = query.eq('category', selectedCategory)
        }

        if (searchQuery) {
            query = query.or(`title.ilike.%${searchQuery}%,description.ilike.%${searchQuery}%`)
        }

        if (minBudget) {
            query = query.gte('budget_sats', parseInt(minBudget))
        }

        if (maxBudget) {
            query = query.lte('budget_sats', parseInt(maxBudget))
        }

        // Apply sorting
        switch (sortBy) {
            case 'newest':
                query = query.order('created_at', { ascending: false })
                break
            case 'budget_high':
                query = query.order('budget_sats', { ascending: false })
                break
            case 'budget_low':
                query = query.order('budget_sats', { ascending: true })
                break
            case 'deadline':
                query = query.order('deadline', { ascending: true, nullsFirst: false })
                break
        }

        // Apply pagination
        const from = (currentPage - 1) * ITEMS_PER_PAGE
        const to = from + ITEMS_PER_PAGE - 1
        query = query.range(from, to)

        const { data, error, count } = await query

        if (data) {
            setJobs(data)
            setTotalCount(count || 0)
        }
        setLoading(false)
    }

    const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE)

    const handleSearch = (value: string) => {
        setSearchQuery(value)
        setCurrentPage(1) // Reset to first page on search
    }

    const handleCategoryChange = (category: string | null) => {
        setSelectedCategory(category)
        setCurrentPage(1)
    }

    const handleSortChange = (sort: typeof sortBy) => {
        setSortBy(sort)
        setCurrentPage(1)
    }

    const handleBudgetFilter = () => {
        setCurrentPage(1)
        fetchJobs()
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold">Open Tasks</h1>
                <Link href="/dashboard/jobs/create">
                    <Button>Post a Task</Button>
                </Link>
            </div>

            {/* Search and Filters */}
            <div className="space-y-4">
                {/* Search Bar */}
                <div className="relative">
                    <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search jobs by title or description..."
                        value={searchQuery}
                        onChange={(e) => handleSearch(e.target.value)}
                        className="pl-10"
                    />
                </div>

                {/* Filter Bar */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    {/* Category Filter */}
                    <div className="space-y-2">
                        <Label className="text-xs">Category</Label>
                        <div className="flex flex-wrap gap-2">
                            <Button
                                variant={!selectedCategory ? "default" : "outline"}
                                size="sm"
                                onClick={() => handleCategoryChange(null)}
                            >
                                All
                            </Button>
                            {(showAllCategories ? categories : categories.slice(0, MAX_VISIBLE_CATEGORIES)).map((cat) => (
                                <Button
                                    key={cat}
                                    variant={selectedCategory === cat ? "default" : "outline"}
                                    size="sm"
                                    onClick={() => handleCategoryChange(cat)}
                                >
                                    {cat}
                                </Button>
                            ))}
                            {categories.length > MAX_VISIBLE_CATEGORIES && (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setShowAllCategories(!showAllCategories)}
                                    className="text-muted-foreground"
                                >
                                    {showAllCategories ? (
                                        <>Show Less <ChevronUp className="ml-1 h-3 w-3" /></>
                                    ) : (
                                        <>+{categories.length - MAX_VISIBLE_CATEGORIES} more <ChevronDown className="ml-1 h-3 w-3" /></>
                                    )}
                                </Button>
                            )}
                        </div>
                    </div>

                    {/* Sort Filter */}
                    <div className="space-y-2">
                        <Label htmlFor="sort" className="text-xs">Sort By</Label>
                        <select
                            id="sort"
                            value={sortBy}
                            onChange={(e) => handleSortChange(e.target.value as typeof sortBy)}
                            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                            <option value="newest">Newest First</option>
                            <option value="budget_high">Budget (High to Low)</option>
                            <option value="budget_low">Budget (Low to High)</option>
                            <option value="deadline">Deadline (Soonest)</option>
                        </select>
                    </div>

                    {/* Budget Range */}
                    <div className="space-y-2">
                        <Label className="text-xs">Min Budget (sats)</Label>
                        <Input
                            type="number"
                            placeholder="0"
                            value={minBudget}
                            onChange={(e) => setMinBudget(e.target.value)}
                            onBlur={handleBudgetFilter}
                        />
                    </div>

                    <div className="space-y-2">
                        <Label className="text-xs">Max Budget (sats)</Label>
                        <Input
                            type="number"
                            placeholder="Any"
                            value={maxBudget}
                            onChange={(e) => setMaxBudget(e.target.value)}
                            onBlur={handleBudgetFilter}
                        />
                    </div>
                </div>
            </div>

            {/* Results Count */}
            <div className="text-sm text-muted-foreground">
                {loading ? 'Loading...' : `Showing ${jobs.length} of ${totalCount} tasks`}
            </div>

            {/* Jobs Grid */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {!loading && jobs.length > 0 ? (
                    jobs.map((job) => (
                        <Card key={job.id} className="hover:border-primary transition-colors cursor-pointer">
                            <Link href={`/dashboard/jobs/${job.id}`}>
                                <CardHeader>
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <CardTitle className="text-base">{job.title}</CardTitle>
                                            {job.category && (
                                                <span className="text-xs text-muted-foreground mt-1 block">
                                                    {job.category}
                                                </span>
                                            )}
                                        </div>
                                        <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 border-transparent bg-primary text-primary-foreground hover:bg-primary/80">
                                            {Number(job.budget_sats).toLocaleString()} sats
                                        </span>
                                    </div>
                                </CardHeader>
                                <CardContent>
                                    <p className="text-sm text-muted-foreground line-clamp-2">
                                        {job.description}
                                    </p>
                                    {job.deadline && (
                                        <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
                                            <CalendarClock className="h-3 w-3" />
                                            Due {new Date(job.deadline).toLocaleDateString()}
                                        </div>
                                    )}
                                </CardContent>
                                {/* Share Section - Only for OPEN/FUNDED jobs */}
                                {(job.status === 'OPEN' || job.status === 'FUNDED') && (
                                    <CardFooter className="pt-4 border-t flex-col gap-3">
                                        <ShareButton
                                            url={generateJobUrl(job.id)}
                                            title={job.title}
                                            text={generateShareText(job)}
                                            variant="outline"
                                            size="sm"
                                            className="w-full"
                                        />
                                        <SocialShareButtons
                                            url={generateJobUrl(job.id)}
                                            text={generateShareText(job)}
                                        />
                                    </CardFooter>
                                )}
                            </Link>
                        </Card>
                    ))
                ) : !loading ? (
                    <div className="col-span-full text-center py-12">
                        <p className="text-muted-foreground mb-4">
                            {searchQuery || selectedCategory || minBudget || maxBudget
                                ? 'No tasks match your filters. Try adjusting your search.'
                                : 'No open tasks available yet.'}
                        </p>
                        {!searchQuery && !selectedCategory && (
                            <Link href="/dashboard/jobs/create">
                                <Button>Be the first to post a task</Button>
                            </Link>
                        )}
                    </div>
                ) : null}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
                <div className="flex justify-center gap-2 items-center">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        disabled={currentPage === 1 || loading}
                    >
                        Previous
                    </Button>
                    <span className="text-sm text-muted-foreground">
                        Page {currentPage} of {totalPages}
                    </span>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                        disabled={currentPage === totalPages || loading}
                    >
                        Next
                    </Button>
                </div>
            )}
        </div>
    )
}
