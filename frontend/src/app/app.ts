import { Component, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { AuthService } from './core/service/auth.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
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
