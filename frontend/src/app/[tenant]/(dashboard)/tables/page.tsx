'use client';

import { useState } from 'react';
import { useTenant } from '@/components/providers/tenant-provider';
import { useTables } from '@/hooks/admin/use-tables';
import { Table } from '@/lib/types/models';
import { TableEditorModal } from '@/components/dashboard/table-editor-modal';
import { Plus, Edit2, Users, Layers, Hash, Grid } from 'lucide-react';

export default function TablesInventoryPage() {
  const { cafe } = useTenant();
  const { data: tables = [], isLoading } = useTables(cafe?.id);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTable, setEditingTable] = useState<Table | null>(null);

  const handleOpenAdd = () => {
    setEditingTable(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (table: Table) => {
    setEditingTable(table);
    setIsModalOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 glass p-6 rounded-3xl border border-brand-brown/10 shadow-brand-sm">
        <div>
          <h1 className="text-3xl font-extrabold font-display text-brand-brown">Table Inventory Editor</h1>
          <p className="text-xs text-brand-mocha mt-0.5">Manage physical cafe floorplan tables and adjacent merges</p>
        </div>

        <button
          onClick={handleOpenAdd}
          className="cta-hero py-3 px-6 text-sm font-bold shadow-brand-md"
        >
          <Plus className="w-4 h-4 mr-1" /> Add New Table
        </button>
      </div>

      {/* Table Data List */}
      <div className="glass rounded-3xl border border-brand-brown/10 shadow-brand-md overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-brand-brown">
            <thead className="bg-brand-tan/30 text-xs uppercase font-bold text-brand-mocha border-b border-brand-brown/10">
              <tr>
                <th className="p-4">Table Number</th>
                <th className="p-4">Guest Capacity</th>
                <th className="p-4">Service Status</th>
                <th className="p-4">Can Merge With</th>
                <th className="p-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-brown/10">
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-brand-mocha animate-pulse">
                    Loading floorplan tables...
                  </td>
                </tr>
              ) : tables.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-brand-mocha">
                    No physical tables created yet. Click "Add New Table" to start.
                  </td>
                </tr>
              ) : (
                tables.map((table) => (
                  <tr key={table.id || table.table_number} className="hover:bg-brand-tan/20 transition-all">
                    <td className="p-4 font-mono font-bold text-base flex items-center gap-1.5">
                      <Hash className="w-4 h-4 text-brand-red" /> T-{table.table_number}
                    </td>
                    <td className="p-4 font-semibold text-xs">
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-brand-tan/50 text-brand-brown">
                        <Users className="w-3.5 h-3.5" /> {table.capacity} Guests
                      </span>
                    </td>
                    <td className="p-4 text-xs font-bold">
                      {table.status === 'out_of_service' ? (
                        <span className="px-2.5 py-1 rounded-full bg-rose-100 text-rose-800 border border-rose-200">
                          Out of Service
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                          Active
                        </span>
                      )}
                    </td>
                    <td className="p-4 text-xs font-mono text-brand-mocha">
                      {table.can_merge_with && table.can_merge_with.length > 0
                        ? table.can_merge_with.map((t) => `T-${t}`).join(', ')
                        : 'None'}
                    </td>
                    <td className="p-4 text-right">
                      <button
                        onClick={() => handleOpenEdit(table)}
                        className="p-2 rounded-xl text-brand-brown hover:bg-brand-tan/50 transition-all border border-brand-brown/10"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / Edit Table Modal */}
      <TableEditorModal
        cafeId={cafe?.id}
        existingTables={tables}
        editingTable={editingTable}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />
    </div>
  );
}
