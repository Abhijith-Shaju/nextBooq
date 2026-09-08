import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { ReservationDetailModal } from './reservation-detail-modal';
import { Reservation } from '@/lib/types/models';

const cancelMutate = vi.fn();
vi.mock('@/hooks/customer/use-cancel-reservation', () => ({
  useCancelReservation: () => ({ mutate: cancelMutate, isPending: false }),
}));

const makeReservation = (overrides: Partial<Reservation> = {}): Reservation => ({
  id: 'res_1',
  _id: '6a89d0423db5e26083a9afea', // token AFEA
  cafe_id: 'cafe_1',
  start_time: '2026-09-05T19:00:00.000Z',
  end_time: '2026-09-05T20:00:00.000Z',
  party_size: 2,
  status: 'CONFIRMED',
  __v: 0,
  ...overrides,
});

describe('ReservationDetailModal', () => {
  test('renders nothing when no reservation is selected', () => {
    const { container } = render(
      <ReservationDetailModal reservation={null} cafeName="Demo Cafe" onClose={vi.fn()} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  test('shows the token, so a guest can retrieve it after leaving the success page', () => {
    render(
      <ReservationDetailModal reservation={makeReservation()} cafeName="Demo Cafe" onClose={vi.fn()} />
    );

    expect(screen.getByText('#AFEA')).toBeInTheDocument();
    expect(screen.getByText(/show this token at the door/i)).toBeInTheDocument();
  });

  test('shows the booking details and assigned table', () => {
    render(
      <ReservationDetailModal
        reservation={makeReservation({ table_ids: [{ _id: 't1', table_number: '7', capacity: 4 }] })}
        cafeName="Demo Cafe"
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText('Demo Cafe')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText(/table 7/i)).toBeInTheDocument();
  });

  test('frames the token as history once the booking is over', () => {
    render(
      <ReservationDetailModal
        reservation={makeReservation({ status: 'COMPLETED' })}
        cafeName="Demo Cafe"
        onClose={vi.fn()}
      />
    );

    expect(screen.queryByText(/show this token at the door/i)).not.toBeInTheDocument();
    expect(screen.getByText('#AFEA')).toBeInTheDocument();
  });

  test('offers Complete Payment only while payment is outstanding', () => {
    const onCompletePayment = vi.fn();
    const { rerender } = render(
      <ReservationDetailModal
        reservation={makeReservation({ status: 'PENDING_PAYMENT' })}
        cafeName="Demo Cafe"
        onClose={vi.fn()}
        onCompletePayment={onCompletePayment}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /complete payment/i }));
    expect(onCompletePayment).toHaveBeenCalled();

    rerender(
      <ReservationDetailModal
        reservation={makeReservation({ status: 'CONFIRMED' })}
        cafeName="Demo Cafe"
        onClose={vi.fn()}
        onCompletePayment={onCompletePayment}
      />
    );
    expect(screen.queryByRole('button', { name: /complete payment/i })).not.toBeInTheDocument();
  });

  test('closes from the close button', () => {
    const onClose = vi.fn();
    render(
      <ReservationDetailModal reservation={makeReservation()} cafeName="Demo Cafe" onClose={onClose} />
    );

    fireEvent.click(screen.getByRole('button', { name: /close booking details/i }));
    expect(onClose).toHaveBeenCalled();
  });
});

describe('cancelling a booking', () => {
  const openCancel = (reservation = makeReservation(), onClose = vi.fn()) => {
    render(
      <ReservationDetailModal reservation={reservation} cafeName="Demo Cafe" onClose={onClose} />
    );
    fireEvent.click(screen.getByRole('button', { name: /cancel this booking/i }));
    return { onClose };
  };

  beforeEach(() => {
    cancelMutate.mockReset();
  });

  test('offers cancellation on a booking that has not started', () => {
    render(
      <ReservationDetailModal reservation={makeReservation()} cafeName="Demo Cafe" onClose={vi.fn()} />
    );
    expect(screen.getByRole('button', { name: /cancel this booking/i })).toBeInTheDocument();
  });

  test.each(['SEATED', 'CHECKED_IN', 'CANCELLED', 'COMPLETED'] as const)(
    'does not offer cancellation once %s',
    (status) => {
      // Past check-in it is the cafe's to settle, not the app's — the endpoint
      // refuses too, so offering the button would only produce an error.
      render(
        <ReservationDetailModal
          reservation={makeReservation({ status })}
          cafeName="Demo Cafe"
          onClose={vi.fn()}
        />
      );
      expect(screen.queryByRole('button', { name: /cancel this booking/i })).not.toBeInTheDocument();
    }
  );

  test('asks for confirmation before calling anything', () => {
    // Releasing a table cannot be undone, so one stray tap must not do it.
    openCancel();

    expect(cancelMutate).not.toHaveBeenCalled();
    expect(screen.getByText(/cannot be undone/i)).toBeInTheDocument();
  });

  test('says the refund depends on the cafe terms rather than promising one', () => {
    // The server decides from the snapshotted terms and the notice given. A
    // promise here would eventually contradict the cafe's refunds queue.
    openCancel();
    expect(screen.getByText(/depends on Demo Cafe/i)).toBeInTheDocument();
  });

  test('backing out cancels nothing', () => {
    openCancel();
    fireEvent.click(screen.getByRole('button', { name: /keep booking/i }));

    expect(cancelMutate).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /cancel this booking/i })).toBeInTheDocument();
  });

  test('confirming sends the reservation id', () => {
    openCancel();
    fireEvent.click(screen.getByRole('button', { name: /yes, cancel/i }));

    expect(cancelMutate).toHaveBeenCalledWith(
      '6a89d0423db5e26083a9afea',
      expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) })
    );
  });

  test('surfaces a server refusal in place rather than losing it', () => {
    cancelMutate.mockImplementation((_id, { onError }: any) =>
      onError({ response: { data: { message: 'This booking can no longer be cancelled online.' } } })
    );
    openCancel();
    fireEvent.click(screen.getByRole('button', { name: /yes, cancel/i }));

    expect(screen.getByRole('alert')).toHaveTextContent(/no longer be cancelled online/i);
    // Still open, so the guest can read it and contact the cafe.
    expect(screen.getByRole('button', { name: /keep booking/i })).toBeInTheDocument();
  });
});
