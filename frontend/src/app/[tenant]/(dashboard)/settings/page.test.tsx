import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import CafeSettingsPage from './page';
import { axiosInstance } from '@/hooks/api/axios-instance';

const refreshMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/hooks/api/axios-instance', () => ({
  axiosInstance: { put: vi.fn() },
}));

vi.mock('@/components/dashboard/storefront-editor', () => ({
  StorefrontEditor: () => null,
}));

vi.mock('@/components/dashboard/payments-editor', () => ({
  PaymentsEditor: () => null,
}));

const baseCafe = {
  id: 'cafe_1',
  slug: 'demo-cafe',
  name: 'Demo Cafe',
  timezone: 'UTC',
  reservation_rules: {
    default_turn_time_minutes: 90,
    max_party_size: 12,
    booking_lead_time_hours: 24,
    hold_duration_minutes: 10,
    reservation_fee: 150,
  },
  operating_hours: [],
  menu: [],
  payments: { razorpay_key_id: '', configured: false },
};

vi.mock('@/components/providers/tenant-provider', () => ({
  useTenant: () => ({ cafe: baseCafe }),
}));

describe('CafeSettingsPage — reservation fee', () => {
  beforeEach(() => {
    refreshMock.mockReset();
    vi.mocked(axiosInstance.put).mockReset();
    vi.mocked(axiosInstance.put).mockResolvedValue({ data: { data: baseCafe } });
  });

  test('shows the cafe\'s current reservation fee', () => {
    render(<CafeSettingsPage />);

    expect(screen.getByLabelText(/reservation fee/i)).toHaveValue(150);
  });

  test('submits the edited reservation fee alongside the other rules', async () => {
    render(<CafeSettingsPage />);

    fireEvent.change(screen.getByLabelText(/reservation fee/i), { target: { value: '249.5' } });
    fireEvent.click(screen.getByRole('button', { name: /save cafe rules/i }));

    await waitFor(() =>
      expect(axiosInstance.put).toHaveBeenCalledWith(
        '/api/v1/cafes/cafe_1',
        expect.objectContaining({
          reservation_rules: expect.objectContaining({ reservation_fee: 249.5 }),
        })
      )
    );
  });
});
