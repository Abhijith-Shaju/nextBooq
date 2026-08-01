const { VALID_TRANSITIONS } = require('../../src/services/stateMachine');

describe('Reservation State Machine - Unit Matrix Tests', () => {
  describe('Valid Lifecycle Transitions', () => {
    test('HOLD can transition to PENDING_PAYMENT or EXPIRED', () => {
      expect(VALID_TRANSITIONS.HOLD).toEqual(['PENDING_PAYMENT', 'EXPIRED']);
    });

    test('PENDING_PAYMENT can transition to CONFIRMED or CANCELLED', () => {
      expect(VALID_TRANSITIONS.PENDING_PAYMENT).toEqual(['CONFIRMED', 'CANCELLED']);
    });

    test('CONFIRMED can transition to CHECKED_IN, SEATED, CANCELLED, or NO_SHOW', () => {
      expect(VALID_TRANSITIONS.CONFIRMED).toEqual([
        'CHECKED_IN',
        'SEATED',
        'CANCELLED',
        'NO_SHOW',
      ]);
    });

    test('CHECKED_IN can transition to SEATED or LEFT_BEFORE_SEATING', () => {
      expect(VALID_TRANSITIONS.CHECKED_IN).toEqual(['SEATED', 'LEFT_BEFORE_SEATING']);
    });

    test('SEATED can transition to COMPLETED', () => {
      expect(VALID_TRANSITIONS.SEATED).toEqual(['COMPLETED']);
    });
  });

  describe('Terminal States Protection', () => {
    const terminalStates = ['COMPLETED', 'CANCELLED', 'EXPIRED', 'NO_SHOW', 'LEFT_BEFORE_SEATING'];

    terminalStates.forEach((state) => {
      test(`Terminal state ${state} has no outward transitions`, () => {
        expect(VALID_TRANSITIONS[state]).toEqual([]);
      });
    });
  });

  describe('Illegal Transition Verification', () => {
    test('COMPLETED state does not permit transition back to CONFIRMED', () => {
      expect(VALID_TRANSITIONS.COMPLETED.includes('CONFIRMED')).toBe(false);
    });

    test('CANCELLED state does not permit transition to SEATED', () => {
      expect(VALID_TRANSITIONS.CANCELLED.includes('SEATED')).toBe(false);
    });

    test('HOLD state cannot jump directly to SEATED or COMPLETED', () => {
      expect(VALID_TRANSITIONS.HOLD.includes('SEATED')).toBe(false);
      expect(VALID_TRANSITIONS.HOLD.includes('COMPLETED')).toBe(false);
    });
  });
});
