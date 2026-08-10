import { useEffect } from 'react';

/**
 * Escape-to-close and click-outside-to-close behavior shared by this
 * codebase's hand-rolled overlays (reservation-drawer, table-editor-modal),
 * which render their own backdrop rather than using the Radix ui/dialog.tsx
 * primitive (their layout — a slide-in drawer vs. a centered card modal —
 * doesn't fit Radix's Dialog styling, so they keep custom markup but should
 * still behave like every other dismissible overlay in the app).
 */
export function useModalDismiss(isOpen: boolean, onClose: () => void) {
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const onBackdropClick = (event: React.MouseEvent<HTMLElement>) => {
    if (event.target === event.currentTarget) {
      onClose();
    }
  };

  return { onBackdropClick };
}
