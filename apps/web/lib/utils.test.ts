import { describe, it, expect } from 'vitest'
import { cn } from './utils'

describe('cn utility', () => {
    it('merges class names', () => {
        expect(cn('foo', 'bar')).toBe('foo bar')
    })

    it('handles conditional classes', () => {
        expect(cn('foo', false && 'bar', 'baz')).toBe('foo baz')
    })

    it('merges tailwind conflicts correctly', () => {
        // tailwind-merge should resolve conflicting utilities
        expect(cn('px-2 py-1', 'px-4')).toBe('py-1 px-4')
    })

    it('handles undefined and null', () => {
        expect(cn('foo', undefined, null, 'bar')).toBe('foo bar')
    })

    it('handles empty strings', () => {
        expect(cn('', 'foo', '')).toBe('foo')
    })

    it('returns empty string when no valid classes', () => {
        expect(cn()).toBe('')
    })
})
