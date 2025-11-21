import { Booking } from './booking.model';

export interface UpdateBookingPayload {
  bookingId: number;
  updates: Partial<Booking>;
}
