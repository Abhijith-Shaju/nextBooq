import type { TableStatus } from '@/lib/types/models';
import type { StatusDescription } from '@/lib/booking/reservation-status';

const TABLE_STATUS_DESCRIPTIONS: Record<TableStatus, StatusDescription> = {
  active: { label: 'Active', tone: 'success' },
  out_of_service: { label: 'Out of service', tone: 'critical' },
};

export function describeTableStatus(status: TableStatus): StatusDescription {
  return TABLE_STATUS_DESCRIPTIONS[status];
}
