import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { SeatingConflictDialog, SeatingConflict } from './seating-conflict-dialog';

const baseConflict: SeatingConflict = {
  guestName: 'Grace Hopper',
  tableNumbers: ['3'],
};

const renderDialog = (conflict: SeatingConflict | null, overrides = {}) => {
  const props = {
    conflict,
    onOpenChange: vi.fn(),
    onForceSeat: vi.fn(),
    onReassign: vi.fn(),
    ...overrides,
  };
  render(<SeatingConflictDialog {...props} />);
  return props;
};

describe('SeatingConflictDialog', () => {
  test('renders nothing when there is no conflict', () => {
    renderDialog(null);
    expect(screen.queryByText(/already occupied/i)).not.toBeInTheDocument();
  });

  test('shows only Seat Anyway when no alternate table is available', () => {
    renderDialog(baseConflict);

    expect(screen.getByText(/table 3 is already occupied/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /seat anyway/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^reassign$/i })).not.toBeInTheDocument();
  });

  test('offers Reassign when an alternate table is available', () => {
    renderDialog({ ...baseConflict, alternate: { tableNumbers: ['7'], totalCapacity: 4 } });

    expect(screen.getByRole('button', { name: /^reassign$/i })).toBeInTheDocument();
  });

  test('Reassign opens a second step naming the table, and Confirm fires onReassign', () => {
    const props = renderDialog({
      ...baseConflict,
      alternate: { tableNumbers: ['7'], totalCapacity: 4 },
    });

    fireEvent.click(screen.getByRole('button', { name: /^reassign$/i }));

    expect(screen.getByText(/move to table 7/i)).toBeInTheDocument();
    expect(screen.getByText(/seats 4/i)).toBeInTheDocument();
    expect(props.onReassign).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /^confirm$/i }));
    expect(props.onReassign).toHaveBeenCalledTimes(1);
  });

  test('Back returns from the confirm step to the conflict step', () => {
    renderDialog({ ...baseConflict, alternate: { tableNumbers: ['7'], totalCapacity: 4 } });

    fireEvent.click(screen.getByRole('button', { name: /^reassign$/i }));
    fireEvent.click(screen.getByRole('button', { name: /^back$/i }));

    expect(screen.getByRole('button', { name: /seat anyway/i })).toBeInTheDocument();
  });

  test('Seat Anyway fires onForceSeat', () => {
    const props = renderDialog(baseConflict);

    fireEvent.click(screen.getByRole('button', { name: /seat anyway/i }));
    expect(props.onForceSeat).toHaveBeenCalledTimes(1);
  });
});
