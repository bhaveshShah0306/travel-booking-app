// src/app/core/services/sync.service.ts
import { Injectable } from '@angular/core';
import { BehaviorSubject, interval, Subscription } from 'rxjs';
import { filter } from 'rxjs/operators';
import { NetworkService } from './network.service';
import { WorkerManagerService } from './worker-manager.service';
import { SyncStatus } from '../models/syncstatus.model';
import { SyncResponseData } from '../models/sync-reponse-data.model';

@Injectable({
  providedIn: 'root',
})
export class SyncService {
  private syncStatus$ = new BehaviorSubject<SyncStatus>({
    isSyncing: false,
    lastSyncTime: null,
    pendingCount: 0,
    failedCount: 0,
    syncErrors: [],
  });

  private autoSyncSubscription?: Subscription;
  private workerSyncSubscription?: Subscription;

  constructor(
    private workerManager: WorkerManagerService,
    private networkService: NetworkService
  ) {
    this.initAutoSync();
    this.monitorWorkerSync();
  }

  // ==================== OBSERVABLE ====================

  getSyncStatus() {
    return this.syncStatus$.asObservable();
  }

  // ==================== AUTO-SYNC INITIALIZATION ====================

  private initAutoSync(): void {
    // Sync when network status changes to online
    this.networkService.isOnline$
      .pipe(filter((isOnline) => isOnline))
      .subscribe(async () => {
        console.log(
          '[SyncService] 📡 Network online - checking for pending bookings'
        );
        await this.updatePendingCount();

        const currentStatus = this.syncStatus$.value;
        if (currentStatus.pendingCount > 0) {
          console.log(
            '[SyncService] 🔄 Auto-syncing',
            currentStatus.pendingCount,
            'pending bookings'
          );
          this.syncPendingBookings();
        }
      });

    // Periodic sync every 5 minutes when online
    this.autoSyncSubscription = interval(300000) // 5 minutes
      .pipe(filter(() => this.networkService.isOnline$.value))
      .subscribe(async () => {
        console.log('[SyncService] 🔄 Periodic sync triggered');
        await this.updatePendingCount();

        const currentStatus = this.syncStatus$.value;
        if (currentStatus.pendingCount > 0) {
          this.syncPendingBookings();
        }
      });
  }

  // Monitor worker sync responses
  private monitorWorkerSync(): void {
    this.workerSyncSubscription = this.workerManager
      .getSyncStream()
      .subscribe((response) => {
        console.log('[SyncService] Worker sync response:', response);

        if (response.success && response.data) {
          const data = response.data as SyncResponseData;
          const { successful, failed, errors } = data;
          console.log(
            `[SyncService] ✅ Worker sync completed: ${successful} successful, ${failed} failed`
          );

          this.updateSyncStatus({
            isSyncing: false,
            lastSyncTime: new Date(),
            pendingCount: failed,
            failedCount: failed,
            syncErrors: errors,
          });
        } else {
          console.error('[SyncService] ❌ Worker sync failed:', response.error);
          this.updateSyncStatus({
            isSyncing: false,
            syncErrors: [response.error || 'Unknown error'],
          });
        }
      });
  }

  // ==================== MAIN SYNC FUNCTION (USING WORKER) ====================

  async syncPendingBookings(): Promise<boolean> {
    const currentStatus = this.syncStatus$.value;

    // Prevent concurrent syncs
    if (currentStatus.isSyncing) {
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
      const updatedStatus = this.syncStatus$.value;

      if (updatedStatus.pendingCount === 0) {
        console.log('[SyncService] ✅ No pending bookings to sync');
        return true;
      }

      console.log(
        '[SyncService] 🔄 Starting sync for',
        updatedStatus.pendingCount,
        'bookings'
      );

      // Update status: syncing started
      this.updateSyncStatus({
        isSyncing: true,
        syncErrors: [],
        pendingCount: updatedStatus.pendingCount,
      });

      // DELEGATE TO WORKER - This runs on a separate thread!
      const result = await this.workerManager.syncPendingBookings();

      console.log(
        `[SyncService] ✅ Sync completed: ${result.successful} successful, ${result.failed} failed`
      );

      // Update final status
      this.updateSyncStatus({
        isSyncing: false,
        lastSyncTime: new Date(),
        pendingCount: result.failed,
        failedCount: result.failed,
        syncErrors: result.errors,
      });

      return result.failed === 0;
    } catch (error) {
      console.error('[SyncService] ❌ Sync error:', error);
      this.updateSyncStatus({
        isSyncing: false,
        syncErrors: [(error as Error).message],
      });
      return false;
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
      const stats = await this.workerManager.getStats();

      if (stats.pendingSync === 0) {
        console.log('[SyncService] ✅ No pending syncs to retry');
        return true;
      }

      // Sync all pending bookings (including previously failed ones)
      return this.syncPendingBookings();
    } catch (error) {
      console.error('[SyncService] ❌ Failed to retry syncs:', error);
      return false;
    }
  }

  // ==================== UTILITY METHODS ====================

  private updateSyncStatus(partial: Partial<SyncStatus>): void {
    const current = this.syncStatus$.value;
    const updated = { ...current, ...partial };
    console.log('[SyncService] Updating sync status:', updated);
    this.syncStatus$.next(updated);
  }

  async updatePendingCount(): Promise<void> {
    try {
      const stats = await this.workerManager.getStats();
      console.log('[SyncService] Updated pending count:', stats.pendingSync);
      this.updateSyncStatus({ pendingCount: stats.pendingSync });
    } catch (error) {
      console.error('[SyncService] ❌ Failed to update pending count:', error);
    }
  }

  // ==================== BACKGROUND SYNC (PERIODIC) ====================

  startBackgroundSync(intervalMinutes = 5): void {
    if (this.autoSyncSubscription) {
      this.autoSyncSubscription.unsubscribe();
    }

    this.autoSyncSubscription = interval(intervalMinutes * 60000)
      .pipe(filter(() => this.networkService.isOnline$.value))
      .subscribe(async () => {
        console.log('[SyncService] 🔄 Background sync triggered');
        await this.updatePendingCount();

        const currentStatus = this.syncStatus$.value;
        if (currentStatus.pendingCount > 0) {
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
    if (this.workerSyncSubscription) {
      this.workerSyncSubscription.unsubscribe();
    }
  }
}
