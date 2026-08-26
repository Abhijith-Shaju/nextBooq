import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { ReservationDetailModal } from './reservation-detail-modal';
import { Reservation } from '@/lib/types/models';

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
