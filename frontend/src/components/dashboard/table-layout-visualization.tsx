'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Table } from '@/lib/types/models';
import { groupTablesByZone } from '@/lib/dashboard/table-zones';
import { getMergePartnerIds } from '@/lib/dashboard/table-merge';
import { Hash, Users } from 'lucide-react';

interface TableLayoutVisualizationProps {
  tables: Table[];
}

interface Point {
  x: number;
  y: number;
}

interface Edge {
  from: string;
  to: string;
}

// Bows every connector upward into an arc instead of a straight line. A
// straight line between two far-apart nodes runs collinear with — and
// disappears behind — every node and line in between, which reads as a
// single unbroken chain even when most of those in-between nodes share no
// merge relationship at all. An arc stays visually distinct no matter how
// many nodes it passes over.
const MIN_ARC_HEIGHT = 16;
const MAX_ARC_HEIGHT = 90;
const ARC_HEIGHT_RATIO = 0.28;

function arcPath(from: Point, to: Point): string {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  const arcHeight = Math.min(Math.max(distance * ARC_HEIGHT_RATIO, MIN_ARC_HEIGHT), MAX_ARC_HEIGHT);
  const midX = (from.x + to.x) / 2;
  const midY = (from.y + to.y) / 2 - arcHeight;
  return `M ${from.x} ${from.y} Q ${midX} ${midY} ${to.x} ${to.y}`;
}

function tableId(table: Table): string | null {
  return table.id || table._id || null;
}

export function TableLayoutVisualization({ tables }: TableLayoutVisualizationProps) {
  const [selectedFloor, setSelectedFloor] = useState<number | null>(null);
  const [positions, setPositions] = useState<Record<string, Point>>({});

  const containerRef = useRef<HTMLDivElement>(null);
  const nodeRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const floors = useMemo(() => {
    const set = new Set(tables.map((t) => t.floor || 1));
    return Array.from(set).sort((a, b) => a - b);
  }, [tables]);

  const activeFloor = selectedFloor !== null && floors.includes(selectedFloor) ? selectedFloor : (floors[0] ?? 1);

  const floorTables = useMemo(() => tables.filter((t) => (t.floor || 1) === activeFloor), [tables, activeFloor]);

  const zoneGroups = useMemo(() => groupTablesByZone(floorTables), [floorTables]);

  const edges = useMemo<Edge[]>(() => {
    const seen = new Set<string>();
    const result: Edge[] = [];
    for (const table of floorTables) {
      const id = tableId(table);
      if (!id) continue;
      for (const partnerId of getMergePartnerIds(table)) {
        if (partnerId === id) continue;
        const key = [id, partnerId].sort().join('|');
        if (seen.has(key)) continue;
        seen.add(key);
        result.push({ from: id, to: partnerId });
      }
    }
    return result;
  }, [floorTables]);

  const measure = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const containerRect = container.getBoundingClientRect();
    const next: Record<string, Point> = {};
    nodeRefs.current.forEach((el, id) => {
      const rect = el.getBoundingClientRect();
      next[id] = {
        x: rect.left - containerRect.left + rect.width / 2,
        y: rect.top - containerRect.top + rect.height / 2,
      };
    });
    setPositions(next);
  }, []);

  // Re-measure whenever the rendered node set (or its layout) could have
  // changed — the graph is auto-laid-out via ordinary flex-wrap, not
  // drag-positioned, so connector arcs have to be recomputed from wherever
  // the browser actually put each node.
  useLayoutEffect(() => {
    measure();
  }, [measure, floorTables]);

  useEffect(() => {
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [measure]);

  if (tables.length === 0) return null;

  const setNodeRef = (id: string) => (el: HTMLDivElement | null) => {
    if (el) {
      nodeRefs.current.set(id, el);
    } else {
      nodeRefs.current.delete(id);
    }
  };

  return (
    <div className="bg-white/70 backdrop-blur-sm rounded-2xl border border-brand-brown/10 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <h2 className="text-lg font-bold font-display text-brand-brown">Layout Visualization</h2>
          <p className="text-xs text-brand-mochaMid mt-0.5">
            Tables grouped by zone, with an arc drawn between any two marked as mergeable.
          </p>
        </div>

        {floors.length > 1 && (
          <div className="flex items-center gap-1.5 bg-brand-cream rounded-xl p-1 border border-brand-brown/10">
            {floors.map((floor) => (
              <button
                key={floor}
                type="button"
                onClick={() => setSelectedFloor(floor)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                  floor === activeFloor
                    ? 'bg-brand-red text-white shadow-brand-sm'
                    : 'text-brand-mocha hover:bg-white'
                }`}
              >
                Floor {floor}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* pt-10 reserves headroom above the top row of table nodes so an arc
          to a distant partner has room to bow upward without clipping. */}
      <div ref={containerRef} className="relative pt-10">
        <svg
          data-testid="table-layout-connectors"
          className="absolute inset-0 w-full h-full pointer-events-none"
          aria-hidden="true"
        >
          {edges.map((edge) => {
            const from = positions[edge.from];
            const to = positions[edge.to];
            if (!from || !to) return null;
            return (
              <path
                key={`${edge.from}-${edge.to}`}
                d={arcPath(from, to)}
                fill="none"
                stroke="var(--brand-gold, #A8752E)"
                strokeWidth={2}
                strokeDasharray="5 4"
                strokeLinecap="round"
              />
            );
          })}
        </svg>

        <div className="relative flex flex-wrap gap-4">
          {zoneGroups.map((group) => (
            <div
              key={group.zone}
              className="rounded-3xl border-2 border-dashed border-brand-brown/15 bg-brand-cream/40 p-4 min-w-[180px]"
            >
              <span className="inline-flex items-center rounded-full bg-brand-tan/60 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-brand-brown mb-3">
                {group.label}
              </span>

              <div className="flex flex-wrap gap-3">
                {group.tables.map((table) => {
                  const id = tableId(table);
                  const isOutOfService = table.status === 'out_of_service';
                  return (
                    <div
                      key={id || table.table_number}
                      ref={id ? setNodeRef(id) : undefined}
                      className={`flex flex-col items-center justify-center w-16 h-16 rounded-full border-2 text-center shrink-0 ${
                        isOutOfService
                          ? 'bg-brand-tan/40 border-brand-brown/15 text-brand-mochaMid opacity-60'
                          : 'bg-white border-emerald-400 text-emerald-900'
                      }`}
                      title={`Table ${table.table_number} · seats ${table.capacity}${isOutOfService ? ' · out of service' : ''}`}
                    >
                      <span className="font-mono font-bold text-xs flex items-center gap-0.5 tabular-nums">
                        <Hash className="w-2.5 h-2.5 opacity-60" /> {table.table_number}
                      </span>
                      <span className="text-[10px] font-semibold flex items-center gap-0.5 opacity-70 tabular-nums">
                        <Users className="w-2.5 h-2.5" /> {table.capacity}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
