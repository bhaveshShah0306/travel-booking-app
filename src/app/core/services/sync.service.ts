// src/app/core/services/sync.service.ts
import { Injectable } from '@angular/core';
import { interval, Subscription } from 'rxjs';
import { filter } from 'rxjs/operators';
import { NetworkService } from './network.service';
import { WorkerManagerService } from './worker-manager.service';
import { DataStoreService } from './data-store.service';

@Injectable({
  providedIn: 'root',
})
export class SyncService {
  private autoSyncSubscription?: Subscription;

  constructor(
    private workerManager: WorkerManagerService,
    private networkService: NetworkService,
    private dataStore: DataStoreService
  ) {
    this.initAutoSync();
    this.monitorNetworkChanges();
  }

  // ==================== OBSERVABLES ====================

  getSyncStatus() {
    return this.dataStore.getSyncStatus$();
  }

  getPendingSyncCount() {
    return this.dataStore.getPendingSyncCount$();
  }

  // ==================== AUTO-SYNC INITIALIZATION ====================

  private initAutoSync(): void {
    this.autoSyncSubscription = interval(300000)
      .pipe(filter(() => this.networkService.isOnline$.value))
      .subscribe(async () => {
        console.log('[SyncService] 🔄 Periodic sync triggered');
        await this.updatePendingCount();

        const pendingCount =
          this.dataStore.getCurrentState().bookings.needsSync;
        if (pendingCount > 0) {
          this.syncPendingBookings();
        }
      });
  }

  private monitorNetworkChanges(): void {
    this.networkService.isOnline$
      .pipe(filter((isOnline) => isOnline))
      .subscribe(async () => {
        console.log(
          '[SyncService] 📡 Network online - checking pending bookings'
        );

        this.dataStore.updateNetworkStatus(true);
        await this.updatePendingCount();

        const pendingCount =
          this.dataStore.getCurrentState().bookings.needsSync;
        if (pendingCount > 0) {
          console.log(
            `[SyncService] 🔄 Auto-syncing ${pendingCount} pending bookings`
          );
          this.syncPendingBookings();
        }
      });

    this.networkService.isOnline$
      .pipe(filter((isOnline) => !isOnline))
      .subscribe(() => {
        this.dataStore.updateNetworkStatus(false);
      });
  }

  // ==================== MAIN SYNC FUNCTION ====================

  async syncPendingBookings(): Promise<boolean> {
    const currentState = this.dataStore.getCurrentState();

    if (currentState.sync.isSyncing) {
      console.log('[SyncService] ⏳ Sync already in progress');
      return false;
    }

    if (!this.networkService.isOnline$.value) {
      console.log('[SyncService] 📴 Cannot sync - offline');
      return false;
    }

    try {
      await this.updatePendingCount();
      const updatedState = this.dataStore.getCurrentState();

      if (updatedState.bookings.needsSync === 0) {
        console.log('[SyncService] ✅ No pending bookings to sync');
        return true;
      }

      console.log(
        '[SyncService] 🔄 Starting sync for',
        updatedState.bookings.needsSync,
        'bookings'
      );

      // ✅ FIXED: Only set isSyncing, no progress
      this.dataStore.updateSyncStatus({
        isSyncing: true,
      });

      const result = await this.workerManager.syncPendingBookings();

      console.log(
        `[SyncService] ✅ Sync completed: ${result.successful} successful, ${result.failed} failed`
      );

      // ✅ FIXED: No progress property
      this.dataStore.updateSyncStatus({
        isSyncing: false,
        lastSyncTime: new Date(),
      });

      return result.failed === 0;
    } catch (error) {
      console.error('[SyncService] ❌ Sync error:', error);
      // ✅ FIXED: No progress property
      this.dataStore.updateSyncStatus({
        isSyncing: false,
      });
      return false;
    }
  }

  // ==================== UPDATE PENDING COUNT ====================

  async updatePendingCount(): Promise<void> {
    try {
      console.log('[SyncService] 🔄 Updating pending count from worker...');

      const stats = await this.workerManager.getStats();

      console.log('[SyncService] 📊 Stats received from worker:', stats);

      this.dataStore.updateBookingStats({
        total: stats.bookings,
        needsSync: stats.pendingSync,
      });

      console.log('[SyncService] ✅ Pending count updated:', stats.pendingSync);
    } catch (error) {
      console.error('[SyncService] ❌ Failed to update pending count:', error);
    }
  }

  // ==================== FORCE SYNC ====================

  async forceSyncBooking(bookingId: string): Promise<boolean> {
    if (!this.networkService.isOnline$.value) {
      console.log('[SyncService] 📴 Cannot sync - offline');
      return false;
    }

    try {
      console.log('[SyncService] 🔄 Force syncing booking:', bookingId);
      await this.syncPendingBookings();
      await this.updatePendingCount();
      return true;
    } catch (error) {
      console.error(
        `[SyncService] ❌ Failed to force sync booking ${bookingId}:`,
        error
      );
      return false;
    }
  }

  // ==================== RETRY FAILED SYNCS ====================

  async retryFailedSyncs(): Promise<boolean> {
    if (!this.networkService.isOnline$.value) {
      return false;
    }

    try {
      console.log('[SyncService] 🔄 Retrying failed syncs');
      await this.updatePendingCount();

      const state = this.dataStore.getCurrentState();
      if (state.bookings.needsSync === 0) {
        console.log('[SyncService] ✅ No pending syncs to retry');
        return true;
      }

      return this.syncPendingBookings();
    } catch (error) {
      console.error('[SyncService] ❌ Failed to retry syncs:', error);
      return false;
    }
  }

  // ==================== BACKGROUND SYNC ====================

  startBackgroundSync(intervalMinutes = 5): void {
    if (this.autoSyncSubscription) {
      this.autoSyncSubscription.unsubscribe();
    }

    this.autoSyncSubscription = interval(intervalMinutes * 60000)
      .pipe(filter(() => this.networkService.isOnline$.value))
      .subscribe(async () => {
        console.log('[SyncService] 🔄 Background sync triggered');
        await this.updatePendingCount();

        const state = this.dataStore.getCurrentState();
        if (state.bookings.needsSync > 0) {
          this.syncPendingBookings();
        }
      });

    console.log(
      `[SyncService] ✅ Background sync started (every ${intervalMinutes} minutes)`
    );
  }

  stopBackgroundSync(): void {
    if (this.autoSyncSubscription) {
      this.autoSyncSubscription.unsubscribe();
      console.log('[SyncService] 🛑 Background sync stopped');
    }
  }

  // ==================== CLEANUP ====================

  destroy(): void {
    if (this.autoSyncSubscription) {
      this.autoSyncSubscription.unsubscribe();
    }
  }
}
