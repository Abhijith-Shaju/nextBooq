const { VALID_TRANSITIONS } = require('../../src/services/stateMachine');

describe('Reservation State Machine Matrix Tests', () => {
  test('HOLD state should only transition to PENDING_PAYMENT or EXPIRED', () => {
    expect(VALID_TRANSITIONS.HOLD).toEqual(['PENDING_PAYMENT', 'EXPIRED']);
  });

  test('PENDING_PAYMENT state should only transition to CONFIRMED or CANCELLED', () => {
    expect(VALID_TRANSITIONS.PENDING_PAYMENT).toEqual(['CONFIRMED', 'CANCELLED']);
  });

  test('CONFIRMED state should transition to CHECKED_IN, SEATED, CANCELLED, or NO_SHOW', () => {
    expect(VALID_TRANSITIONS.CONFIRMED).toEqual([
      'CHECKED_IN',
      'SEATED',
      'CANCELLED',
      'NO_SHOW',
    ]);
  });

  test('Terminal states should have zero outward transitions', () => {
    expect(VALID_TRANSITIONS.COMPLETED).toEqual([]);
    expect(VALID_TRANSITIONS.CANCELLED).toEqual([]);
    expect(VALID_TRANSITIONS.EXPIRED).toEqual([]);
    expect(VALID_TRANSITIONS.NO_SHOW).toEqual([]);
    expect(VALID_TRANSITIONS.LEFT_BEFORE_SEATING).toEqual([]);
  });
});
