/// <reference lib="webworker" />

import Dexie from 'dexie';
import { UpdateBookingPayload } from 'src/app/core/models/booking-payload.model';

// ==================== TYPE DEFINITIONS ====================

interface Passenger {
  name: string;
  age: number;
  gender: 'male' | 'female' | 'other';
  seatNumber?: string;
}

interface Booking {
  id?: number;
  ticketId: string;
  passengers: Passenger[];
  totalAmount: number;
  status: 'pending' | 'confirmed' | 'cancelled';
  createdAt: Date;
  syncStatus: 'synced' | 'pending' | 'failed';
}

interface Ticket {
  id: string;
  from: string;
  to: string;
  date: Date;
  price: number;
  type: 'bus' | 'train' | 'flight';
  availableSeats: number;
}

// Worker Message Types
type WorkerMessageType =
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

interface WorkerMessage {
  id: string;
  type: WorkerMessageType;
  payload?: WorkerPayload;
}

type WorkerPayload =
  | Booking
  | Partial<Booking>
  | BatchUpdate[]
  | { from: string; to: string; date?: Date }
  | Ticket[]
  | undefined;
interface WorkerResponse<T = unknown> {
  id: string;
  type: WorkerMessageType;
  success: boolean;
  data?: T;
  error?: string;
}

// ==================== DATABASE SETUP ====================

class OfflineDatabase extends Dexie {
  bookings!: Dexie.Table<Booking, number>;
  tickets!: Dexie.Table<Ticket, string>;

  constructor() {
    super('TravelBookingDB');
    this.version(1).stores({
      bookings: '++id, ticketId, status, syncStatus, createdAt',
      tickets: 'id, from, to, date, type',
    });
  }
}

let db: OfflineDatabase;

// ==================== UTILITY FUNCTIONS ====================

function sendResponse(response: WorkerResponse): void {
  postMessage(response);
}

function sendError(id: string, type: WorkerMessageType, error: unknown): void {
  sendResponse({
    id,
    type,
    success: false,
    error: error instanceof Error ? error.message : String(error),
  });
}

// Simulate API call for sync
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function simulateApiSync(booking: Booking): Promise<void> {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      if (Math.random() < 0.95) {
        resolve();
      } else {
        reject(new Error('API sync failed'));
      }
    }, 1000);
  });
}

// ==================== DATABASE OPERATIONS ====================

async function initDatabase(): Promise<void> {
  if (!db) {
    db = new OfflineDatabase();
    await db.open();
    console.log('[Worker] Database initialized');
  }
}

async function saveBooking(booking: Booking): Promise<number> {
  booking.createdAt = new Date();
  booking.syncStatus = 'pending';
  const id = await db.bookings.add(booking);
  console.log('[Worker] Booking saved:', id);
  return id;
}

async function getBookings(): Promise<Booking[]> {
  return await db.bookings.toArray();
}

async function updateBooking(
  id: number,
  updates: Partial<Booking>
): Promise<number> {
  return await db.bookings.update(id, updates);
}

async function deleteBooking(id: number): Promise<void> {
  await db.bookings.delete(id);
}

async function searchTickets(
  from: string,
  to: string,
  date?: Date
): Promise<Ticket[]> {
  let tickets = await db.tickets
    .where('[from+to]')
    .equals([from, to])
    .toArray();

  if (date) {
    tickets = tickets.filter(
      (t) => new Date(t.date).toDateString() === date.toDateString()
    );
  }

  return tickets;
}

async function cacheTickets(tickets: Ticket[]): Promise<void> {
  await db.tickets.bulkPut(tickets);
  console.log(`[Worker] ${tickets.length} tickets cached`);
}

async function getStats(): Promise<{
  bookings: number;
  tickets: number;
  pendingSync: number;
}> {
  const bookingsCount = await db.bookings.count();
  const ticketsCount = await db.tickets.count();
  const pendingCount = await db.bookings
    .where('syncStatus')
    .equals('pending')
    .count();

  return {
    bookings: bookingsCount,
    tickets: ticketsCount,
    pendingSync: pendingCount,
  };
}

// ==================== SYNC ENGINE ====================

interface SyncResult {
  successful: number;
  failed: number;
  errors: string[];
}

async function syncPendingBookings(): Promise<SyncResult> {
  const pendingBookings = await db.bookings
    .where('syncStatus')
    .equals('pending')
    .toArray();

  console.log(`[Worker] Syncing ${pendingBookings.length} pending bookings`);

  const results: SyncResult = {
    successful: 0,
    failed: 0,
    errors: [],
  };

  // Process bookings in parallel (max 5 concurrent)
  const batchSize = 5;
  for (let i = 0; i < pendingBookings.length; i += batchSize) {
    const batch = pendingBookings.slice(i, i + batchSize);

    const _batchResults = await Promise.allSettled(
      batch.map(async (booking) => {
        try {
          await simulateApiSync(booking);

          // Update booking status
          if (booking.id) {
            await db.bookings.update(booking.id, {
              syncStatus: 'synced',
              status: 'confirmed',
            });
          }

          results.successful++;
        } catch (error) {
          if (booking.id) {
            await db.bookings.update(booking.id, {
              syncStatus: 'failed',
            });
          }

          results.failed++;
          results.errors.push(
            `Booking ${booking.id}: ${(error as Error).message}`
          );
          throw error;
        }
      })
    );
    console.log(`[Worker] Batch ${i / batchSize + 1} completed:`, {
      fulfilled: _batchResults.filter((r) => r.status === 'fulfilled').length,
      rejected: _batchResults.filter((r) => r.status === 'rejected').length,
    });
  }

  console.log(
    `[Worker] Sync complete: ${results.successful} successful, ${results.failed} failed`
  );

  return results;
}

// ==================== BATCH OPERATIONS ====================

interface BatchUpdate {
  id: number;
  updates: Partial<Booking>;
}

async function batchUpdateBookings(updates: BatchUpdate[]): Promise<number> {
  let updateCount = 0;

  // Use transaction for atomicity
  await db.transaction('rw', db.bookings, async () => {
    for (const { id, updates: data } of updates) {
      const result = await db.bookings.update(id, data);
      if (result) updateCount++;
    }
  });

  console.log(`[Worker] Batch updated ${updateCount} bookings`);
  return updateCount;
}

// ==================== ANALYTICS ====================

interface BookingAnalytics {
  totalRevenue: number;
  averageBookingValue: number;
  bookingsByType: Record<string, number>;
  bookingsByStatus: Record<string, number>;
  topRoutes: Array<{ route: string; count: number }>;
}

async function analyzeBookingData(): Promise<BookingAnalytics> {
  const bookings = await db.bookings.toArray();
  const tickets = await db.tickets.toArray();

  // Create ticket lookup map
  const ticketMap = new Map(tickets.map((t) => [t.id, t]));

  const analytics: BookingAnalytics = {
    totalRevenue: 0,
    averageBookingValue: 0,
    bookingsByType: {},
    bookingsByStatus: {},
    topRoutes: [],
  };

  // Calculate revenue
  analytics.totalRevenue = bookings.reduce((sum, b) => sum + b.totalAmount, 0);
  analytics.averageBookingValue = bookings.length
    ? analytics.totalRevenue / bookings.length
    : 0;

  // Group by status
  for (const booking of bookings) {
    analytics.bookingsByStatus[booking.status] =
      (analytics.bookingsByStatus[booking.status] || 0) + 1;
  }

  // Group by type and route
  const routeCounts: Record<string, number> = {};

  for (const booking of bookings) {
    const ticket = ticketMap.get(booking.ticketId);
    if (ticket) {
      // By type
      analytics.bookingsByType[ticket.type] =
        (analytics.bookingsByType[ticket.type] || 0) + 1;

      // By route
      const route = `${ticket.from} → ${ticket.to}`;
      routeCounts[route] = (routeCounts[route] || 0) + 1;
    }
  }

  // Get top 5 routes
  analytics.topRoutes = Object.entries(routeCounts)
    .map(([route, count]) => ({ route, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  console.log('[Worker] Analytics generated:', analytics);
  return analytics;
}

// ==================== MESSAGE HANDLER ====================

async function handleMessage(message: WorkerMessage): Promise<void> {
  const { id, type, payload } = message;

  try {
    switch (type) {
      case 'INIT_DB':
        await initDatabase();
        sendResponse({ id, type, success: true });
        break;

      case 'SAVE_BOOKING': {
        const bookingId = await saveBooking(payload as Booking);
        sendResponse({ id, type, success: true, data: bookingId });
        break;
      }

      case 'GET_BOOKINGS': {
        const bookings = await getBookings();
        sendResponse({ id, type, success: true, data: bookings });
        break;
      }

      case 'UPDATE_BOOKING': {
        const updatePayload = payload as UpdateBookingPayload;
        const updateCount = await updateBooking(
          updatePayload.bookingId,
          updatePayload.updates
        );
        sendResponse({ id, type, success: true, data: updateCount });
        break;
      }

      case 'DELETE_BOOKING':
        await deleteBooking(payload as number);
        sendResponse({ id, type, success: true });
        break;

      case 'SEARCH_TICKETS': {
        const searchPayload = payload as {
          from: string;
          to: string;
          date?: Date;
        };
        const tickets = await searchTickets(
          searchPayload.from,
          searchPayload.to,
          searchPayload.date
        );
        sendResponse({ id, type, success: true, data: tickets });
        break;
      }

      case 'CACHE_TICKETS':
        await cacheTickets(payload as Ticket[]);
        sendResponse({ id, type, success: true });
        break;

      case 'SYNC_BOOKINGS': {
        const syncResult = await syncPendingBookings();
        sendResponse({ id, type, success: true, data: syncResult });
        break;
      }

      case 'GET_STATS': {
        const stats = await getStats();
        sendResponse({ id, type, success: true, data: stats });
        break;
      }

      case 'BATCH_UPDATE': {
        const batchCount = await batchUpdateBookings(payload as BatchUpdate[]);
        sendResponse({ id, type, success: true, data: batchCount });
        break;
      }

      case 'ANALYZE_DATA': {
        const analytics = await analyzeBookingData();
        sendResponse({ id, type, success: true, data: analytics });
        break;
      }

      default:
        throw new Error(`Unknown message type: ${type}`);
    }
  } catch (error) {
    console.error('[Worker] Error handling message:', error);
    sendError(id, type, error);
  }
}

// ==================== WORKER INITIALIZATION ====================

console.log('[Worker] Data worker initialized');

addEventListener('message', ({ data }: MessageEvent<WorkerMessage>) => {
  handleMessage(data);
});
