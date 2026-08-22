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
  floor: 1,
  status: 'active',
};

const otherTable: Table = {
  id: 't2',
  _id: 't2',
  cafe_id: 'cafe_1',
  table_number: 'T2',
  capacity: 6,
  zone: 'outdoor',
  floor: 1,
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

// Merging physically pushes two tables together, so the editor must not even
// offer a partner in another zone or floor — the server rejects those with a
// 422, and a checkbox that always fails is worse than no checkbox.
describe('TableEditorModal merge partner candidates', () => {
  const indoorF1 = { ...editingTable, id: 't1', _id: 't1', table_number: 'T1', zone: 'indoor' as const, floor: 1 };
  const alsoIndoorF1 = { ...editingTable, id: 't2', _id: 't2', table_number: 'SAME', zone: 'indoor' as const, floor: 1 };
  const outdoorF1 = { ...editingTable, id: 't3', _id: 't3', table_number: 'OTHERZONE', zone: 'outdoor' as const, floor: 1 };
  const indoorF2 = { ...editingTable, id: 't4', _id: 't4', table_number: 'OTHERFLOOR', zone: 'indoor' as const, floor: 2 };

  const renderWith = (editing: Table) => {
    const queryClient = new QueryClient();
    return render(
      <QueryClientProvider client={queryClient}>
        <TableEditorModal
          cafeId="cafe_1"
          existingTables={[indoorF1, alsoIndoorF1, outdoorF1, indoorF2]}
          editingTable={editing}
          isOpen
          onClose={vi.fn()}
        />
      </QueryClientProvider>
    );
  };

  test('offers only tables sharing the edited table zone and floor', () => {
    renderWith(indoorF1);

    expect(screen.getByText(/T-SAME/)).toBeInTheDocument();
    expect(screen.queryByText(/T-OTHERZONE/)).not.toBeInTheDocument();
    expect(screen.queryByText(/T-OTHERFLOOR/)).not.toBeInTheDocument();
  });

  test('changing the zone re-scopes the candidate list', () => {
    renderWith(indoorF1);
    expect(screen.getByText(/T-SAME/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/zone/i), { target: { value: 'outdoor' } });

    expect(screen.queryByText(/T-SAME/)).not.toBeInTheDocument();
    expect(screen.getByText(/T-OTHERZONE/)).toBeInTheDocument();
  });

  test('explains itself when nothing in this section can be merged with', () => {
    renderWith(indoorF2);

    expect(screen.getByText(/no other tables in indoor on floor 2/i)).toBeInTheDocument();
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
