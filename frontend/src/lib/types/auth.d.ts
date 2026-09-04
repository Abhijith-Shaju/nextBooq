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
  // Required by the API: an account cannot be created without an
  // explicit assertion that the Terms were accepted.
  accept_terms: boolean;
}

export interface AuthUser extends User {}

export interface AuthState {
  isAuthenticated: boolean;
  user: AuthUser | null;
  loading: boolean;
}

export type { StaffMembership };

