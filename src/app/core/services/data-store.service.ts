// src/app/core/services/data-store.service.ts
import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject, Observable, Subject } from 'rxjs';
import { distinctUntilChanged, map } from 'rxjs/operators';

/**
 * Lightweight reactive data store for application state
 * Listens to Worker events and provides observables for components
 */

export interface AppState {
  bookings: {
    total: number;
    pending: number;
    confirmed: number;
    cancelled: number;
    needsSync: number;
  };
  sync: {
    isSyncing: boolean;
    progress: number;
    lastSyncTime: Date | null;
  };
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
    progress: 0,
    lastSyncTime: null,
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

  // Full state
  getState$(): Observable<AppState> {
    return this.state$.asObservable();
  }

  // Booking stats
  getBookingStats$(): Observable<AppState['bookings']> {
    return this.state$.pipe(
      map((state) => state.bookings),
      distinctUntilChanged(
        (prev, curr) => JSON.stringify(prev) === JSON.stringify(curr)
      )
    );
  }

  // Sync status
  getSyncStatus$(): Observable<AppState['sync']> {
    return this.state$.pipe(
      map((state) => state.sync),
      distinctUntilChanged(
        (prev, curr) => JSON.stringify(prev) === JSON.stringify(curr)
      )
    );
  }

  // Network status
  getNetworkStatus$(): Observable<boolean> {
    return this.state$.pipe(
      map((state) => state.network.isOnline),
      distinctUntilChanged()
    );
  }

  // Pending sync count
  getPendingSyncCount$(): Observable<number> {
    return this.state$.pipe(
      map((state) => state.bookings.needsSync),
      distinctUntilChanged()
    );
  }

  // Worker events stream
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
  }

  updateSyncStatus(sync: Partial<AppState['sync']>): void {
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
        this.updateSyncStatus({
          isSyncing: true,
          progress: event.data.percentage || 0,
        });
        break;

      case 'SYNC_COMPLETED':
        this.updateSyncStatus({
          isSyncing: false,
          progress: 100,
          lastSyncTime: new Date(),
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

// ========== TYPES ==========

export interface WorkerEvent {
  type:
    | 'BOOKING_SAVED'
    | 'BOOKING_UPDATED'
    | 'BOOKING_DELETED'
    | 'STATS_CHANGED'
    | 'SYNC_PROGRESS'
    | 'SYNC_COMPLETED';
  data: any;
  timestamp: number;
}
