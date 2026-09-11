import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import CafeSettingsPage from './page';
import { useTenant } from '@/components/providers/tenant-provider';
import { axiosInstance } from '@/hooks/api/axios-instance';
import type { ReservationRules } from '@/lib/types/models';

// CafeSettingsPage renders PaymentsEditor, which calls useMutation
// (useRequestStepUpOtp) — it needs a QueryClientProvider ancestor even though
// none of these tests touch payments directly.
const renderPage = (ui: React.ReactElement = <CafeSettingsPage />, queryClient = new QueryClient()) =>
  render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);

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

// Typed off the real ReservationRules so a new rule can be overridden here
// without this helper's own hand-maintained list going stale.
const makeCafe = (overrides: Partial<ReservationRules> = {}) => ({
  id: 'cafe_1',
  slug: 'demo-cafe',
  name: 'Demo Cafe',
  timezone: 'UTC',
  reservation_rules: {
    default_turn_time_minutes: 90,
    max_party_size: 12,
    booking_lead_time_hours: 24,
    hold_duration_minutes: 10,
    reservation_fee: 100,
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
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /save cafe rules/i }));

    await waitFor(() => expect(axiosInstance.put).toHaveBeenCalled());
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  });

  test('re-syncs displayed values when the underlying cafe data changes without an unmount', () => {
    const queryClient = new QueryClient();
    const { rerender } = renderPage(<CafeSettingsPage />, queryClient);

    expect(screen.getByLabelText(/default turn time/i)).toHaveValue(90);

    vi.mocked(useTenant).mockReturnValue({
      cafe: makeCafe({ default_turn_time_minutes: 120, max_party_size: 20 }),
    } as any);
    rerender(
      <QueryClientProvider client={queryClient}>
        <CafeSettingsPage />
      </QueryClientProvider>
    );

    expect(screen.getByLabelText(/default turn time/i)).toHaveValue(120);
    expect(screen.getByLabelText(/maximum party size/i)).toHaveValue(20);
  });
});

describe('CafeSettingsPage — reservation fee', () => {
  beforeEach(() => {
    refresh.mockReset();
    vi.mocked(axiosInstance.put).mockReset().mockResolvedValue({ data: { data: {} } });
  });

  test('shows the cafe\'s current reservation fee', () => {
    vi.mocked(useTenant).mockReturnValue({ cafe: makeCafe({ reservation_fee: 150 }) } as any);
    renderPage();

    expect(screen.getByLabelText(/reservation fee/i)).toHaveValue(150);
  });

  test('submits the edited reservation fee alongside the other rules', async () => {
    vi.mocked(useTenant).mockReturnValue({ cafe: makeCafe() } as any);
    renderPage();

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

describe('CafeSettingsPage — operating hours', () => {
  beforeEach(() => {
    refresh.mockReset();
    vi.mocked(axiosInstance.put).mockReset().mockResolvedValue({ data: { data: {} } });
  });

  test('defaults every day to 09:00-22:00 open when the cafe has never configured hours', () => {
    vi.mocked(useTenant).mockReturnValue({ cafe: makeCafe() } as any);
    renderPage();

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
    renderPage();

    expect(screen.getByLabelText(/sunday closed/i)).toBeChecked();
    expect(screen.getByLabelText(/friday opening time/i)).toHaveValue('10:00');
    expect(screen.getByLabelText(/friday closing time/i)).toHaveValue('23:00');
  });

  test('saving includes operating_hours in the request body', async () => {
    vi.mocked(useTenant).mockReturnValue({ cafe: makeCafe() } as any);
    renderPage();

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
    renderPage();

    fireEvent.change(screen.getByLabelText(/monday opening time/i), { target: { value: '20:00' } });
    fireEvent.change(screen.getByLabelText(/monday closing time/i), { target: { value: '09:00' } });
    fireEvent.click(screen.getByRole('button', { name: /save cafe rules/i }));

    await waitFor(() => expect(axiosInstance.put).not.toHaveBeenCalled());
  });
});

describe('CafeSettingsPage — storefront', () => {
  beforeEach(() => {
    refresh.mockReset();
    vi.mocked(axiosInstance.put).mockReset().mockResolvedValue({ data: { data: {} } });
  });

  test('shows the cafe\'s existing description, hero image URL, and contact phone', () => {
    vi.mocked(useTenant).mockReturnValue({
      cafe: {
        ...makeCafe(),
        description: 'Great coffee.',
        hero_image_url: 'https://example.com/hero.jpg',
        contact_phone: '+91 98765 43210',
      },
    } as any);
    renderPage();

    expect(screen.getByLabelText(/description/i)).toHaveValue('Great coffee.');
    expect(screen.getByLabelText(/hero photo url/i)).toHaveValue('https://example.com/hero.jpg');
    expect(screen.getByLabelText(/contact phone/i)).toHaveValue('+91 98765 43210');
  });

  test('saving includes description, hero image styling, contact_phone, and menu in the request body', async () => {
    vi.mocked(useTenant).mockReturnValue({
      cafe: {
        ...makeCafe(),
        description: 'Great coffee.',
        hero_image_url: 'https://example.com/hero.jpg',
        hero_tint_color: '#153A2E',
        hero_text_color: '#FFF4D8',
        contact_phone: '+91 98765 43210',
        menu: [{ category: 'Coffee', items: [{ name: 'Espresso', price: 120 }] }],
      },
    } as any);
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /save cafe rules/i }));

    await waitFor(() =>
      expect(axiosInstance.put).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          description: 'Great coffee.',
          hero_image_url: 'https://example.com/hero.jpg',
          hero_tint_color: '#153A2E',
          hero_text_color: '#FFF4D8',
          contact_phone: '+91 98765 43210',
          menu: [{ category: 'Coffee', items: [{ name: 'Espresso', price: 120 }] }],
        })
      )
    );
  });

  test('drops incomplete menu categories/items from the submitted payload without touching the on-screen menu', async () => {
    vi.mocked(useTenant).mockReturnValue({
      cafe: {
        ...makeCafe(),
        menu: [
          { category: 'Coffee', items: [{ name: 'Espresso', price: 120 }] },
          { category: '', items: [{ name: '', price: undefined }] },
        ],
      },
    } as any);
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /save cafe rules/i }));

    await waitFor(() =>
      expect(axiosInstance.put).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          menu: [{ category: 'Coffee', items: [{ name: 'Espresso', price: 120 }] }],
        })
      )
    );

    // The blank category is still shown in the editor afterwards — only the
    // submitted payload was filtered, not the in-progress form state.
    expect(screen.getAllByLabelText(/category \d+ name/i)).toHaveLength(2);
  });

  test('saving includes the address when line 1 is filled in', async () => {
    vi.mocked(useTenant).mockReturnValue({ cafe: makeCafe() } as any);
    renderPage();

    fireEvent.change(screen.getByLabelText(/address line 1/i), { target: { value: '12 Church Street' } });
    fireEvent.change(screen.getByLabelText(/^city$/i), { target: { value: 'Bengaluru' } });
    fireEvent.change(screen.getByLabelText(/^state$/i), { target: { value: 'Karnataka' } });
    fireEvent.change(screen.getByLabelText(/pin code/i), { target: { value: '560001' } });
    fireEvent.click(screen.getByRole('button', { name: /save cafe rules/i }));

    await waitFor(() =>
      expect(axiosInstance.put).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          address: expect.objectContaining({
            line1: '12 Church Street',
            city: 'Bengaluru',
            state: 'Karnataka',
            postal_code: '560001',
          }),
        })
      )
    );
  });

  test('saving with every address field blank still sends an address key (so a cleared address is actually cleared)', async () => {
    // Previously this omitted the `address` key entirely when line 1 was
    // blank, which meant blanking out an address and saving silently kept
    // the old address live on the storefront. The address section is always
    // rendered, so the key must always be sent — the backend is what decides
    // whether "all blank" means "clear it".
    vi.mocked(useTenant).mockReturnValue({ cafe: makeCafe() } as any);
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /save cafe rules/i }));

    await waitFor(() => expect(axiosInstance.put).toHaveBeenCalled());
    const [, body] = vi.mocked(axiosInstance.put).mock.calls[0];
    expect(body).toHaveProperty('address');
    expect((body as { address: Record<string, string> }).address).toMatchObject({
      line1: '',
      city: '',
      state: '',
      postal_code: '',
    });
  });

  test('blanking out a previously-saved address still sends an address key with every field empty', async () => {
    vi.mocked(useTenant).mockReturnValue({
      cafe: {
        ...makeCafe(),
        address: {
          line1: '12 Church Street',
          city: 'Bengaluru',
          state: 'Karnataka',
          postal_code: '560001',
          map_url: '',
        },
      },
    } as any);
    renderPage();

    fireEvent.change(screen.getByLabelText(/address line 1/i), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText(/^city$/i), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText(/^state$/i), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText(/pin code/i), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: /save cafe rules/i }));

    await waitFor(() =>
      expect(axiosInstance.put).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          address: expect.objectContaining({ line1: '', city: '', state: '', postal_code: '' }),
        })
      )
    );
  });

  test('editing the description field updates what would be submitted on save', async () => {
    vi.mocked(useTenant).mockReturnValue({ cafe: makeCafe() } as any);
    renderPage();

    fireEvent.change(screen.getByLabelText(/description/i), { target: { value: 'Updated description' } });
    fireEvent.click(screen.getByRole('button', { name: /save cafe rules/i }));

    await waitFor(() =>
      expect(axiosInstance.put).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ description: 'Updated description' })
      )
    );
  });
});

describe('CafeSettingsPage — branding', () => {
  beforeEach(() => {
    refresh.mockReset();
    vi.mocked(axiosInstance.put).mockReset().mockResolvedValue({ data: { data: {} } });
  });

  test("shows the cafe's saved logo and brand colours", () => {
    vi.mocked(useTenant).mockReturnValue({
      cafe: {
        ...makeCafe(),
        logo_url: 'https://example.com/logo.png',
        brand_primary: '#1B7F5A',
        brand_accent: '#E4A11B',
      },
    } as any);
    renderPage();

    expect(screen.getByLabelText(/logo url/i)).toHaveValue('https://example.com/logo.png');
    expect(screen.getByLabelText(/primary brand colour hex/i)).toHaveValue('#1B7F5A');
    expect(screen.getByLabelText(/accent brand colour hex/i)).toHaveValue('#E4A11B');
  });

  test('saving includes logo_url and both brand colours in the request body', async () => {
    vi.mocked(useTenant).mockReturnValue({
      cafe: {
        ...makeCafe(),
        logo_url: 'https://example.com/logo.png',
        brand_primary: '#1B7F5A',
        brand_accent: '#E4A11B',
      },
    } as any);
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /save cafe rules/i }));

    await waitFor(() =>
      expect(axiosInstance.put).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          logo_url: 'https://example.com/logo.png',
          brand_primary: '#1B7F5A',
          brand_accent: '#E4A11B',
        })
      )
    );
  });

  test('a cafe with no branding set submits empty values, meaning "use the default palette"', async () => {
    vi.mocked(useTenant).mockReturnValue({ cafe: makeCafe() } as any);
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /save cafe rules/i }));

    await waitFor(() =>
      expect(axiosInstance.put).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ logo_url: '', brand_primary: '', brand_accent: '' })
      )
    );
  });
});

// These two terms decide whether a guest gets their money back and whether the
// fee comes off their bill, so they have to round-trip through the save
// payload -- a toggle that looks right but never reaches the API would leave
// the storefront advertising terms the cafe never agreed to.
describe('CafeSettingsPage — fee and refund policy', () => {
  beforeEach(() => {
    refresh.mockReset();
    vi.mocked(axiosInstance.put).mockReset().mockResolvedValue({ data: { data: {} } });
  });

  test('defaults to adjusted-and-refundable for a cafe with no stored terms', () => {
    vi.mocked(useTenant).mockReturnValue({ cafe: makeCafe() } as any);
    renderPage();

    expect(screen.getByLabelText(/deduct the fee from the final bill/i)).toBeChecked();
    expect(screen.getByLabelText(/refund the fee if a guest cancels in time/i)).toBeChecked();
    expect(screen.getByLabelText(/cancellation cut-off/i)).toHaveValue(24);
  });

  test('reflects a cafe that has opted out of both', () => {
    vi.mocked(useTenant).mockReturnValue({
      cafe: makeCafe({
        fee_adjusted_against_bill: false,
        refund_on_cancellation: false,
        cancellation_cutoff_hours: 48,
      }),
    } as any);
    renderPage();

    expect(screen.getByLabelText(/deduct the fee from the final bill/i)).not.toBeChecked();
    expect(screen.getByLabelText(/refund the fee if a guest cancels in time/i)).not.toBeChecked();
    expect(screen.getByLabelText(/cancellation cut-off/i)).toHaveValue(48);
  });

  test('disables the cut-off when refunds are turned off', () => {
    vi.mocked(useTenant).mockReturnValue({ cafe: makeCafe() } as any);
    renderPage();

    expect(screen.getByLabelText(/cancellation cut-off/i)).not.toBeDisabled();
    fireEvent.click(screen.getByLabelText(/refund the fee if a guest cancels in time/i));
    expect(screen.getByLabelText(/cancellation cut-off/i)).toBeDisabled();
  });

  test('submits the fee terms alongside the other rules', async () => {
    vi.mocked(useTenant).mockReturnValue({ cafe: makeCafe() } as any);
    renderPage();

    fireEvent.click(screen.getByLabelText(/deduct the fee from the final bill/i));
    fireEvent.change(screen.getByLabelText(/cancellation cut-off/i), { target: { value: '12' } });
    fireEvent.click(screen.getByRole('button', { name: /save cafe rules/i }));

    await waitFor(() =>
      expect(axiosInstance.put).toHaveBeenCalledWith(
        '/api/v1/cafes/cafe_1',
        expect.objectContaining({
          reservation_rules: expect.objectContaining({
            fee_adjusted_against_bill: false,
            refund_on_cancellation: true,
            cancellation_cutoff_hours: 12,
          }),
        })
      )
    );
  });

  test('a zero-hour cut-off survives the save rather than reverting to 24', async () => {
    // `||` would treat 0 as missing and silently substitute the default,
    // turning "cancel any time" into "24 hours notice" without telling anyone.
    vi.mocked(useTenant).mockReturnValue({ cafe: makeCafe({ cancellation_cutoff_hours: 0 }) } as any);
    renderPage();

    expect(screen.getByLabelText(/cancellation cut-off/i)).toHaveValue(0);

    fireEvent.click(screen.getByRole('button', { name: /save cafe rules/i }));

    await waitFor(() =>
      expect(axiosInstance.put).toHaveBeenCalledWith(
        '/api/v1/cafes/cafe_1',
        expect.objectContaining({
          reservation_rules: expect.objectContaining({ cancellation_cutoff_hours: 0 }),
        })
      )
    );
  });
});
