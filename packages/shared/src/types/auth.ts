export type UserRole = 'user' | 'admin';

export interface AuthPrincipal {
  sub: string;
  roles: UserRole[];
  jti: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: 'Bearer';
}

export interface RefreshRequest {
  refreshToken: string;
}

export interface LogoutRequest {
  refreshToken: string;
}

export type AuthErrorCode =
  | 'INVALID_CREDENTIALS'
  | 'INVALID_REFRESH_TOKEN'
  | 'INVALID_ACCESS_TOKEN'
  | 'MISSING_TOKEN'
  | 'INSUFFICIENT_ROLE'
  | 'RATE_LIMITED'
  | 'INVALID_REQUEST';

export interface AuthErrorBody {
  error: {
    code: AuthErrorCode;
    message: string;
    retryAfterSeconds?: number;
  };
}
