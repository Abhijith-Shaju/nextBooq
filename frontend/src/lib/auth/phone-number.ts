export const MIN_PHONE_DIGITS = 7;
export const MAX_PHONE_DIGITS = 15;

export function getPhoneDigits(phone: string) {
  return phone.replace(/\D/g, '');
}

export function isValidPhoneNumber(phone: string) {
  const digitCount = getPhoneDigits(phone).length;
  return digitCount >= MIN_PHONE_DIGITS && digitCount <= MAX_PHONE_DIGITS;
}
