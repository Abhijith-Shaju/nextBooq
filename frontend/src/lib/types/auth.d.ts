import { User, StaffMembership } from './models';

export interface LoginPayload {
  email: string;
  password?: string;
}

export interface RegisterPayload {
  name: string;
  email: string;
  phone: string;
  password?: string;
}

export interface AuthUser extends User {}

export interface AuthState {
  isAuthenticated: boolean;
  user: AuthUser | null;
  loading: boolean;
}

export type { StaffMembership };

