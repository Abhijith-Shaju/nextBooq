'use client';

import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Table } from '@/types';
import { Plus, Edit2, Grid, Layers } from 'lucide-react';

const initialTables: Table[] = [
  { _id: 't-1', cafe_id: 'cafe-1', table_number: 'T1', capacity: 2, status: 'active', can_merge_with: ['t-2'], __v: 1 },
  { _id: 't-2', cafe_id: 'cafe-1', table_number: 'T2', capacity: 4, status: 'active', can_merge_with: ['t-1', 't-3'], __v: 1 },
  { _id: 't-3', cafe_id: 'cafe-1', table_number: 'T3', capacity: 4, status: 'active', can_merge_with: ['t-2'], __v: 1 },
  { _id: 't-4', cafe_id: 'cafe-1', table_number: 'T4', capacity: 6, status: 'active', can_merge_with: [], __v: 1 },
];

export function TableManagerView() {
  const [tables, setTables] = useState<Table[]>(initialTables);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [tableNumber, setTableNumber] = useState('');
  const [capacity, setCapacity] = useState(4);

  const handleAddTable = (e: React.FormEvent) => {
    e.preventDefault();
    const newTable: Table = {
      _id: `t-${Date.now()}`,
      cafe_id: 'cafe-1',
      table_number: tableNumber.toUpperCase(),
      capacity: Number(capacity),
      status: 'active',
      can_merge_with: [],
      __v: 1,
    };
    setTables([...tables, newTable]);
    setIsAddModalOpen(false);
    setTableNumber('');
    setCapacity(4);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Table Inventory & Merging Rules</h1>
          <p className="text-xs text-stone-400">Configure physical table capacities and symmetric merge mappings.</p>
        </div>
        <Button onClick={() => setIsAddModalOpen(true)} variant="secondary" size="sm">
          <Plus className="w-4 h-4" /> Add Physical Table
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        {tables.map((table) => (
          <Card key={table._id} className="bg-stone-900/80 border-stone-800">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-lg font-black text-amber-400">{table.table_number}</CardTitle>
              <Badge status={table.status} />
            </CardHeader>
            <CardContent className="space-y-2 text-xs text-stone-300">
              <div>Capacity: <strong className="text-stone-100">{table.capacity} Seats</strong></div>
              <div>
                Mergeable With:{' '}
                {table.can_merge_with && table.can_merge_with.length > 0 ? (
                  <span className="text-indigo-400 font-semibold">{table.can_merge_with.join(', ')}</span>
                ) : (
                  <span className="text-stone-500">None</span>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Add Table Modal */}
      <Modal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} title="Add Physical Table">
        <form onSubmit={handleAddTable} className="space-y-4">
          <Input
            label="Table Number / Identifier"
            placeholder="e.g. T8"
            value={tableNumber}
            onChange={(e) => setTableNumber(e.target.value)}
            required
          />
          <Input
            label="Seating Capacity"
            type="number"
            min={1}
            max={20}
            value={capacity}
            onChange={(e) => setCapacity(Number(e.target.value))}
            required
          />
          <Button type="submit" variant="secondary" className="w-full font-bold">
            Create Table
          </Button>
        </form>
      </Modal>
    </div>
  );
}
