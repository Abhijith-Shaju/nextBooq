'use client';

import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Table, TableStatus } from '@/types';
import { Users, CheckCircle2, UserCheck, RefreshCw, XCircle } from 'lucide-react';

const initialTables: Table[] = [
  { _id: 't-1', cafe_id: 'cafe-1', table_number: 'T1', capacity: 2, status: 'active', x_coord: 80, y_coord: 80, __v: 1 },
  { _id: 't-2', cafe_id: 'cafe-1', table_number: 'T2', capacity: 4, status: 'active', x_coord: 220, y_coord: 80, __v: 1 },
  { _id: 't-3', cafe_id: 'cafe-1', table_number: 'T3', capacity: 4, status: 'active', x_coord: 360, y_coord: 80, __v: 1 },
  { _id: 't-4', cafe_id: 'cafe-1', table_number: 'T4', capacity: 6, status: 'active', x_coord: 500, y_coord: 80, __v: 1 },
  { _id: 't-5', cafe_id: 'cafe-1', table_number: 'T5', capacity: 2, status: 'active', x_coord: 80, y_coord: 220, __v: 1 },
  { _id: 't-6', cafe_id: 'cafe-1', table_number: 'T6', capacity: 4, status: 'active', x_coord: 220, y_coord: 220, __v: 1 },
  { _id: 't-7', cafe_id: 'cafe-1', table_number: 'T7', capacity: 8, status: 'out_of_service', x_coord: 400, y_coord: 220, __v: 1 },
];

export function FloorplanView() {
  const [tables, setTables] = useState<Table[]>(initialTables);
  const [seatedTableIds, setSeatedTableIds] = useState<string[]>(['t-2', 't-4']);
  const [selectedTable, setSelectedTable] = useState<Table | null>(null);

  const handleTableClick = (table: Table) => {
    setSelectedTable(table);
  };

  const handleToggleSeated = (tableId: string) => {
    // Optimistic UI update
    setSeatedTableIds((prev) =>
      prev.includes(tableId) ? prev.filter((id) => id !== tableId) : [...prev, tableId]
    );
    setSelectedTable(null);
  };

  return (
    <div className="space-y-6">
      {/* Title & Stats */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Interactive Floorplan Visualizer</h1>
          <p className="text-xs text-stone-400">Click any table to update seating state in real time.</p>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 text-xs font-semibold">
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-emerald-500 inline-block" /> Available</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-rose-500 inline-block" /> Seated</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-stone-700 inline-block" /> Out of Service</span>
        </div>
      </div>

      {/* SVG Canvas Floorplan Container */}
      <Card className="bg-stone-900/80 border-stone-800 p-6">
        <div className="relative w-full h-[420px] bg-stone-950/60 rounded-xl border border-stone-800/80 overflow-hidden flex items-center justify-center">
          <svg className="w-full h-full">
            {/* Grid Lines Pattern */}
            <defs>
              <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#27272a" strokeWidth="0.5" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#grid)" />

            {/* Tables SVG Elements */}
            {tables.map((table) => {
              const isSeated = seatedTableIds.includes(table._id);
              const isOutOfService = table.status === 'out_of_service';

              let fillColor = '#10b981'; // Green (Available)
              if (isSeated) fillColor = '#f43f5e'; // Red (Seated)
              if (isOutOfService) fillColor = '#3f3f46'; // Gray (Out of service)

              return (
                <g
                  key={table._id}
                  transform={`translate(${table.x_coord}, ${table.y_coord})`}
                  onClick={() => handleTableClick(table)}
                  className="cursor-pointer group"
                >
                  <circle
                    r={table.capacity > 4 ? 36 : 28}
                    fill={fillColor}
                    opacity={0.85}
                    className="transition-all duration-200 group-hover:scale-110 group-hover:opacity-100"
                  />
                  <text
                    textAnchor="middle"
                    dy="-2"
                    fill="#ffffff"
                    fontSize="12"
                    fontWeight="bold"
                    pointerEvents="none"
                  >
                    {table.table_number}
                  </text>
                  <text
                    textAnchor="middle"
                    dy="12"
                    fill="#ffffff"
                    fontSize="9"
                    opacity="0.8"
                    pointerEvents="none"
                  >
                    {table.capacity}p
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      </Card>

      {/* Table Status Modal */}
      {selectedTable && (
        <Modal isOpen={!!selectedTable} onClose={() => setSelectedTable(null)} title={`Table ${selectedTable.table_number} Management`}>
          <div className="space-y-4">
            <div className="p-3 rounded-lg bg-stone-800 text-xs text-stone-300 space-y-1">
              <div>Capacity: <strong>{selectedTable.capacity} Guests</strong></div>
              <div>Current Status: <strong>{seatedTableIds.includes(selectedTable._id) ? 'SEATED (Red)' : 'AVAILABLE (Green)'}</strong></div>
            </div>

            <Button
              onClick={() => handleToggleSeated(selectedTable._id)}
              variant={seatedTableIds.includes(selectedTable._id) ? 'outline' : 'secondary'}
              className="w-full font-bold"
            >
              {seatedTableIds.includes(selectedTable._id) ? (
                <>
                  <RefreshCw className="w-4 h-4" /> Release Table (Clear Guest)
                </>
              ) : (
                <>
                  <UserCheck className="w-4 h-4" /> Seat Arriving Guest
                </>
              )}
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
