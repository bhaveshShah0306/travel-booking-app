export interface Ticket {
  id: string;
  from: string;
  to: string;
  date: Date;
  price: number;
  type: 'bus' | 'train' | 'flight';
  availableSeats: number;
}
