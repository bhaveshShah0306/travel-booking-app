// src/app/features/my-booking/my-booking.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { OfflineStorageService } from '../../core/services/offline-storage.service';
import { NetworkService } from '../../core/services/network.service';
import { SyncService } from '../../core/services/sync.service';
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
  selectedSyncStatus: 'all' | 'synced' | 'pending' | 'failed' = 'all';

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
    private syncService: SyncService
  ) {}

  async ngOnInit(): Promise<void> {
    this.monitorNetwork();
    this.monitorSync();
    await this.loadBookings();
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach((sub) => sub.unsubscribe());
  }

  private monitorNetwork(): void {
    const networkSub = this.networkService.isOnline$.subscribe(
      async (status) => {
        this.isOnline = status;
        if (status && this.stats.needsSync > 0) {
          await this.syncPendingBookings();
        }
      }
    );
    this.subscriptions.push(networkSub);
  }

  private monitorSync(): void {
    const syncSub = this.syncService.getSyncStatus().subscribe((status) => {
      this.isSyncing = status.isSyncing;
    });
    this.subscriptions.push(syncSub);
  }

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
    } catch (error) {
      console.error('Failed to load bookings:', error);
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
  }

  filterByStatus(status: 'all' | 'pending' | 'confirmed' | 'cancelled'): void {
    this.selectedStatus = status;
    this.applyFilters();
  }

  filterBySyncStatus(
    syncStatus: 'all' | 'synced' | 'pending' | 'failed'
  ): void {
    this.selectedSyncStatus = syncStatus;
    this.applyFilters();
  }

  private applyFilters(): void {
    let result = [...this.bookings];

    if (this.selectedStatus !== 'all') {
      result = result.filter((b) => b.status === this.selectedStatus);
    }

    if (this.selectedSyncStatus !== 'all') {
      result = result.filter((b) => b.syncStatus === this.selectedSyncStatus);
    }

    result.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    this.filteredBookings = result;
  }

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
          await this.loadBookings();
        } else {
          alert('⚠️ Booking not found');
        }
      }
    } catch (error) {
      console.error('Failed to cancel booking:', error);
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
        await this.loadBookings();
      }
    } catch (error) {
      console.error('Failed to delete booking:', error);
      alert('❌ Failed to delete booking');
    }
  }

  async syncPendingBookings(): Promise<void> {
    if (this.stats.needsSync === 0) {
      alert('✅ All bookings are already synced');
      return;
    }

    if (!this.isOnline) {
      alert('📴 Cannot sync while offline');
      return;
    }

    try {
      this.isSyncing = true;
      const success = await this.syncService.syncPendingBookings();

      if (success) {
        alert(`✅ ${this.stats.needsSync} booking(s) synced successfully`);
        await this.loadBookings();
      } else {
        alert('⚠️ Some bookings failed to sync');
        await this.loadBookings();
      }
    } catch (error) {
      console.error('Sync failed:', error);
      alert('❌ Failed to sync bookings');
    } finally {
      this.isSyncing = false;
    }
  }

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

  searchTickets(): void {
    this.router.navigate(['/search']);
  }

  goHome(): void {
    this.router.navigate(['/']);
  }

  getStatusClass(status: string): string {
    switch (status) {
      case 'pending':
        return 'status-pending';
      case 'confirmed':
        return 'status-confirmed';
      case 'cancelled':
        return 'status-cancelled';
      default:
        return '';
    }
  }

  getSyncStatusClass(syncStatus: string): string {
    switch (syncStatus) {
      case 'synced':
        return 'sync-synced';
      case 'pending':
        return 'sync-pending';
      case 'failed':
        return 'sync-failed';
      default:
        return '';
    }
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
