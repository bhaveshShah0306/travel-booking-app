// src/app/features/my-booking/my-booking.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { Subscription, combineLatest } from 'rxjs';
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
  isSyncing = false; // ✅ Removed syncProgress property

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
    private offlineStorage: OfflineStorageService,
    private networkService: NetworkService,
    private syncService: SyncService,
    private dataStore: DataStoreService
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
    // Subscribe to booking stats
    const statsSub = this.dataStore.getBookingStats$().subscribe((stats) => {
      console.log('[MyBookings] 📊 Booking stats updated:', stats);
      this.stats = {
        ...this.stats,
        total: stats.total,
        needsSync: stats.needsSync,
      };
    });
    this.subscriptions.push(statsSub);

    // ✅ FIXED: Only subscribe to isSyncing, no progress property
    const syncSub = this.dataStore.getSyncStatus$().subscribe((syncStatus) => {
      console.log('[MyBookings] 🔄 Sync status updated:', syncStatus);
      this.isSyncing = syncStatus.isSyncing;
      // No more: this.syncProgress = syncStatus.progress;
    });
    this.subscriptions.push(syncSub);

    // Subscribe to network status
    const networkSub = this.networkService.isOnline$.subscribe((status) => {
      console.log('[MyBookings] 📡 Network status:', status);
      this.isOnline = status;
    });
    this.subscriptions.push(networkSub);

    // Subscribe to worker events for real-time updates
    const eventsSub = this.dataStore.getEvents$().subscribe(async (event) => {
      console.log('[MyBookings] 📢 Worker event received:', event);

      if (
        [
          'BOOKING_SAVED',
          'BOOKING_UPDATED',
          'BOOKING_DELETED',
          'SYNC_COMPLETED',
        ].includes(event.type)
      ) {
        console.log('[MyBookings] 🔄 Reloading bookings due to:', event.type);
        await this.loadBookings();
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
      this.calculateStats();
      this.applyFilters();

      console.log('[MyBookings] ✅ Loaded', this.bookings.length, 'bookings');
    } catch (error) {
      console.error('[MyBookings] ❌ Failed to load bookings:', error);
      alert('❌ Failed to load bookings');
    } finally {
      this.isLoading = false;
    }
  }

  private calculateStats(): void {
    this.stats.total = this.bookings.length;
    this.stats.pending = this.bookings.filter(
      (b) => b.status === 'pending'
    ).length;
    this.stats.confirmed = this.bookings.filter(
      (b) => b.status === 'confirmed'
    ).length;
    this.stats.cancelled = this.bookings.filter(
      (b) => b.status === 'cancelled'
    ).length;
    this.stats.needsSync = this.bookings.filter(
      (b) => b.syncStatus === 'pending'
    ).length;

    console.log('[MyBookings] 📊 Calculated stats:', this.stats);
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
        const updateCount = await this.offlineStorage.updateBooking(
          booking.id,
          {
            status: 'cancelled',
            syncStatus: this.isOnline ? 'synced' : 'pending',
          }
        );

        if (updateCount > 0) {
          alert('✅ Booking cancelled successfully');
        } else {
          alert('⚠️ Booking not found');
        }
      }
    } catch (error) {
      console.error('[MyBookings] ❌ Failed to cancel booking:', error);
      alert('❌ Failed to cancel booking');
    }
  }

  async deleteBooking(booking: Booking): Promise<void> {
    if (!confirm('Are you sure you want to delete this booking permanently?')) {
      return;
    }

    try {
      if (booking.id !== undefined) {
        await this.offlineStorage.deleteBooking(booking.id);
        alert('🗑️ Booking deleted successfully');
      }
    } catch (error) {
      console.error('[MyBookings] ❌ Failed to delete booking:', error);
      alert('❌ Failed to delete booking');
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

      if (success) {
        alert(`✅ All bookings synced successfully!`);
      } else {
        alert('⚠️ Some bookings failed to sync');
      }
    } catch (error) {
      console.error('[MyBookings] ❌ Sync failed:', error);
      alert('❌ Failed to sync bookings');
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
