const crypto = require('crypto');

// Crockford-style alphabet: I, L, O and U are removed so a reference read
// aloud or retyped from an email can't be confused with 1, 0 or V.
const APPLICATION_REF_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const APPLICATION_REF_PATTERN = /^NB-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/;

const randomBlock = (length) => {
  let block = '';
  for (let i = 0; i < length; i += 1) {
    block += APPLICATION_REF_ALPHABET[crypto.randomInt(APPLICATION_REF_ALPHABET.length)];
  }
  return block;
};

// Random rather than sequential: a counter needs its own collection and
// races under concurrent submissions, and a sequential id would leak the
// platform's total application volume to every applicant.
const generateApplicationRef = () => `NB-${randomBlock(4)}-${randomBlock(4)}`;

module.exports = { generateApplicationRef, APPLICATION_REF_ALPHABET, APPLICATION_REF_PATTERN };
