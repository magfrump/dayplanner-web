import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TagInput } from './TagInput';

const placeholder = /Add tag/i;

describe('TagInput', () => {
    it('adds a normalized tag on Enter', () => {
        const onChange = vi.fn();
        render(<TagInput tags={[]} onChange={onChange} />);
        const input = screen.getByPlaceholderText(placeholder);
        fireEvent.change(input, { target: { value: '  Side Project  ' } });
        fireEvent.keyDown(input, { key: 'Enter' });
        expect(onChange).toHaveBeenCalledWith(['side-project']);
    });

    it('adds a tag on comma', () => {
        const onChange = vi.fn();
        render(<TagInput tags={['health']} onChange={onChange} />);
        const input = screen.getByPlaceholderText(placeholder);
        fireEvent.change(input, { target: { value: 'work' } });
        fireEvent.keyDown(input, { key: ',' });
        expect(onChange).toHaveBeenCalledWith(['health', 'work']);
    });

    it('does not add duplicates', () => {
        const onChange = vi.fn();
        render(<TagInput tags={['health']} onChange={onChange} />);
        const input = screen.getByPlaceholderText(placeholder);
        fireEvent.change(input, { target: { value: 'health' } });
        fireEvent.keyDown(input, { key: 'Enter' });
        expect(onChange).not.toHaveBeenCalled();
    });

    it('removes the last tag on Backspace with empty input', () => {
        const onChange = vi.fn();
        render(<TagInput tags={['a', 'b']} onChange={onChange} />);
        const input = screen.getByPlaceholderText(placeholder);
        fireEvent.keyDown(input, { key: 'Backspace' });
        expect(onChange).toHaveBeenCalledWith(['a']);
    });

    it('removes a specific tag via its X button', () => {
        const onChange = vi.fn();
        render(<TagInput tags={['a', 'b', 'c']} onChange={onChange} />);
        fireEvent.click(screen.getByLabelText('Remove tag b'));
        expect(onChange).toHaveBeenCalledWith(['a', 'c']);
    });

    it('shows suggestions that match the current draft and exclude already-applied tags', () => {
        const onChange = vi.fn();
        render(
            <TagInput
                tags={['health']}
                onChange={onChange}
                suggestions={['health', 'work', 'side-project', 'side-hustle']}
            />
        );
        const input = screen.getByPlaceholderText(placeholder);
        fireEvent.change(input, { target: { value: 'side' } });
        // Suggestions are buttons; the existing chip is a span.
        expect(screen.getByRole('button', { name: 'side-project' })).toBeTruthy();
        expect(screen.getByRole('button', { name: 'side-hustle' })).toBeTruthy();
        expect(screen.queryByRole('button', { name: 'work' })).toBeNull();
        // The already-applied tag should not appear as a suggestion button.
        expect(screen.queryByRole('button', { name: 'health' })).toBeNull();
    });

    it('commits the draft on blur', () => {
        const onChange = vi.fn();
        render(<TagInput tags={[]} onChange={onChange} />);
        const input = screen.getByPlaceholderText(placeholder);
        fireEvent.change(input, { target: { value: 'focus' } });
        fireEvent.blur(input);
        expect(onChange).toHaveBeenCalledWith(['focus']);
    });
});
