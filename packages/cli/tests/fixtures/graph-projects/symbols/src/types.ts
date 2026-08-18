export interface UserService {
  getUser(id: string): Promise<User>;
}

export class UserServiceImpl implements UserService {
  async getUser(id: string): Promise<User> {
    return { id, name: "Test" };
  }
}

export function createUserService(): UserService {
  return new UserServiceImpl();
}

export const DEFAULT_USER = { id: "0", name: "Default" };

export type User = {
  id: string;
  name: string;
};

export enum UserRole {
  ADMIN = "admin",
  USER = "user",
}
