'use client';

import { useState } from 'react';
import { useTenant } from '@/components/providers/tenant-provider';
import { useAuth } from '@/components/providers/auth-provider';
import { useTables } from '@/hooks/admin/use-tables';
import { Table } from '@/lib/types/models';
import { TableEditorModal } from '@/components/dashboard/table-editor-modal';
import { TableLayoutVisualization } from '@/components/dashboard/table-layout-visualization';
import { describeTableStatus } from '@/lib/dashboard/table-status';
import { getMergePartnerTableNumbers } from '@/lib/dashboard/table-merge';
import { TABLE_ZONE_LABELS } from '@/lib/dashboard/table-zones';
import { hasCafePermission } from '@/lib/dashboard/tenant-membership';
import { StatusTone } from '@/lib/booking/reservation-status';
import { Plus, Edit2, Users, Layers, Hash, Grid } from 'lucide-react';

const TONE_CLASSES: Record<StatusTone, string> = {
  success: 'tone-success',
  pending: 'tone-pending',
  critical: 'tone-critical',
  neutral: 'tone-neutral',
};

export default function TablesInventoryPage() {
  const { cafe } = useTenant();
  const { user } = useAuth();
  const { data: tables = [], isLoading, isError } = useTables(cafe?.id);
  const canEditTables = hasCafePermission(user, cafe?.id, 'edit_tables');

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
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white/70 backdrop-blur-sm p-5 rounded-2xl border border-brand-brown/10">
        <div>
          <h1 className="text-2xl font-bold font-display text-brand-brown">Table Inventory</h1>
          <p className="text-xs text-brand-mochaMid mt-0.5">Manage physical cafe floorplan tables and adjacent merges</p>
        </div>

        {canEditTables && (
          <button
            onClick={handleOpenAdd}
            className="btn-action py-2.5 px-5 text-sm"
          >
            <Plus className="w-4 h-4 mr-1" /> Add table
          </button>
        )}
      </div>

      {/* Table Data List */}
      <div className="bg-white/70 backdrop-blur-sm rounded-2xl border border-brand-brown/10 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-brand-brown">
            <thead className="bg-brand-tan/30 text-xs uppercase font-bold text-brand-mochaMid border-b border-brand-brown/10">
              <tr>
                <th className="p-4">Table</th>
                <th className="p-4">Capacity</th>
                <th className="p-4">Floor</th>
                <th className="p-4">Zone</th>
                <th className="p-4">Status</th>
                <th className="p-4">Can merge with</th>
                <th className="p-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-brown/10">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-brand-mochaMid animate-pulse">
                    Loading floorplan tables...
                  </td>
                </tr>
              ) : isError ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-sm font-medium text-red-700">
                    Couldn&apos;t load tables. Please try again.
                  </td>
                </tr>
              ) : tables.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-brand-mochaMid">
                    {canEditTables
                      ? 'No physical tables created yet. Click "Add table" to start.'
                      : 'No physical tables have been added yet.'}
                  </td>
                </tr>
              ) : (
                tables.map((table) => (
                  <tr key={table.id || table.table_number} className="hover:bg-brand-tan/20 transition-colors">
                    <td className="p-4 font-mono font-bold text-sm flex items-center gap-1.5 tabular-nums">
                      <Hash className="w-4 h-4 text-brand-red" /> {table.table_number}
                    </td>
                    <td className="p-4 font-semibold text-xs">
                      <span className="tone-neutral inline-flex items-center gap-1 px-2.5 py-1 rounded-full">
                        <Users className="w-3.5 h-3.5" /> {table.capacity}
                      </span>
                    </td>
                    <td className="p-4 text-xs font-mono font-semibold text-brand-mocha tabular-nums">
                      {table.floor || 1}
                    </td>
                    <td className="p-4 text-xs font-semibold text-brand-mocha">
                      {TABLE_ZONE_LABELS[table.zone] || TABLE_ZONE_LABELS.indoor}
                    </td>
                    <td className="p-4 text-xs font-bold">
                      {(() => {
                        const { label, tone } = describeTableStatus(table.status);
                        return <span className={`${TONE_CLASSES[tone]} px-2.5 py-1 rounded-full`}>{label}</span>;
                      })()}
                    </td>
                    <td className="p-4 text-xs font-mono text-brand-mochaMid tabular-nums">
                      {(() => {
                        const partnerNumbers = getMergePartnerTableNumbers(table);
                        return partnerNumbers.length > 0 ? partnerNumbers.join(', ') : 'None';
                      })()}
                    </td>
                    <td className="p-4 text-right">
                      {canEditTables && (
                        <button
                          onClick={() => handleOpenEdit(table)}
                          className="p-2 rounded-xl text-brand-brown hover:bg-brand-tan/50 transition-colors border border-brand-brown/10"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Layout Visualization */}
      <TableLayoutVisualization tables={tables} />

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
