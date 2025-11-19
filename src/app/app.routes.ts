// src/app/app.routes.ts
import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./features/home/home.component').then((m) => m.HomeComponent),
  },
  {
    path: 'search',
    loadComponent: () =>
      import('./features/search/search.component').then(
        (m) => m.SearchComponent
      ),
  },
  {
    path: 'booking/:ticketId',
    loadComponent: () =>
      import('./features/booking/booking.component').then(
        (m) => m.BookingComponent
      ),
  },
  {
    path: 'my-bookings',
    loadComponent: () =>
      import('./features/my-booking/my-booking.component').then(
        (m) => m.MyBookingComponent
      ),
  },
  {
    path: '**',
    redirectTo: '',
  },
];
