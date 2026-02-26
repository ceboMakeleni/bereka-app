import { z } from 'zod'

// Auth schemas

export const loginSchema = z.object({
    email: z.string().email('Please enter a valid email address'),
    password: z.string().min(6, 'Password must be at least 6 characters'),
})

export const signupSchema = z.object({
    username: z.string()
        .min(3, 'Username must be at least 3 characters')
        .max(30, 'Username must be at most 30 characters')
        .regex(/^[a-zA-Z0-9_-]+$/, 'Username can only contain letters, numbers, dashes, and underscores'),
    email: z.string().email('Please enter a valid email address'),
    password: z.string()
        .min(8, 'Password must be at least 8 characters')
        .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
        .regex(/[0-9]/, 'Password must contain at least one number'),
    role: z.enum(['worker', 'client'], {
        message: 'Please select a role',
    }),
})

export const forgotPasswordSchema = z.object({
    email: z.string().email('Please enter a valid email address'),
})

export const resetPasswordSchema = z.object({
    password: z.string().min(8, 'Password must be at least 8 characters'),
    confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
})

// Job schemas

export const createJobSchema = z.object({
    title: z.string()
        .min(5, 'Title must be at least 5 characters')
        .max(100, 'Title must be at most 100 characters'),
    description: z.string()
        .min(20, 'Description must be at least 20 characters')
        .max(5000, 'Description must be at most 5000 characters'),
    budget: z.number()
        .min(100, 'Minimum budget is 100 sats')
        .max(10_000_000, 'Maximum budget is 10,000,000 sats'),
    category: z.string().optional(),
    deadline: z.string().optional(),
})

// Application schemas

export const createApplicationSchema = z.object({
    cover_letter: z.string()
        .min(10, 'Cover letter must be at least 10 characters')
        .max(2000, 'Cover letter must be at most 2000 characters'),
})

// Dispute schemas

export const createDisputeSchema = z.object({
    reason: z.string()
        .min(20, 'Please provide a detailed reason (at least 20 characters)')
        .max(2000, 'Reason must be at most 2000 characters'),
})

// Profile schemas

export const updateProfileSchema = z.object({
    username: z.string()
        .min(3, 'Username must be at least 3 characters')
        .max(30, 'Username must be at most 30 characters')
        .regex(/^[a-zA-Z0-9_-]+$/, 'Username can only contain letters, numbers, dashes, and underscores')
        .optional(),
    bio: z.string().max(500, 'Bio must be at most 500 characters').optional(),
    skills: z.array(z.string()).optional(),
})

// Helper to extract first error from a ZodError

export function getFirstError(error: z.ZodError): string {
    return error.issues[0]?.message ?? 'Validation failed'
}

// Helper to validate and return typed data or error string

export function validate<T>(schema: z.ZodSchema<T>, data: unknown): { success: true; data: T } | { success: false; error: string } {
    const result = schema.safeParse(data)
    if (result.success) return { success: true, data: result.data }
    return { success: false, error: getFirstError(result.error) }
}
