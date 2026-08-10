import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { useModalDismiss } from './use-modal-dismiss';

function TestModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { onBackdropClick } = useModalDismiss(isOpen, onClose);
  if (!isOpen) return null;
  return (
    <div data-testid="backdrop" onClick={onBackdropClick}>
      <div data-testid="panel">Modal content</div>
    </div>
  );
}

describe('useModalDismiss', () => {
  test('pressing Escape calls onClose', () => {
    const onClose = vi.fn();
    render(<TestModal isOpen onClose={onClose} />);

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('clicking the backdrop calls onClose', () => {
    const onClose = vi.fn();
    render(<TestModal isOpen onClose={onClose} />);

    fireEvent.click(screen.getByTestId('backdrop'));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('clicking inside the panel does not call onClose', () => {
    const onClose = vi.fn();
    render(<TestModal isOpen onClose={onClose} />);

    fireEvent.click(screen.getByTestId('panel'));

    expect(onClose).not.toHaveBeenCalled();
  });

  test('Escape does nothing when the modal is closed', () => {
    const onClose = vi.fn();
    render(<TestModal isOpen={false} onClose={onClose} />);

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onClose).not.toHaveBeenCalled();
  });
});
