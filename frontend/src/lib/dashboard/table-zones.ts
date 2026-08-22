import type { TableZone } from '@/lib/types/models';

export const TABLE_ZONE_ORDER: TableZone[] = ['window', 'outdoor', 'patio', 'indoor', 'private'];

export const TABLE_ZONE_LABELS: Record<TableZone, string> = {
  window: 'Window',
  outdoor: 'Outdoor',
  patio: 'Patio',
  indoor: 'Indoor',
  private: 'Private',
};

export interface TableZoneGroup<T> {
  zone: TableZone;
  label: string;
  tables: T[];
}

/**
 * Buckets tables by zone in a fixed display order, dropping any zone with no
 * tables in it rather than rendering an empty block for it.
 */
export function groupTablesByZone<T extends { zone: TableZone }>(tables: T[]): TableZoneGroup<T>[] {
  const byZone = new Map<TableZone, T[]>();
  for (const table of tables) {
    const zone = table.zone || 'indoor';
    if (!byZone.has(zone)) byZone.set(zone, []);
    byZone.get(zone)!.push(table);
  }

  return TABLE_ZONE_ORDER.filter((zone) => byZone.has(zone)).map((zone) => ({
    zone,
    label: TABLE_ZONE_LABELS[zone],
    tables: byZone.get(zone)!,
  }));
}
