import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import CafeSettingsPage from './page';
import { useTenant } from '@/components/providers/tenant-provider';
import { axiosInstance } from '@/hooks/api/axios-instance';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh }),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/hooks/api/axios-instance', () => ({
  axiosInstance: { put: vi.fn() },
}));

vi.mock('@/components/providers/tenant-provider', () => ({
  useTenant: vi.fn(),
}));

const makeCafe = (overrides: Partial<{ default_turn_time_minutes: number; max_party_size: number }> = {}) => ({
  id: 'cafe_1',
  slug: 'demo-cafe',
  name: 'Demo Cafe',
  timezone: 'UTC',
  reservation_rules: {
    default_turn_time_minutes: 90,
    max_party_size: 12,
    booking_lead_time_hours: 24,
    hold_duration_minutes: 10,
    ...overrides,
  },
});

describe('CafeSettingsPage', () => {
  beforeEach(() => {
    refresh.mockReset();
    vi.mocked(axiosInstance.put).mockReset().mockResolvedValue({ data: { data: {} } });
    vi.mocked(useTenant).mockReturnValue({ cafe: makeCafe() } as any);
  });

  test('refreshes server data after a successful save (fixes stale values on revisit)', async () => {
    render(<CafeSettingsPage />);

    fireEvent.click(screen.getByRole('button', { name: /save cafe rules/i }));

    await waitFor(() => expect(axiosInstance.put).toHaveBeenCalled());
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  });

  test('re-syncs displayed values when the underlying cafe data changes without an unmount', () => {
    const { rerender } = render(<CafeSettingsPage />);

    expect(screen.getByLabelText(/default turn time/i)).toHaveValue(90);

    vi.mocked(useTenant).mockReturnValue({
      cafe: makeCafe({ default_turn_time_minutes: 120, max_party_size: 20 }),
    } as any);
    rerender(<CafeSettingsPage />);

    expect(screen.getByLabelText(/default turn time/i)).toHaveValue(120);
    expect(screen.getByLabelText(/maximum party size/i)).toHaveValue(20);
  });
});

describe('CafeSettingsPage — operating hours', () => {
  beforeEach(() => {
    refresh.mockReset();
    vi.mocked(axiosInstance.put).mockReset().mockResolvedValue({ data: { data: {} } });
  });

  test('defaults every day to 09:00-22:00 open when the cafe has never configured hours', () => {
    vi.mocked(useTenant).mockReturnValue({ cafe: makeCafe() } as any);
    render(<CafeSettingsPage />);

    expect(screen.getByLabelText(/monday opening time/i)).toHaveValue('09:00');
    expect(screen.getByLabelText(/monday closing time/i)).toHaveValue('22:00');
    expect(screen.getByLabelText(/monday closed/i)).not.toBeChecked();
    expect(screen.getByLabelText(/sunday opening time/i)).toHaveValue('09:00');
  });

  test('shows the cafe\'s actual configured hours, including a closed day', () => {
    vi.mocked(useTenant).mockReturnValue({
      cafe: {
        ...makeCafe(),
        operating_hours: [
          { day_of_week: 'sunday', open_time: '00:00', close_time: '00:00', is_closed: true },
          { day_of_week: 'friday', open_time: '10:00', close_time: '23:00', is_closed: false },
        ],
      },
    } as any);
    render(<CafeSettingsPage />);

    expect(screen.getByLabelText(/sunday closed/i)).toBeChecked();
    expect(screen.getByLabelText(/friday opening time/i)).toHaveValue('10:00');
    expect(screen.getByLabelText(/friday closing time/i)).toHaveValue('23:00');
  });

  test('saving includes operating_hours in the request body', async () => {
    vi.mocked(useTenant).mockReturnValue({ cafe: makeCafe() } as any);
    render(<CafeSettingsPage />);

    fireEvent.click(screen.getByRole('button', { name: /save cafe rules/i }));

    await waitFor(() =>
      expect(axiosInstance.put).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          operating_hours: expect.arrayContaining([
            expect.objectContaining({ day_of_week: 'monday', open_time: '09:00', close_time: '22:00' }),
          ]),
        })
      )
    );
  });

  test('blocks saving and shows an error when a closing time is not after opening time', async () => {
    vi.mocked(useTenant).mockReturnValue({ cafe: makeCafe() } as any);
    render(<CafeSettingsPage />);

    fireEvent.change(screen.getByLabelText(/monday opening time/i), { target: { value: '20:00' } });
    fireEvent.change(screen.getByLabelText(/monday closing time/i), { target: { value: '09:00' } });
    fireEvent.click(screen.getByRole('button', { name: /save cafe rules/i }));

    await waitFor(() => expect(axiosInstance.put).not.toHaveBeenCalled());
  });
});
