import { Component, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { UserEntity } from '../../entities/user.entity';
import { AuthStateService } from '../../service/auth-state.service';

@Component({
  selector: 'app-main-route',
  imports: [RouterOutlet],
  templateUrl: './main-route.html',
  styleUrl: './main-route.scss',
})
export class MainRoute implements OnInit {
  protected user: UserEntity | null = null;

  constructor(private readonly authStateService: AuthStateService) {}

  ngOnInit(): void {
    this.authStateService.currentUser$.subscribe((user) => {
      this.user = user;
    });
  }
}
