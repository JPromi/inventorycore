import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';

import { LoginPage } from './login-page';

describe('LoginPage', () => {
  let component: LoginPage;
  let fixture: ComponentFixture<LoginPage>;
  let router: Router;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LoginPage],
    }).compileComponents();

    fixture = TestBed.createComponent(LoginPage);
    component = fixture.componentInstance;
    router = TestBed.inject(Router);
    localStorage.clear();
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should submit credentials to the backend and navigate to start after a successful login', async () => {
    const navigateSpy = spyOn(router, 'navigate');
    spyOn(window, 'fetch').and.resolveTo(new Response(JSON.stringify({
      authenticated: true,
      username: 'admin',
      roles: ['ROLE_ADMIN']
    }), {
      status: 200,
      statusText: 'OK',
      headers: { 'Content-Type': 'application/json' }
    }));

    component.username = 'admin';
    component.password = 'admin123';

    await component.loginWithLocal();

    expect(window.fetch).toHaveBeenCalledWith(
      'http://localhost:8080/api/auth',
      jasmine.objectContaining({
        method: 'POST',
        credentials: 'include',
        headers: jasmine.objectContaining({
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify({
          username: 'admin',
          password: 'admin123',
        }),
      })
    );
    expect(localStorage.getItem('inventorycore-user')).toContain('"username":"admin"');
    expect(navigateSpy).toHaveBeenCalledWith(['/start']);
  });
});
