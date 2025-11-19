import { Booking } from './booking.model';

export interface BatchUpdate {
  id: number;
  updates: Partial<Booking>;
}
