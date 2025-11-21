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

  /**
   * Get sync status from data store
   * Components should subscribe to this
   */
  getSyncStatus() {
    return this.dataStore.getSyncStatus$();
  }

  /**
   * Get pending sync count
   */
  getPendingSyncCount() {
    return this.dataStore.getPendingSyncCount$();
  }

  // ==================== AUTO-SYNC INITIALIZATION ====================

  private initAutoSync(): void {
    // Periodic sync every 5 minutes when online
    this.autoSyncSubscription = interval(300000) // 5 minutes
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
    // Sync when network comes back online
    this.networkService.isOnline$
      .pipe(filter((isOnline) => isOnline))
      .subscribe(async () => {
        console.log(
          '[SyncService] 📡 Network online - checking pending bookings'
        );

        // Update data store with network status
        this.dataStore.updateNetworkStatus(true);

        // Check for pending bookings
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

    // Update data store when offline
    this.networkService.isOnline$
      .pipe(filter((isOnline) => !isOnline))
      .subscribe(() => {
        this.dataStore.updateNetworkStatus(false);
      });
  }

  // ==================== MAIN SYNC FUNCTION ====================

  async syncPendingBookings(): Promise<boolean> {
    const currentState = this.dataStore.getCurrentState();

    // Prevent concurrent syncs
    if (currentState.sync.isSyncing) {
      console.log('[SyncService] ⏳ Sync already in progress');
      return false;
    }

    // Check if online
    if (!this.networkService.isOnline$.value) {
      console.log('[SyncService] 📴 Cannot sync - offline');
      return false;
    }

    try {
      // Update pending count first
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

      // Update sync status
      this.dataStore.updateSyncStatus({
        isSyncing: true,
        progress: 0,
      });

      // DELEGATE TO WORKER - Worker will broadcast events during sync
      const result = await this.workerManager.syncPendingBookings();

      console.log(
        `[SyncService] ✅ Sync completed: ${result.successful} successful, ${result.failed} failed`
      );

      // Final update (Worker already broadcast SYNC_COMPLETED event)
      this.dataStore.updateSyncStatus({
        isSyncing: false,
        progress: 100,
        lastSyncTime: new Date(),
      });

      return result.failed === 0;
    } catch (error) {
      console.error('[SyncService] ❌ Sync error:', error);
      this.dataStore.updateSyncStatus({
        isSyncing: false,
        progress: 0,
      });
      return false;
    }
  }

  // ==================== UPDATE PENDING COUNT ====================

  /**
   * ✅ FIXED: Now delegates to worker and updates data store
   * This is the function you mentioned in your question
   */
  async updatePendingCount(): Promise<void> {
    try {
      console.log('[SyncService] 🔄 Updating pending count from worker...');

      // ✅ Get stats from worker - this will also trigger worker to broadcast event
      const stats = await this.workerManager.getStats();

      console.log('[SyncService] 📊 Stats received from worker:', stats);

      // ✅ Update data store (worker already did this, but we ensure consistency)
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
