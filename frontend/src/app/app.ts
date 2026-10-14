import { Component, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { PwaStatus } from './core/components/pwa-status/pwa-status';
import { AuthService } from './core/service/auth.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, PwaStatus],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App implements OnInit {
  protected readonly title = 'inventorycore';

  constructor(private readonly authService: AuthService) {}

  ngOnInit(): void {
    this.authService.initializeSession().subscribe();
  }
}
