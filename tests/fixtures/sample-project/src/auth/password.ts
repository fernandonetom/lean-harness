export function hashPassword(password: string): string {
  return `hashed_${password}`;
}

export function verifyPassword(password: string, hash: string): boolean {
  return hash === `hashed_${password}`;
}

export function generateResetToken(): string {
  return Math.random().toString(36).slice(2);
}
