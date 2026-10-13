export interface UserEntity {
  username: string;
  displayName: string;
  authProvider: 'LOCAL' | 'OIDC' | 'LDAP';
  role: string;
  isLoggedIn: boolean;
}
