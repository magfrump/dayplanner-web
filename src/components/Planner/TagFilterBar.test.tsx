import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TagFilterBar } from './TagFilterBar';
import type { SavedFilter } from '../../types/planner';

const noop = () => { };

const defaultProps = {
    allTags: ['focus', 'health'],
    activeTags: [] as string[],
    onToggleTag: noop,
    onClear: noop,
    savedFilters: [] as SavedFilter[],
    onApplyFilter: noop,
    onSaveFilter: noop,
    onDeleteFilter: noop,
};

describe('TagFilterBar', () => {
    it('renders nothing when there are no tags and no saved filters', () => {
        const { container } = render(<TagFilterBar {...defaultProps} allTags={[]} />);
        expect(container.firstChild).toBeNull();
    });

    it('toggles a tag when its chip is clicked', () => {
        const onToggleTag = vi.fn();
        render(<TagFilterBar {...defaultProps} onToggleTag={onToggleTag} />);
        fireEvent.click(screen.getByText('#health'));
        expect(onToggleTag).toHaveBeenCalledWith('health');
    });

    it('marks active chips with aria-pressed=true', () => {
        render(<TagFilterBar {...defaultProps} activeTags={['focus']} />);
        const focus = screen.getByText('#focus');
        expect(focus.getAttribute('aria-pressed')).toBe('true');
        const health = screen.getByText('#health');
        expect(health.getAttribute('aria-pressed')).toBe('false');
    });

    it('shows Clear only when at least one tag is active', () => {
        const { rerender } = render(<TagFilterBar {...defaultProps} />);
        expect(screen.queryByText(/Clear/i)).toBeNull();
        rerender(<TagFilterBar {...defaultProps} activeTags={['focus']} />);
        expect(screen.getByText(/Clear/i)).toBeTruthy();
    });

    it('saves the active selection under the given name', () => {
        const onSaveFilter = vi.fn();
        render(<TagFilterBar {...defaultProps} activeTags={['focus']} onSaveFilter={onSaveFilter} />);
        fireEvent.click(screen.getByText(/Save as/i));
        const input = screen.getByPlaceholderText('Filter name') as HTMLInputElement;
        fireEvent.change(input, { target: { value: 'Focus work' } });
        fireEvent.keyDown(input, { key: 'Enter' });
        expect(onSaveFilter).toHaveBeenCalledTimes(1);
        const arg = onSaveFilter.mock.calls[0][0] as SavedFilter;
        expect(arg.name).toBe('Focus work');
        expect(arg.tags).toEqual(['focus']);
        expect(arg.id).toMatch(/^filter-/);
    });

    it('applies a saved filter when its chip is clicked', () => {
        const filter: SavedFilter = { id: 'filter-1', name: 'Morning', tags: ['focus', 'health'] };
        const onApplyFilter = vi.fn();
        render(<TagFilterBar {...defaultProps} savedFilters={[filter]} onApplyFilter={onApplyFilter} />);
        fireEvent.click(screen.getByText('Morning'));
        expect(onApplyFilter).toHaveBeenCalledWith(filter);
    });

    it('deletes a saved filter via its delete button', () => {
        const filter: SavedFilter = { id: 'filter-1', name: 'Morning', tags: ['focus'] };
        const onDeleteFilter = vi.fn();
        render(<TagFilterBar {...defaultProps} savedFilters={[filter]} onDeleteFilter={onDeleteFilter} />);
        fireEvent.click(screen.getByLabelText(/Delete saved filter Morning/i));
        expect(onDeleteFilter).toHaveBeenCalledWith('filter-1');
    });
});
