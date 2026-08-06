import { User } from './models';

export interface LoginPayload {
  email: string;
  password?: string; // Optional if using magic link or OTP
}

export interface RegisterPayload {
  email: string;
  name: string;
  phone?: string;
  password?: string;
}

export interface AuthUser extends User {}

export interface AuthState {
  isAuthenticated: boolean;
  user: AuthUser | null;
  loading: boolean;
}
