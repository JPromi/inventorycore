import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-login-page',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './login-page.html',
  styleUrl: './login-page.scss',
})
export class LoginPage {
  protected readonly backendUrl = environment.apiUrl || 'http://localhost:8080';
  protected readonly oidcProvider = environment.oidcProvider?.trim() || '';
  protected readonly hasOidcProvider = !!this.oidcProvider;

  protected username = '';
  protected password = '';

  constructor(private readonly router: Router) {}

  protected async loginWithLocal(): Promise<void> {
    const storedUser = this.username.trim();
    if (!storedUser || !this.password.trim()) {
      window.alert('Bitte Benutzername und Passwort eingeben.');
      return;
    }

    try {
      const response = await fetch(`${this.backendUrl}/auth`, {
        method: 'POST',
        credentials: 'include',
        cache: 'no-store',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          username: storedUser,
          password: this.password,
        }),
      });

      if (!response.ok) {
        throw new Error('Invalid credentials');
      }

      const payload = await response.json();
      const authenticatedUser = payload?.username || storedUser;

      localStorage.setItem('inventorycore-user', JSON.stringify({
        username: authenticatedUser,
        authProvider: 'LOCAL',
        role: 'ADMIN',
        isLoggedIn: true,
      }));

      this.router.navigate(['/start']);
    } catch (error) {
      console.error('Login failed', error);
      window.alert('Login fehlgeschlagen. Bitte Benutzername und Passwort prüfen.');
    }
  }

  protected loginWithOidc(): void {
    if (!this.hasOidcProvider) {
      return;
    }

    window.location.href = `${this.backendUrl}/oauth2/authorization/${this.oidcProvider}`;
  }
}
