import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

import { AuthService } from '../../service/auth.service';

@Component({
  selector: 'app-login-page',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './login-page.html',
  styleUrl: './login-page.scss',
})
export class LoginPage implements OnInit {
  protected username = '';
  protected password = '';

  constructor(
    private readonly router: Router,
    private readonly authService: AuthService,
  ) {}

  ngOnInit(): void {
    if (this.authService.getCurrentUser()) {
      this.router.navigate(['/']);
    }
  }

  protected loginWithLocal(): void {
    const storedUser = this.username.trim();
    if (!storedUser || !this.password.trim()) {
      window.alert('Bitte Benutzername und Passwort eingeben.');
      return;
    }

    this.authService.login(storedUser, this.password).subscribe({
      next: () => this.router.navigate(['/']),
      error: (error) => {
        console.error('Login failed', error);
        window.alert('Login fehlgeschlagen. Bitte Benutzername und Passwort prüfen.');
      },
    });
  }
}
