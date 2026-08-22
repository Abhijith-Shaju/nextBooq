import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { TableEditorModal } from './table-editor-modal';
import { axiosInstance } from '@/hooks/api/axios-instance';
import { Table } from '@/lib/types/models';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/hooks/api/axios-instance', () => ({
  axiosInstance: { post: vi.fn(), put: vi.fn() },
}));

const editingTable: Table = {
  id: 't1',
  _id: 't1',
  cafe_id: 'cafe_1',
  table_number: 'T1',
  capacity: 4,
  zone: 'indoor',
  status: 'active',
};

const otherTable: Table = {
  id: 't2',
  _id: 't2',
  cafe_id: 'cafe_1',
  table_number: 'T2',
  capacity: 6,
  zone: 'outdoor',
  status: 'out_of_service',
};

const renderModal = (props: Partial<React.ComponentProps<typeof TableEditorModal>> = {}) => {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <TableEditorModal
        cafeId="cafe_1"
        existingTables={[editingTable, otherTable]}
        editingTable={editingTable}
        isOpen
        onClose={vi.fn()}
        {...props}
      />
    </QueryClientProvider>
  );
};

describe('TableEditorModal reflects the table being edited', () => {
  beforeEach(() => {
    vi.mocked(axiosInstance.put).mockReset().mockResolvedValue({ data: { data: editingTable } });
  });

  test('pre-fills fields for the table passed in on first open', () => {
    renderModal();

    expect(screen.getByDisplayValue('T1')).toBeInTheDocument();
    expect(screen.getByDisplayValue('4')).toBeInTheDocument();
  });

  test('re-syncs fields when a different table is opened for editing without unmounting', () => {
    const queryClient = new QueryClient();
    const { rerender } = render(
      <QueryClientProvider client={queryClient}>
        <TableEditorModal
          cafeId="cafe_1"
          existingTables={[editingTable, otherTable]}
          editingTable={editingTable}
          isOpen
          onClose={vi.fn()}
        />
      </QueryClientProvider>
    );

    expect(screen.getByDisplayValue('T1')).toBeInTheDocument();

    rerender(
      <QueryClientProvider client={queryClient}>
        <TableEditorModal
          cafeId="cafe_1"
          existingTables={[editingTable, otherTable]}
          editingTable={otherTable}
          isOpen
          onClose={vi.fn()}
        />
      </QueryClientProvider>
    );

    expect(screen.getByDisplayValue('T2')).toBeInTheDocument();
    expect(screen.getByDisplayValue('6')).toBeInTheDocument();
  });
});

describe('TableEditorModal delete confirmation', () => {
  beforeEach(() => {
    vi.mocked(axiosInstance.put).mockReset().mockResolvedValue({ data: { data: editingTable } });
  });

  test('clicking Soft Delete opens a confirmation dialog without deleting yet', () => {
    renderModal();

    fireEvent.click(screen.getByRole('button', { name: /soft delete/i }));

    expect(screen.getByText('Delete Table T1?')).toBeInTheDocument();
    expect(axiosInstance.put).not.toHaveBeenCalled();
  });

  test('confirming the dialog performs the delete', async () => {
    renderModal();

    fireEvent.click(screen.getByRole('button', { name: /soft delete/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() =>
      expect(axiosInstance.put).toHaveBeenCalledWith(
        '/api/v1/cafes/cafe_1/tables/t1',
        expect.objectContaining({ is_deleted: true })
      )
    );
  });

  test('cancelling the dialog does not delete', () => {
    renderModal();

    fireEvent.click(screen.getByRole('button', { name: /soft delete/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByText('Delete Table T1?')).not.toBeInTheDocument();
    expect(axiosInstance.put).not.toHaveBeenCalled();
  });
});
