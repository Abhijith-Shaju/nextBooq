const {
  generateApplicationRef,
  APPLICATION_REF_ALPHABET,
  APPLICATION_REF_PATTERN,
} = require('../../src/utils/applicationRef');

describe('generateApplicationRef', () => {
  test('matches the NB-XXXX-XXXX shape', () => {
    expect(generateApplicationRef()).toMatch(APPLICATION_REF_PATTERN);
  });

  test('never emits the ambiguous characters I, L, O or U', () => {
    const alphabet = APPLICATION_REF_ALPHABET;
    for (const ambiguous of ['I', 'L', 'O', 'U']) {
      expect(alphabet).not.toContain(ambiguous);
    }
    const refs = Array.from({ length: 200 }, () => generateApplicationRef());
    for (const ref of refs) {
      expect(ref.replace(/^NB-/, '').replace('-', '')).toMatch(/^[0-9A-HJKMNP-TV-Z]{8}$/);
    }
  });

  test('produces distinct values across many calls', () => {
    const refs = new Set(Array.from({ length: 500 }, () => generateApplicationRef()));
    expect(refs.size).toBe(500);
  });
});
