'use client';

import { useState } from 'react';
import { Table } from '@/lib/types/models';
import { useCreateTable } from '@/hooks/admin/use-create-table';
import { useEditTable } from '@/hooks/admin/use-edit-table';
import { X, Plus, Save, Trash2, Hash, Users, Layers } from 'lucide-react';
import { toast } from 'sonner';

interface TableEditorModalProps {
  cafeId: string | undefined;
  existingTables: Table[];
  editingTable: Table | null;
  isOpen: boolean;
  onClose: () => void;
}

export function TableEditorModal({
  cafeId,
  existingTables,
  editingTable,
  isOpen,
  onClose,
}: TableEditorModalProps) {
  const [tableNumber, setTableNumber] = useState(editingTable?.table_number || '');
  const [capacity, setCapacity] = useState(editingTable?.capacity || 2);
  const [status, setStatus] = useState<'active' | 'out_of_service'>(
    editingTable?.status || 'active'
  );
  const [canMergeWith, setCanMergeWith] = useState<string[]>(
    editingTable?.can_merge_with || []
  );

  const createTableMutation = useCreateTable(cafeId);
  const editTableMutation = useEditTable(cafeId);

  if (!isOpen) return null;

  const isEditing = !!editingTable;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!tableNumber) {
      toast.error('Table number is required');
      return;
    }
    if (capacity <= 0) {
      toast.error('Capacity must be greater than 0');
      return;
    }

    if (isEditing) {
      editTableMutation.mutate(
        {
          tableId: editingTable.id || editingTable._id!,
          table_number: tableNumber,
          capacity,
          status,
          can_merge_with: canMergeWith,
        },
        {
          onSuccess: () => onClose(),
        }
      );
    } else {
      createTableMutation.mutate(
        {
          table_number: tableNumber,
          capacity,
          status,
          can_merge_with: canMergeWith,
        },
        {
          onSuccess: () => onClose(),
        }
      );
    }
  };

  const handleDelete = () => {
    if (!editingTable) return;
    if (confirm(`Are you sure you want to delete Table ${editingTable.table_number}?`)) {
      editTableMutation.mutate(
        {
          tableId: editingTable.id || editingTable._id!,
          is_deleted: true,
        },
        {
          onSuccess: () => onClose(),
        }
      );
    }
  };

  const toggleMergeTable = (tblNum: string) => {
    if (canMergeWith.includes(tblNum)) {
      setCanMergeWith(canMergeWith.filter((t) => t !== tblNum));
    } else {
      setCanMergeWith([...canMergeWith, tblNum]);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-white rounded-3xl shadow-2xl p-6 border border-brand-brown/10 space-y-6 animate-scale-in">
        <div className="flex items-center justify-between border-b border-brand-brown/10 pb-4">
          <h3 className="text-xl font-bold font-display text-brand-brown">
            {isEditing ? `Edit Table ${editingTable.table_number}` : 'Add New Physical Table'}
          </h3>
          <button
            onClick={onClose}
            className="p-2 rounded-full text-brand-mocha hover:bg-brand-tan/30 transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-brand-brown mb-1.5 flex items-center gap-1">
              <Hash className="w-4 h-4 text-brand-mocha" /> Table Identifier / Number *
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Window-1 or 12"
              value={tableNumber}
              onChange={(e) => setTableNumber(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-brand-brown/20 bg-white focus:ring-2 focus:ring-brand-red focus:outline-none text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-brand-brown mb-1.5 flex items-center gap-1">
              <Users className="w-4 h-4 text-brand-mocha" /> Guest Capacity *
            </label>
            <input
              type="number"
              min={1}
              required
              value={capacity}
              onChange={(e) => setCapacity(parseInt(e.target.value) || 1)}
              className="w-full px-4 py-3 rounded-xl border border-brand-brown/20 bg-white focus:ring-2 focus:ring-brand-red focus:outline-none text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-brand-brown mb-1.5">
              Service Status
            </label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as any)}
              className="w-full px-4 py-3 rounded-xl border border-brand-brown/20 bg-white focus:ring-2 focus:ring-brand-red focus:outline-none text-sm"
            >
              <option value="active">Active (Available for booking)</option>
              <option value="out_of_service">Out of Service</option>
            </select>
          </div>

          {/* Mergeable Tables */}
          <div>
            <label className="block text-sm font-semibold text-brand-brown mb-1.5 flex items-center gap-1">
              <Layers className="w-4 h-4 text-brand-mocha" /> Mergeable With (Adjacent Tables)
            </label>
            <div className="p-3 bg-brand-cream rounded-xl border border-brand-brown/10 max-h-32 overflow-y-auto space-y-2 text-xs">
              {existingTables
                .filter((t) => t.table_number !== tableNumber)
                .map((t) => (
                  <label key={t.table_number} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={canMergeWith.includes(t.table_number)}
                      onChange={() => toggleMergeTable(t.table_number)}
                      className="accent-brand-red rounded"
                    />
                    <span>Table T-{t.table_number} ({t.capacity}p)</span>
                  </label>
                ))}
            </div>
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-brand-brown/10">
            {isEditing && (
              <button
                type="button"
                onClick={handleDelete}
                className="py-2.5 px-4 rounded-xl font-semibold bg-rose-100 text-rose-700 hover:bg-rose-200 flex items-center gap-1.5 text-xs transition-all"
              >
                <Trash2 className="w-4 h-4" /> Soft Delete
              </button>
            )}

            <div className="flex items-center gap-3 ml-auto">
              <button
                type="button"
                onClick={onClose}
                className="py-2.5 px-4 rounded-xl font-semibold text-brand-brown hover:bg-brand-tan/40 text-xs"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={createTableMutation.isPending || editTableMutation.isPending}
                className="cta-hero py-2.5 px-6 text-sm font-bold shadow-brand-md"
              >
                <Save className="w-4 h-4 mr-1" /> Save Table
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
