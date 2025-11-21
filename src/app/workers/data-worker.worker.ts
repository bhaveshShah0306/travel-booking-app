// src/app/workers/data-worker.worker.ts
/// <reference lib="webworker" />

import Dexie from 'dexie';
import { UpdateBookingPayload } from '../core/models/update-booking-payload.model';

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

type WorkerEventType =
  | 'BOOKING_SAVED'
  | 'BOOKING_UPDATED'
  | 'BOOKING_DELETED'
  | 'STATS_CHANGED'
  | 'SYNC_PROGRESS'
  | 'SYNC_COMPLETED';

interface WorkerMessage {
  id: string;
  type: WorkerMessageType;
  payload?: any;
}

interface WorkerResponse<T = unknown> {
  id: string;
  type: WorkerMessageType;
  success: boolean;
  data?: T;
  error?: string;
}

interface WorkerEvent {
  type: WorkerEventType;
  data: any;
  timestamp: number;
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

// ==================== EVENT BROADCASTING ====================

function broadcastEvent(type: WorkerEventType, data: any): void {
  const event: WorkerEvent = {
    type,
    data,
    timestamp: Date.now(),
  };

  postMessage({
    id: 'EVENT',
    type: 'EVENT' as any,
    success: true,
    data: event,
  });

  console.log('[Worker] 📢 Broadcast event:', type, data);
}

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

// ✅ FIXED: Respect the syncStatus passed from the component
async function saveBooking(booking: Booking): Promise<number> {
  // ✅ Set createdAt if not already set
  if (!booking.createdAt) {
    booking.createdAt = new Date();
  }

  // ✅ CRITICAL FIX: Don't override syncStatus - use what was passed
  // The component already sets it based on navigator.onLine
  // booking.syncStatus is already set by BookingComponent

  const id = await db.bookings.add(booking);

  console.log('[Worker] 💾 Booking saved:', {
    id,
    status: booking.status,
    syncStatus: booking.syncStatus,
  });

  // ✅ Broadcast event with updated stats
  const stats = await getStats();
  broadcastEvent('BOOKING_SAVED', { bookingId: id, booking, stats });

  return id;
}

async function getBookings(): Promise<Booking[]> {
  return await db.bookings.toArray();
}

async function updateBooking(
  id: number,
  updates: Partial<Booking>
): Promise<number> {
  const result = await db.bookings.update(id, updates);

  // ✅ Broadcast event
  if (result > 0) {
    const stats = await getStats();
    broadcastEvent('BOOKING_UPDATED', { bookingId: id, updates, stats });
  }

  return result;
}

async function deleteBooking(id: number): Promise<void> {
  await db.bookings.delete(id);

  // ✅ Broadcast event
  const stats = await getStats();
  broadcastEvent('BOOKING_DELETED', { bookingId: id, stats });
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

// ✅ FIXED: More detailed stats logging
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

  const stats = {
    bookings: bookingsCount,
    tickets: ticketsCount,
    pendingSync: pendingCount,
  };

  // ✅ Log detailed breakdown for debugging
  const allBookings = await db.bookings.toArray();
  const breakdown = {
    byStatus: {
      pending: allBookings.filter((b) => b.status === 'pending').length,
      confirmed: allBookings.filter((b) => b.status === 'confirmed').length,
      cancelled: allBookings.filter((b) => b.status === 'cancelled').length,
    },
    bySyncStatus: {
      pending: allBookings.filter((b) => b.syncStatus === 'pending').length,
      synced: allBookings.filter((b) => b.syncStatus === 'synced').length,
      failed: allBookings.filter((b) => b.syncStatus === 'failed').length,
    },
  };

  console.log('[Worker] 📊 Stats:', stats, 'Breakdown:', breakdown);

  return stats;
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

  console.log(`[Worker] 🔄 Syncing ${pendingBookings.length} pending bookings`);

  const results: SyncResult = {
    successful: 0,
    failed: 0,
    errors: [],
  };

  const batchSize = 5;
  for (let i = 0; i < pendingBookings.length; i += batchSize) {
    const batch = pendingBookings.slice(i, i + batchSize);

    broadcastEvent('SYNC_PROGRESS', {
      current: i,
      total: pendingBookings.length,
      percentage: Math.round((i / pendingBookings.length) * 100),
    });

    await Promise.allSettled(
      batch.map(async (booking) => {
        try {
          await simulateApiSync(booking);

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
        }
      })
    );
  }

  console.log(
    `[Worker] ✅ Sync complete: ${results.successful} successful, ${results.failed} failed`
  );

  const stats = await getStats();
  broadcastEvent('SYNC_COMPLETED', { results, stats });

  return results;
}

// ==================== BATCH OPERATIONS ====================

interface BatchUpdate {
  id: number;
  updates: Partial<Booking>;
}

async function batchUpdateBookings(updates: BatchUpdate[]): Promise<number> {
  let updateCount = 0;

  await db.transaction('rw', db.bookings, async () => {
    for (const { id, updates: data } of updates) {
      const result = await db.bookings.update(id, data);
      if (result) updateCount++;
    }
  });

  console.log(`[Worker] Batch updated ${updateCount} bookings`);

  const stats = await getStats();
  broadcastEvent('STATS_CHANGED', stats);

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

  const ticketMap = new Map(tickets.map((t) => [t.id, t]));

  const analytics: BookingAnalytics = {
    totalRevenue: 0,
    averageBookingValue: 0,
    bookingsByType: {},
    bookingsByStatus: {},
    topRoutes: [],
  };

  analytics.totalRevenue = bookings.reduce((sum, b) => sum + b.totalAmount, 0);
  analytics.averageBookingValue = bookings.length
    ? analytics.totalRevenue / bookings.length
    : 0;

  for (const booking of bookings) {
    analytics.bookingsByStatus[booking.status] =
      (analytics.bookingsByStatus[booking.status] || 0) + 1;
  }

  const routeCounts: Record<string, number> = {};

  for (const booking of bookings) {
    const ticket = ticketMap.get(booking.ticketId);
    if (ticket) {
      analytics.bookingsByType[ticket.type] =
        (analytics.bookingsByType[ticket.type] || 0) + 1;

      const route = `${ticket.from} → ${ticket.to}`;
      routeCounts[route] = (routeCounts[route] || 0) + 1;
    }
  }

  analytics.topRoutes = Object.entries(routeCounts)
    .map(([route, count]) => ({ route, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

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
