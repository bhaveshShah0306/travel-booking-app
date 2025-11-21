// src/app/core/services/worker-manager.service.ts
// ✅ FIXED: Added NgZone integration for proper change detection

import { Injectable, OnDestroy, NgZone } from '@angular/core';
import { Observable, Subject, firstValueFrom } from 'rxjs';
import { filter, map, timeout } from 'rxjs/operators';
import { Booking } from '../models/booking.model';
import { Ticket } from '../models/ticket.model';
import {
  WorkerMessage,
  WorkerMessageType,
  WorkerPayload,
} from '../models/worker-message.model';
import { BatchUpdate } from '../models/batch-update.model';
import { WorkerResponse } from '../models/worker-response.model';
import { DataStoreService, WorkerEvent } from './data-store.service';

interface SyncResult {
  successful: number;
  failed: number;
  errors: string[];
}

interface BookingAnalytics {
  totalRevenue: number;
  averageBookingValue: number;
  bookingsByType: Record<string, number>;
  bookingsByStatus: Record<string, number>;
  topRoutes: Array<{ route: string; count: number }>;
}

@Injectable({
  providedIn: 'root',
})
export class WorkerManagerService implements OnDestroy {
  private worker: Worker | null = null;
  private responseSubject = new Subject<WorkerResponse>();
  private messageCounter = 0;
  private readonly DEFAULT_TIMEOUT = 30000;

  constructor(
    private dataStore: DataStoreService,
    private ngZone: NgZone // ✅ ADDED: NgZone for change detection
  ) {
    this.initializeWorker();
  }

  // ==================== INITIALIZATION ====================

  private initializeWorker(): void {
    if (typeof Worker !== 'undefined') {
      try {
        this.worker = new Worker(
          new URL('../../workers/data-worker.worker', import.meta.url),
          { type: 'module' }
        );

        // ✅ CRITICAL FIX: Wrap worker message handling in NgZone
        this.worker.onmessage = ({ data }: MessageEvent<WorkerResponse>) => {
          this.ngZone.run(() => {
            // Check if it's an event broadcast
            if (data.id === 'EVENT' && data.type === ('EVENT' as any)) {
              const event = data.data as WorkerEvent;
              console.log('[WorkerManager] 📢 Worker event (in zone):', event);
              this.dataStore.handleWorkerEvent(event);
              return;
            }

            // Regular response
            console.log('[WorkerManager] Response (in zone):', data);
            this.responseSubject.next(data);
          });
        };

        this.worker.onerror = (error) => {
          this.ngZone.run(() => {
            console.error('[WorkerManager] Worker error:', error);
          });
        };

        // Initialize database in worker
        this.sendMessage('INIT_DB').catch((err) =>
          console.error('Failed to init worker DB:', err)
        );

        console.log('✅ Web Worker initialized with NgZone integration');
      } catch (error) {
        console.error('❌ Failed to initialize Web Worker:', error);
      }
    } else {
      console.warn('⚠️ Web Workers are not supported');
    }
  }

  // ==================== CORE MESSAGING ====================

  private generateMessageId(): string {
    return `msg_${Date.now()}_${++this.messageCounter}`;
  }

  private sendMessage<T>(
    type: WorkerMessageType,
    payload?: WorkerPayload,
    timeoutMs: number = this.DEFAULT_TIMEOUT
  ): Promise<T> {
    if (!this.worker) {
      return Promise.reject(new Error('Worker not available'));
    }

    const id = this.generateMessageId();
    const message: WorkerMessage = { id, type, payload };

    console.log('[WorkerManager] Sending message:', message);
    this.worker.postMessage(message);

    return firstValueFrom(
      this.responseSubject.pipe(
        filter((response) => response.id === id),
        timeout(timeoutMs),
        map((response) => {
          if (!response.success) {
            throw new Error(response.error || 'Worker operation failed');
          }
          return response.data as T;
        })
      )
    );
  }

  // ==================== BOOKING OPERATIONS ====================

  async saveBooking(booking: Booking): Promise<number> {
    return this.sendMessage<number>('SAVE_BOOKING', booking);
  }

  async getAllBookings(): Promise<Booking[]> {
    return this.sendMessage<Booking[]>('GET_BOOKINGS');
  }

  async updateBooking(
    bookingId: number,
    updates: Partial<Booking>
  ): Promise<number> {
    return this.sendMessage<number>('UPDATE_BOOKING', {
      bookingId,
      updates,
    });
  }

  async deleteBooking(bookingId: number): Promise<void> {
    return this.sendMessage<void>('DELETE_BOOKING', bookingId);
  }

  async batchUpdateBookings(updates: BatchUpdate[]): Promise<number> {
    return this.sendMessage<number>('BATCH_UPDATE', updates);
  }

  // ==================== TICKET OPERATIONS ====================

  async searchTickets(
    from: string,
    to: string,
    date?: Date
  ): Promise<Ticket[]> {
    return this.sendMessage<Ticket[]>('SEARCH_TICKETS', { from, to, date });
  }

  async cacheTickets(tickets: Ticket[]): Promise<void> {
    return this.sendMessage<void>('CACHE_TICKETS', tickets);
  }

  // ==================== SYNC OPERATIONS ====================

  async syncPendingBookings(): Promise<SyncResult> {
    return this.sendMessage<SyncResult>('SYNC_BOOKINGS', null, 60000);
  }

  // ==================== ANALYTICS ====================

  async getStats(): Promise<{
    bookings: number;
    tickets: number;
    pendingSync: number;
  }> {
    const stats = await this.sendMessage<{
      bookings: number;
      tickets: number;
      pendingSync: number;
    }>('GET_STATS');

    // Update data store with latest stats
    this.dataStore.updateBookingStats({
      total: stats.bookings,
      needsSync: stats.pendingSync,
    });

    return stats;
  }

  async analyzeData(): Promise<BookingAnalytics> {
    return this.sendMessage<BookingAnalytics>('ANALYZE_DATA');
  }

  // ==================== UTILITY ====================

  isWorkerAvailable(): boolean {
    return this.worker !== null;
  }

  terminateWorker(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
      console.log('🛑 Worker terminated');
    }
  }

  // ==================== OBSERVABLE STREAMS ====================

  getResponseStream(): Observable<WorkerResponse> {
    return this.responseSubject.asObservable();
  }

  getSyncStream(): Observable<WorkerResponse> {
    return this.responseSubject.pipe(
      filter((response) => response.type === 'SYNC_BOOKINGS')
    );
  }

  // ==================== CLEANUP ====================

  ngOnDestroy(): void {
    this.terminateWorker();
    this.responseSubject.complete();
  }
}
