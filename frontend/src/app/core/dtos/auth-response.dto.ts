export interface AuthResponseDto {
  authenticated: boolean;
  username: string | null;
displayName: string | null;
  role: string | null;
  message?: string | null;
}
