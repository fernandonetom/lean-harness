export interface Session {
  userId: string;
  token: string;
  expiresAt: Date;
}

export function createSession(userId: string): Session {
  return {
    userId,
    token: Math.random().toString(36).slice(2),
    expiresAt: new Date(Date.now() + 3600_000),
  };
}

export function isSessionValid(session: Session): boolean {
  return session.expiresAt > new Date();
}
