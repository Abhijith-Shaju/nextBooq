import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { ConfirmDialog } from './confirm-dialog';

describe('ConfirmDialog', () => {
  test('renders nothing interactive when closed', () => {
    render(
      <ConfirmDialog open={false} onOpenChange={vi.fn()} title="Delete Table T1?" onConfirm={vi.fn()} />
    );

    expect(screen.queryByText('Delete Table T1?')).not.toBeInTheDocument();
  });

  test('clicking confirm calls onConfirm and closes the dialog', () => {
    const onConfirm = vi.fn();
    const onOpenChange = vi.fn();

    render(
      <ConfirmDialog
        open
        onOpenChange={onOpenChange}
        title="Delete Table T1?"
        confirmLabel="Delete"
        onConfirm={onConfirm}
        variant="destructive"
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  test('clicking cancel does not call onConfirm', () => {
    const onConfirm = vi.fn();
    const onOpenChange = vi.fn();

    render(
      <ConfirmDialog open onOpenChange={onOpenChange} title="Delete Table T1?" onConfirm={onConfirm} />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onConfirm).not.toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
