// src/app/core/services/data-store.service.ts
import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject, Observable, Subject } from 'rxjs';
import { distinctUntilChanged, map } from 'rxjs/operators';
import { SyncStatus } from '../models/syncstatus.model';
import { WorkerEvent } from '../models/worker-event.model';
/**
 * ✅ CORRECTED: Removed invalid 'progress' property
 * Lightweight reactive data store for application state
 */

export interface AppState {
  bookings: {
    total: number;
    pending: number;
    confirmed: number;
    cancelled: number;
    needsSync: number;
  };
  sync: SyncStatus; // Uses the actual SyncStatus interface
  network: {
    isOnline: boolean;
  };
}

const initialState: AppState = {
  bookings: {
    total: 0,
    pending: 0,
    confirmed: 0,
    cancelled: 0,
    needsSync: 0,
  },
  sync: {
    isSyncing: false,
    lastSyncTime: null,
    pendingCount: 0,
    failedCount: 0,
    syncErrors: [],
  },
  network: {
    isOnline: navigator.onLine,
  },
};

@Injectable({
  providedIn: 'root',
})
export class DataStoreService implements OnDestroy {
  // ========== STATE ==========
  private state$ = new BehaviorSubject<AppState>(initialState);

  // ========== EVENTS ==========
  private events$ = new Subject<WorkerEvent>();

  // ========== PUBLIC OBSERVABLES ==========

  getState$(): Observable<AppState> {
    return this.state$.asObservable();
  }

  getBookingStats$(): Observable<AppState['bookings']> {
    return this.state$.pipe(
      map((state) => state.bookings),
      distinctUntilChanged(
        (prev, curr) => JSON.stringify(prev) === JSON.stringify(curr)
      )
    );
  }

  getSyncStatus$(): Observable<SyncStatus> {
    return this.state$.pipe(
      map((state) => state.sync),
      distinctUntilChanged(
        (prev, curr) => JSON.stringify(prev) === JSON.stringify(curr)
      )
    );
  }

  getNetworkStatus$(): Observable<boolean> {
    return this.state$.pipe(
      map((state) => state.network.isOnline),
      distinctUntilChanged()
    );
  }

  getPendingSyncCount$(): Observable<number> {
    return this.state$.pipe(
      map((state) => state.bookings.needsSync),
      distinctUntilChanged()
    );
  }

  getEvents$(): Observable<WorkerEvent> {
    return this.events$.asObservable();
  }

  // ========== STATE UPDATES ==========

  updateBookingStats(stats: Partial<AppState['bookings']>): void {
    const currentState = this.state$.value;
    this.state$.next({
      ...currentState,
      bookings: { ...currentState.bookings, ...stats },
    });
    console.log('[DataStore] 📊 Booking stats updated:', stats);

    // Update sync.pendingCount when needsSync changes
    if (stats.needsSync !== undefined) {
      this.updateSyncStatus({ pendingCount: stats.needsSync });
    }
  }

  updateSyncStatus(sync: Partial<SyncStatus>): void {
    const currentState = this.state$.value;
    this.state$.next({
      ...currentState,
      sync: { ...currentState.sync, ...sync },
    });
    console.log('[DataStore] 🔄 Sync status updated:', sync);
  }

  updateNetworkStatus(isOnline: boolean): void {
    const currentState = this.state$.value;
    this.state$.next({
      ...currentState,
      network: { isOnline },
    });
    console.log('[DataStore] 📡 Network status updated:', isOnline);
  }

  // ========== EVENT HANDLING ==========

  handleWorkerEvent(event: WorkerEvent): void {
    console.log('[DataStore] 📢 Received worker event:', event);

    this.events$.next(event);

    switch (event.type) {
      case 'BOOKING_SAVED':
      case 'BOOKING_UPDATED':
      case 'BOOKING_DELETED':
      case 'STATS_CHANGED':
        if (event.data.stats) {
          this.updateBookingStats({
            total: event.data.stats.bookings,
            needsSync: event.data.stats.pendingSync,
          });
        }
        break;

      case 'SYNC_PROGRESS':
        // ✅ FIXED: Only update isSyncing, no progress property
        this.updateSyncStatus({
          isSyncing: true,
        });
        break;

      case 'SYNC_COMPLETED':
        this.updateSyncStatus({
          isSyncing: false,
          lastSyncTime: new Date(),
          failedCount: event.data.results?.failed || 0,
          syncErrors: event.data.results?.errors || [],
        });
        if (event.data.stats) {
          this.updateBookingStats({
            total: event.data.stats.bookings,
            needsSync: event.data.stats.pendingSync,
          });
        }
        break;
    }
  }

  // ========== CLEANUP ==========

  ngOnDestroy(): void {
    this.state$.complete();
    this.events$.complete();
  }

  // ========== HELPERS ==========

  getCurrentState(): AppState {
    return this.state$.value;
  }

  resetState(): void {
    this.state$.next(initialState);
    console.log('[DataStore] 🔄 State reset to initial');
  }
}
