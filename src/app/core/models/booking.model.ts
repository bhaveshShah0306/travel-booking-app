// src/app/core/models/booking.model.ts
import { Passenger } from './passenger.model';

export interface Booking {
  id?: number;
  ticketId: string;
  passengers: Passenger[];
  totalAmount: number;
  status: 'pending' | 'confirmed' | 'cancelled';
  createdAt: Date;
  syncStatus: 'synced' | 'pending' | 'failed';
}
