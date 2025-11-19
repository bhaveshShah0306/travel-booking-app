import { Booking } from './booking.model';
import { Ticket } from './ticket.model';
import { BatchUpdate } from './batch-update.model';
import { UpdateBookingPayload } from './booking-payload.model';

export type WorkerPayload =
  | Booking
  | Partial<Booking>
  | BatchUpdate[]
  | UpdateBookingPayload
  | { from: string; to: string; date?: Date }
  | Ticket[]
  | null
  | number
  | string;

export type WorkerMessageType =
  | 'INIT_DB'
  | 'SAVE_BOOKING'
  | 'GET_BOOKINGS'
  | 'UPDATE_BOOKING'
  | 'DELETE_BOOKING'
  | 'SEARCH_TICKETS'
  | 'CACHE_TICKETS'
  | 'SYNC_BOOKINGS'
  | 'GET_STATS'
  | 'BATCH_UPDATE'
  | 'ANALYZE_DATA';

export interface WorkerMessage {
  id: string;
  type: WorkerMessageType;
  payload?: WorkerPayload;
}
