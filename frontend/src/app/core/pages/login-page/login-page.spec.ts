import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { of } from 'rxjs';

import { AuthService } from '../../core/service/auth.service';
import { LoginPage } from './login-page';

describe('LoginPage', () => {
  let component: LoginPage;
  let fixture: ComponentFixture<LoginPage>;
  let router: Router;
  let authService: AuthService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LoginPage],
    }).compileComponents();

    fixture = TestBed.createComponent(LoginPage);
    component = fixture.componentInstance;
    router = TestBed.inject(Router);
    authService = TestBed.inject(AuthService);
    localStorage.clear();
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should delegate login to the auth service and navigate after a successful login', () => {
    const navigateSpy = spyOn(router, 'navigate');
    const loginSpy = spyOn(authService, 'login').and.returnValue(of({
      username: 'admin',
      authProvider: 'LOCAL',
      role: 'ADMIN',
      isLoggedIn: true,
    }));

    component.username = 'admin';
    component.password = 'admin123';

    component.loginWithLocal();

    expect(loginSpy).toHaveBeenCalledWith('admin', 'admin123');
    expect(navigateSpy).toHaveBeenCalledWith(['/start']);
  });
});
