import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { StarRating } from './star-rating'

describe('StarRating component', () => {
    it('renders 5 star buttons', () => {
        render(<StarRating value={0} />)
        const stars = screen.getAllByRole('radio')
        expect(stars).toHaveLength(5)
    })

    it('marks the correct star as aria-checked for a given value', () => {
        render(<StarRating value={3} />)
        const stars = screen.getAllByRole('radio')
        expect(stars[2]).toHaveAttribute('aria-checked', 'true')   // 3rd star (index 2)
        expect(stars[0]).toHaveAttribute('aria-checked', 'false')  // 1st star
        expect(stars[4]).toHaveAttribute('aria-checked', 'false')  // 5th star
    })

    it('calls onChange with the correct value when a star is clicked', () => {
        const onChange = vi.fn()
        render(<StarRating value={0} onChange={onChange} />)
        const stars = screen.getAllByRole('radio')
        fireEvent.click(stars[2]) // click 3rd star
        expect(onChange).toHaveBeenCalledWith(3)
    })

    it('does not call onChange when readonly', () => {
        const onChange = vi.fn()
        render(<StarRating value={3} onChange={onChange} readonly />)
        const stars = screen.getAllByRole('radio')
        fireEvent.click(stars[4]) // try to click 5th star
        expect(onChange).not.toHaveBeenCalled()
    })

    it('increments value with ArrowRight keyboard navigation', () => {
        const onChange = vi.fn()
        render(<StarRating value={2} onChange={onChange} />)
        const container = screen.getByRole('radiogroup')
        fireEvent.keyDown(container, { key: 'ArrowRight' })
        expect(onChange).toHaveBeenCalledWith(3)
    })

    it('increments value with ArrowUp keyboard navigation', () => {
        const onChange = vi.fn()
        render(<StarRating value={2} onChange={onChange} />)
        const container = screen.getByRole('radiogroup')
        fireEvent.keyDown(container, { key: 'ArrowUp' })
        expect(onChange).toHaveBeenCalledWith(3)
    })

    it('decrements value with ArrowLeft keyboard navigation', () => {
        const onChange = vi.fn()
        render(<StarRating value={4} onChange={onChange} />)
        const container = screen.getByRole('radiogroup')
        fireEvent.keyDown(container, { key: 'ArrowLeft' })
        expect(onChange).toHaveBeenCalledWith(3)
    })

    it('does not go below 1 on ArrowLeft at minimum value', () => {
        const onChange = vi.fn()
        render(<StarRating value={1} onChange={onChange} />)
        const container = screen.getByRole('radiogroup')
        fireEvent.keyDown(container, { key: 'ArrowLeft' })
        expect(onChange).toHaveBeenCalledWith(1)
    })

    it('does not go above 5 on ArrowRight at maximum value', () => {
        const onChange = vi.fn()
        render(<StarRating value={5} onChange={onChange} />)
        const container = screen.getByRole('radiogroup')
        fireEvent.keyDown(container, { key: 'ArrowRight' })
        expect(onChange).toHaveBeenCalledWith(5)
    })

    it('has an accessible aria-label on the container', () => {
        render(<StarRating value={0} />)
        expect(screen.getByRole('radiogroup')).toHaveAttribute('aria-label', 'Star rating')
    })

    it('each star has a descriptive aria-label', () => {
        render(<StarRating value={0} />)
        expect(screen.getByRole('radio', { name: '1 star' })).toBeInTheDocument()
        expect(screen.getByRole('radio', { name: '2 stars' })).toBeInTheDocument()
        expect(screen.getByRole('radio', { name: '5 stars' })).toBeInTheDocument()
    })
})
