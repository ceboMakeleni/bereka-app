/**
 * Utility functions for social sharing functionality
 */

interface Job {
    id: string
    title: string
    description: string
    budget_sats: number
    category: string | null
}

/**
 * Generates the full URL for a job posting
 */
export function generateJobUrl(jobId: string, baseUrl?: string): string {
    // Use provided baseUrl or construct from window.location (client-side)
    const base = baseUrl || (typeof window !== 'undefined' ? window.location.origin : '')
    return `${base}/dashboard/jobs/${jobId}`
}

/**
 * Generates formatted share text for a job
 */
export function generateShareText(job: Job): string {
    const categoryText = job.category ? `\n📁 Category: ${job.category}` : ''

    // Truncate description to 200 characters for sharing
    const description = job.description.length > 200
        ? job.description.substring(0, 200) + '...'
        : job.description

    return `🔥 Check out this task on Bereka!

${job.title}
💰 Budget: ${Number(job.budget_sats).toLocaleString()} sats${categoryText}

${description}`
}

/**
 * Generates platform-specific share URLs
 */
export function getPlatformShareUrl(
    platform: 'twitter' | 'facebook' | 'linkedin' | 'whatsapp',
    url: string,
    text: string
): string {
    const encodedUrl = encodeURIComponent(url)
    const encodedText = encodeURIComponent(text)

    switch (platform) {
        case 'twitter':
            return `https://twitter.com/intent/tweet?text=${encodedText}&url=${encodedUrl}`
        case 'facebook':
            return `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`
        case 'linkedin':
            return `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`
        case 'whatsapp':
            return `https://wa.me/?text=${encodeURIComponent(text + ' ' + url)}`
        default:
            return url
    }
}

/**
 * Checks if Web Share API is available
 */
export function canUseWebShare(): boolean {
    return typeof window !== 'undefined' && !!navigator.share
}
