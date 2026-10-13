import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';

@Component({
  selector: 'app-start-page',
  standalone: true,
  template: `
    <section class="start-page">
      <div class="welcome-card">
        <p class="eyebrow">InventoryCore</p>
        <h1>Willkommen</h1>
        <p class="subtitle">Du bist erfolgreich angemeldet.</p>

        <div class="info-box">
          <span class="label">Benutzer</span>
          <strong>{{ user?.username || 'Gast' }}</strong>
        </div>

        <div class="info-box">
          <span class="label">Authentifizierung</span>
          <strong>{{ user?.authProvider || 'LOCAL' }}</strong>
        </div>

        <button type="button" class="logout-button" (click)="logout()">
          Abmelden
        </button>
      </div>
    </section>
  `,
  styles: [
    `:host { display: block; min-height: 100vh; background: linear-gradient(135deg, #eef6ff 0%, #f5f3ff 100%); font-family: 'Segoe UI', sans-serif; }`,
    `.start-page { min-height: 100vh; display: grid; place-items: center; padding: 2rem; }`,
    `.welcome-card { width: min(100%, 480px); background: rgba(255,255,255,.92); border: 1px solid rgba(148,163,184,.2); border-radius: 24px; box-shadow: 0 24px 60px rgba(15, 23, 42, .12); padding: 2.5rem 2rem; }`,
    `.eyebrow { margin: 0 0 0.75rem; color: #4f46e5; font-size: 0.8rem; letter-spacing: .12em; text-transform: uppercase; font-weight: 700; }`,
    `h1 { margin: 0; font-size: clamp(2.1rem, 4vw, 3rem); color: #0f172a; }`,
    `.subtitle { margin: 0.8rem 0 1.6rem; color: #475569; }`,
    `.info-box { display: flex; justify-content: space-between; align-items: center; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 0.9rem 1rem; margin-bottom: 0.75rem; }`,
    `.label { color: #64748b; font-size: 0.82rem; }`,
    `strong { color: #0f172a; }`,
    `.logout-button { width: 100%; margin-top: 1rem; border: none; border-radius: 12px; background: #0f172a; color: #fff; font-weight: 700; padding: 0.9rem 1rem; cursor: pointer; }`
  ]
})
export class StartPage implements OnInit {
  protected user: { username?: string; authProvider?: string; role?: string; isLoggedIn?: boolean } | null = null;

  constructor(private readonly router: Router) {}

  ngOnInit(): void {
    const savedUser = localStorage.getItem('inventorycore-user');
    if (!savedUser) {
      this.router.navigate(['/login']);
      return;
    }

    const parsed = JSON.parse(savedUser);
    if (!parsed?.isLoggedIn) {
      this.router.navigate(['/login']);
      return;
    }

    this.user = parsed;
  }

  protected logout(): void {
    localStorage.removeItem('inventorycore-user');
    this.router.navigate(['/login']);
  }
}
