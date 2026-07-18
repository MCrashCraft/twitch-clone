export const MIN_AGE = 21;

/** Parse a yyyy-mm-dd string from an <input type="date">; null if invalid. */
export function parseBirthDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  const now = new Date();
  if (date > now) return null;
  if (now.getUTCFullYear() - date.getUTCFullYear() > 120) return null;
  return date;
}

export function ageInYears(birthDate: Date, at: Date = new Date()): number {
  let age = at.getUTCFullYear() - birthDate.getUTCFullYear();
  const monthDiff = at.getUTCMonth() - birthDate.getUTCMonth();
  if (
    monthDiff < 0 ||
    (monthDiff === 0 && at.getUTCDate() < birthDate.getUTCDate())
  ) {
    age -= 1;
  }
  return age;
}

export function isOfAge(birthDate: Date): boolean {
  return ageInYears(birthDate) >= MIN_AGE;
}
