import { Component, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { UserEntity } from '../../entities/user.entity';
import { AuthStateService } from '../../service/auth-state.service';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-main-route',
  imports: [
    RouterOutlet,
    CommonModule
  ],
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
