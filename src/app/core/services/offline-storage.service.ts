// src/app/core/services/offline-storage.service.ts
import Dexie from 'dexie';
import { Booking } from '../models/booking.model';
import { Ticket } from '../models/ticket.model';
import { Injectable } from '@angular/core';

export class OfflineDatabase extends Dexie {
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

@Injectable({ providedIn: 'root' })
export class OfflineStorageService {
  private db = new OfflineDatabase();

  constructor() {
    this.initializeDB();
  }

  private async initializeDB(): Promise<void> {
    try {
      await this.db.open();
      console.log('✅ IndexedDB initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize IndexedDB:', error);
    }
  }

  // ========== BOOKING METHODS ==========

  async saveBooking(booking: Booking): Promise<number> {
    try {
      booking.createdAt = new Date();
      booking.syncStatus = navigator.onLine ? 'synced' : 'pending';
      const id = await this.db.bookings.add(booking);
      console.log('💾 Booking saved with ID:', id);
      return id;
    } catch (error) {
      console.error('❌ Failed to save booking:', error);
      throw error;
    }
  }

  async getAllBookings(): Promise<Booking[]> {
    try {
      return await this.db.bookings.toArray();
    } catch (error) {
      console.error('❌ Failed to get bookings:', error);
      return [];
    }
  }

  async getBookingById(id: string | number): Promise<Booking | undefined> {
    try {
      const numericId = typeof id === 'string' ? parseInt(id, 10) : id;
      return await this.db.bookings.get(numericId);
    } catch (error) {
      console.error('❌ Failed to get booking:', error);
      return undefined;
    }
  }

  async getPendingBookings(): Promise<Booking[]> {
    try {
      return await this.db.bookings
        .where('syncStatus')
        .equals('pending')
        .toArray();
    } catch (error) {
      console.error('❌ Failed to get pending bookings:', error);
      return [];
    }
  }

  // Update entire booking with partial updates
  async updateBooking(
    id: string | number,
    updates: Partial<Booking>
  ): Promise<number> {
    try {
      const numericId = typeof id === 'string' ? parseInt(id, 10) : id;

      const result = await this.db.bookings.update(numericId, updates);

      if (result === 0) {
        console.warn(`⚠️ Booking ${id} not found for update`);
      } else {
        console.log(`✅ Booking ${id} updated:`, updates);
      }

      return result;
    } catch (error) {
      console.error('❌ Failed to update booking:', error);
      throw error;
    }
  }

  async updateBookingSyncStatus(
    id: string | number,
    status: 'synced' | 'pending' | 'failed'
  ): Promise<void> {
    try {
      const numericId = typeof id === 'string' ? parseInt(id, 10) : id;

      const result = await this.db.bookings.update(numericId, {
        syncStatus: status,
      });

      if (result === 0) {
        console.warn(`⚠️ Booking ${id} not found for sync status update`);
      } else {
        console.log(`✅ Booking ${id} sync status updated to ${status}`);
      }
    } catch (error) {
      console.error('❌ Failed to update booking sync status:', error);
    }
  }

  // Update booking status
  async updateBookingStatus(
    id: string | number,
    status: 'pending' | 'confirmed' | 'cancelled'
  ): Promise<void> {
    try {
      const numericId = typeof id === 'string' ? parseInt(id, 10) : id;
      await this.db.bookings.update(numericId, { status });
      console.log(`✅ Booking ${id} status updated to ${status}`);
    } catch (error) {
      console.error('❌ Failed to update booking status:', error);
      throw error;
    }
  }

  async deleteBooking(id: string | number): Promise<void> {
    try {
      const numericId = typeof id === 'string' ? parseInt(id, 10) : id;
      await this.db.bookings.delete(numericId);
      console.log(`🗑️ Booking ${id} deleted`);
    } catch (error) {
      console.error('❌ Failed to delete booking:', error);
    }
  }

  // ========== TICKET METHODS ==========

  async cacheTickets(tickets: Ticket[]): Promise<void> {
    try {
      await this.db.tickets.bulkPut(tickets);
      console.log(`💾 ${tickets.length} tickets cached`);
    } catch (error) {
      console.error('❌ Failed to cache tickets:', error);
    }
  }

  async getCachedTickets(): Promise<Ticket[]> {
    try {
      return await this.db.tickets.toArray();
    } catch (error) {
      console.error('❌ Failed to get cached tickets:', error);
      return [];
    }
  }

  async searchTickets(
    from: string,
    to: string,
    date?: Date
  ): Promise<Ticket[]> {
    try {
      const query = this.db.tickets.where('[from+to]').equals([from, to]);

      if (date) {
        const tickets = await query.toArray();
        return tickets.filter(
          (t) => new Date(t.date).toDateString() === date.toDateString()
        );
      }

      return await query.toArray();
    } catch (error) {
      console.error('❌ Failed to search tickets:', error);
      return [];
    }
  }

  async getTicketById(id: string): Promise<Ticket | undefined> {
    try {
      return await this.db.tickets.get(id);
    } catch (error) {
      console.error('❌ Failed to get ticket:', error);
      return undefined;
    }
  }

  // ========== UTILITY METHODS ==========

  async clearAllData(): Promise<void> {
    try {
      await this.db.bookings.clear();
      await this.db.tickets.clear();
      console.log('🗑️ All data cleared');
    } catch (error) {
      console.error('❌ Failed to clear data:', error);
    }
  }

  async getStorageStats(): Promise<{
    bookings: number;
    tickets: number;
    pendingSync: number;
  }> {
    try {
      const bookingsCount = await this.db.bookings.count();
      const ticketsCount = await this.db.tickets.count();
      const pendingCount = await this.db.bookings
        .where('syncStatus')
        .equals('pending')
        .count();

      return {
        bookings: bookingsCount,
        tickets: ticketsCount,
        pendingSync: pendingCount,
      };
    } catch (error) {
      console.error('❌ Failed to get storage stats:', error);
      return { bookings: 0, tickets: 0, pendingSync: 0 };
    }
  }
}
