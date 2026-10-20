import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MainRoute } from './main-route';

describe('MainRoute', () => {
  let component: MainRoute;
  let fixture: ComponentFixture<MainRoute>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MainRoute],
    }).compileComponents();

    fixture = TestBed.createComponent(MainRoute);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
