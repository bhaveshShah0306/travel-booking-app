// src/app/core/services/sync.service.ts (Updated)
import { Injectable } from '@angular/core';
import { BehaviorSubject, interval, Subscription } from 'rxjs';
import { filter } from 'rxjs/operators';
import { NetworkService } from './network.service';
import { WorkerManagerService } from './worker-manager.service';
import { SyncStatus } from '../models/syncstatus.model';

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
      .subscribe(() => {
        console.log('📡 Network online - starting auto sync');
        this.syncPendingBookings();
      });

    // Periodic sync every 5 minutes when online
    this.autoSyncSubscription = interval(300000) // 5 minutes
      .pipe(filter(() => this.networkService.isOnline$.value))
      .subscribe(() => {
        console.log('🔄 Periodic sync triggered');
        this.syncPendingBookings();
      });
  }

  // Monitor worker sync responses
  private monitorWorkerSync(): void {
    this.workerSyncSubscription = this.workerManager
      .getSyncStream()
      .subscribe((response) => {
        if (response.success && response.data) {
          const { successful, failed, errors } = response.data;
          console.log(
            `✅ Worker sync completed: ${successful} successful, ${failed} failed`
          );

          this.updateSyncStatus({
            isSyncing: false,
            lastSyncTime: new Date(),
            pendingCount: failed,
            failedCount: failed,
            syncErrors: errors,
          });
        }
      });
  }

  // ==================== MAIN SYNC FUNCTION (USING WORKER) ====================

  async syncPendingBookings(): Promise<boolean> {
    const currentStatus = this.syncStatus$.value;

    // Prevent concurrent syncs
    if (currentStatus.isSyncing) {
      console.log('⏳ Sync already in progress');
      return false;
    }

    // Check if online
    if (!this.networkService.isOnline$.value) {
      console.log('📴 Cannot sync - offline');
      return false;
    }

    try {
      // Update status: syncing started
      this.updateSyncStatus({ isSyncing: true, syncErrors: [] });

      // DELEGATE TO WORKER - This runs on a separate thread!
      const result = await this.workerManager.syncPendingBookings();

      console.log(
        `✅ Sync completed: ${result.successful} successful, ${result.failed} failed`
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
      console.error('❌ Sync error:', error);
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
      console.log('📴 Cannot sync - offline');
      return false;
    }

    try {
      // For single booking, we'll still use the full sync
      // In a production app, you'd add a specific worker method for single booking sync
      await this.syncPendingBookings();
      await this.updatePendingCount();
      return true;
    } catch (error) {
      console.error(`❌ Failed to force sync booking ${bookingId}:`, error);
      return false;
    }
  }

  // ==================== RETRY FAILED SYNCS ====================

  async retryFailedSyncs(): Promise<boolean> {
    if (!this.networkService.isOnline$.value) {
      return false;
    }

    try {
      // Get all bookings and reset failed ones to pending
      const stats = await this.workerManager.getStats();

      if (stats.pendingSync === 0) {
        return true;
      }

      // Sync all pending bookings (including previously failed ones)
      return this.syncPendingBookings();
    } catch (error) {
      console.error('❌ Failed to retry syncs:', error);
      return false;
    }
  }

  // ==================== UTILITY METHODS ====================

  private updateSyncStatus(partial: Partial<SyncStatus>): void {
    const current = this.syncStatus$.value;
    this.syncStatus$.next({ ...current, ...partial });
  }

  async updatePendingCount(): Promise<void> {
    try {
      const stats = await this.workerManager.getStats();
      this.updateSyncStatus({ pendingCount: stats.pendingSync });
    } catch (error) {
      console.error('❌ Failed to update pending count:', error);
    }
  }

  // ==================== BACKGROUND SYNC (PERIODIC) ====================

  startBackgroundSync(intervalMinutes = 5): void {
    if (this.autoSyncSubscription) {
      this.autoSyncSubscription.unsubscribe();
    }

    this.autoSyncSubscription = interval(intervalMinutes * 60000)
      .pipe(filter(() => this.networkService.isOnline$.value))
      .subscribe(() => {
        console.log('🔄 Background sync triggered');
        this.syncPendingBookings();
      });

    console.log(
      `✅ Background sync started (every ${intervalMinutes} minutes)`
    );
  }

  stopBackgroundSync(): void {
    if (this.autoSyncSubscription) {
      this.autoSyncSubscription.unsubscribe();
      console.log('🛑 Background sync stopped');
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

export { SyncStatus };
