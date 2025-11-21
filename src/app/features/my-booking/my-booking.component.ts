// src/app/features/my-booking/my-booking.component.ts
// ✅ FIXED: Real-time stats updates from DataStore + proper event handling

import { Component, OnInit, OnDestroy, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { Subscription, combineLatest } from 'rxjs';
import { WorkerManagerService } from '../../core/services/worker-manager.service';
import { OfflineStorageService } from '../../core/services/offline-storage.service';
import { NetworkService } from '../../core/services/network.service';
import { SyncService } from '../../core/services/sync.service';
import { DataStoreService } from '../../core/services/data-store.service';
import { Booking } from '../../core/models/booking.model';
import { Ticket } from '../../core/models/ticket.model';

interface BookingWithTicket extends Booking {
  ticketDetails?: Ticket;
}

@Component({
  selector: 'app-my-booking',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './my-booking.component.html',
  styleUrls: ['./my-booking.component.scss'],
})
export class MyBookingComponent implements OnInit, OnDestroy {
  bookings: BookingWithTicket[] = [];
  filteredBookings: BookingWithTicket[] = [];
  isOnline = true;
  isLoading = false;
  isSyncing = false;

  selectedStatus: 'all' | 'pending' | 'confirmed' | 'cancelled' = 'all';

  stats = {
    total: 0,
    pending: 0,
    confirmed: 0,
    cancelled: 0,
    needsSync: 0,
  };

  private subscriptions: Subscription[] = [];

  constructor(
    private router: Router,
    private workerManager: WorkerManagerService, // ✅ ADDED: Use WorkerManager
    private offlineStorage: OfflineStorageService,
    private networkService: NetworkService,
    private syncService: SyncService,
    private dataStore: DataStoreService,
    private ngZone: NgZone // ✅ ADDED: NgZone for UI updates
  ) {}

  async ngOnInit(): Promise<void> {
    console.log('[MyBookings] 🚀 Component initialized');

    this.subscribeToState();
    await this.loadBookings();
    await this.syncService.updatePendingCount();
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach((sub) => sub.unsubscribe());
    console.log(
      '[MyBookings] 🧹 Component destroyed, subscriptions cleaned up'
    );
  }

  // ==================== REACTIVE STATE SUBSCRIPTIONS ====================

  private subscribeToState(): void {
    // ✅ FIXED: Subscribe to DataStore stats for real-time updates
    const statsSub = this.dataStore.getBookingStats$().subscribe((stats) => {
      console.log('[MyBookings] 📊 DataStore stats updated:', stats);

      // ✅ Update stats from DataStore (real-time source of truth)
      this.ngZone.run(() => {
        this.stats = {
          ...this.stats,
          total: stats.total,
          needsSync: stats.needsSync,
        };

        // Recalculate local stats if we have bookings loaded
        if (this.bookings.length > 0) {
          this.calculateLocalStats();
        }
      });
    });
    this.subscriptions.push(statsSub);

    // Subscribe to sync status
    const syncSub = this.dataStore.getSyncStatus$().subscribe((syncStatus) => {
      console.log('[MyBookings] 🔄 Sync status updated:', syncStatus);
      this.isSyncing = syncStatus.isSyncing;
    });
    this.subscriptions.push(syncSub);

    // Subscribe to network status
    const networkSub = this.networkService.isOnline$.subscribe((status) => {
      console.log('[MyBookings] 📡 Network status:', status);
      this.isOnline = status;
    });
    this.subscriptions.push(networkSub);

    // ✅ IMPROVED: Subscribe to worker events for immediate refresh
    const eventsSub = this.dataStore.getEvents$().subscribe(async (event) => {
      console.log('[MyBookings] 📢 Worker event received:', event.type);

      // Reload bookings on any data change
      switch (event.type) {
        case 'BOOKING_SAVED':
          console.log('[MyBookings] 🆕 New booking, reloading...');
          await this.loadBookings();
          break;

        case 'BOOKING_UPDATED':
          console.log('[MyBookings] ✏️ Booking updated, reloading...');
          await this.loadBookings();
          break;

        case 'BOOKING_DELETED':
          console.log('[MyBookings] 🗑️ Booking deleted, reloading...');
          await this.loadBookings();
          break;

        case 'SYNC_COMPLETED':
          console.log('[MyBookings] 🔄 Sync completed, reloading...');
          await this.loadBookings();
          break;

        case 'STATS_CHANGED':
          console.log('[MyBookings] 📊 Stats changed, reloading...');
          await this.loadBookings();
          break;
      }
    });
    this.subscriptions.push(eventsSub);

    // Combined subscription for auto-sync
    const combinedSub = combineLatest([
      this.networkService.isOnline$,
      this.dataStore.getPendingSyncCount$(),
    ]).subscribe(async ([isOnline, pendingCount]) => {
      console.log('[MyBookings] 🔗 Combined state:', {
        isOnline,
        pendingCount,
      });

      if (isOnline && pendingCount > 0 && !this.isSyncing) {
        console.log('[MyBookings] 🔄 Auto-triggering sync');
        setTimeout(() => this.syncPendingBookings(), 1000);
      }
    });
    this.subscriptions.push(combinedSub);
  }

  // ==================== DATA LOADING ====================

  private async loadBookings(): Promise<void> {
    this.isLoading = true;
    try {
      const allBookings = await this.offlineStorage.getAllBookings();

      this.bookings = await Promise.all(
        allBookings.map(async (booking) => {
          const ticketDetails = await this.offlineStorage.getTicketById(
            booking.ticketId
          );
          return { ...booking, ticketDetails };
        })
      );

      this.filteredBookings = [...this.bookings];

      // ✅ Calculate stats from loaded bookings
      this.calculateLocalStats();
      this.applyFilters();

      console.log('[MyBookings] ✅ Loaded', this.bookings.length, 'bookings');
    } catch (error) {
      console.error('[MyBookings] ❌ Failed to load bookings:', error);
      alert('❌ Failed to load bookings');
    } finally {
      this.isLoading = false;
    }
  }

  // ✅ RENAMED: Separate local stats calculation from DataStore updates
  private calculateLocalStats(): void {
    const pending = this.bookings.filter((b) => b.status === 'pending').length;
    const confirmed = this.bookings.filter(
      (b) => b.status === 'confirmed'
    ).length;
    const cancelled = this.bookings.filter(
      (b) => b.status === 'cancelled'
    ).length;

    // ✅ Update local computed stats only (total and needsSync come from DataStore)
    this.stats = {
      ...this.stats, // Keep DataStore values (total, needsSync)
      pending,
      confirmed,
      cancelled,
    };

    console.log('[MyBookings] 📊 Local stats calculated:', this.stats);
  }

  // ==================== FILTERS ====================

  filterByStatus(status: 'all' | 'pending' | 'confirmed' | 'cancelled'): void {
    this.selectedStatus = status;
    this.applyFilters();
  }

  private applyFilters(): void {
    let result = [...this.bookings];

    if (this.selectedStatus !== 'all') {
      result = result.filter((b) => b.status === this.selectedStatus);
    }

    result.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    this.filteredBookings = result;
  }

  // ==================== BOOKING ACTIONS ====================

  async cancelBooking(booking: Booking): Promise<void> {
    if (!confirm('Are you sure you want to cancel this booking?')) {
      return;
    }

    try {
      if (booking.id !== undefined) {
        // ✅ Use WorkerManager for proper event broadcasting
        const updateCount = await this.workerManager.updateBooking(booking.id, {
          status: 'cancelled',
          syncStatus: this.isOnline ? 'synced' : 'pending',
        });

        // ✅ Wrap UI update in NgZone
        this.ngZone.run(() => {
          if (updateCount > 0) {
            alert('✅ Booking cancelled successfully');
          } else {
            alert('⚠️ Booking not found');
          }
        });
      }
    } catch (error) {
      this.ngZone.run(() => {
        console.error('[MyBookings] ❌ Failed to cancel booking:', error);
        alert('❌ Failed to cancel booking');
      });
    }
  }

  async deleteBooking(booking: Booking): Promise<void> {
    if (!confirm('Are you sure you want to delete this booking permanently?')) {
      return;
    }

    try {
      if (booking.id !== undefined) {
        // ✅ Use WorkerManager for proper event broadcasting
        await this.workerManager.deleteBooking(booking.id);

        // ✅ Wrap UI update in NgZone
        this.ngZone.run(() => {
          alert('🗑️ Booking deleted successfully');
        });
      }
    } catch (error) {
      this.ngZone.run(() => {
        console.error('[MyBookings] ❌ Failed to delete booking:', error);
        alert('❌ Failed to delete booking');
      });
    }
  }

  // ==================== SYNC OPERATIONS ====================

  async syncPendingBookings(): Promise<void> {
    if (this.stats.needsSync === 0) {
      alert('✅ All bookings are already synced');
      return;
    }

    if (!this.isOnline) {
      alert('📴 Cannot sync while offline');
      return;
    }

    if (this.isSyncing) {
      alert('⏳ Sync already in progress');
      return;
    }

    try {
      console.log('[MyBookings] 🔄 Starting sync...');

      const success = await this.syncService.syncPendingBookings();

      this.ngZone.run(() => {
        if (success) {
          alert('✅ All bookings synced successfully!');
        } else {
          alert('⚠️ Some bookings failed to sync');
        }
      });
    } catch (error) {
      this.ngZone.run(() => {
        console.error('[MyBookings] ❌ Sync failed:', error);
        alert('❌ Failed to sync bookings');
      });
    }
  }

  // ==================== VIEW ACTIONS ====================

  viewBookingDetails(booking: BookingWithTicket): void {
    const details = `
Booking ID: ${booking.id !== undefined ? booking.id : 'N/A'}
Route: ${booking.ticketDetails?.from || 'N/A'} → ${
      booking.ticketDetails?.to || 'N/A'
    }
Date: ${
      booking.ticketDetails?.date
        ? new Date(booking.ticketDetails.date).toLocaleDateString()
        : 'N/A'
    }
Passengers: ${booking.passengers.length}
Total Amount: ₹${booking.totalAmount}
Status: ${booking.status.toUpperCase()}
Sync Status: ${booking.syncStatus.toUpperCase()}

Passenger Details:
${booking.passengers
  .map((p, i) => `${i + 1}. ${p.name} (${p.age}yrs, ${p.gender})`)
  .join('\n')}
    `.trim();

    alert(details);
  }

  // ==================== NAVIGATION ====================

  searchTickets(): void {
    this.router.navigate(['/search']);
  }

  goHome(): void {
    this.router.navigate(['/']);
  }

  // ==================== HELPERS ====================

  getStatusClass(status: string): string {
    return `status-${status}`;
  }

  getSyncStatusClass(syncStatus: string): string {
    return `sync-${syncStatus}`;
  }

  getTicketIcon(type?: string): string {
    switch (type) {
      case 'flight':
        return '✈️';
      case 'train':
        return '🚆';
      case 'bus':
        return '🚌';
      default:
        return '🎫';
    }
  }
}
