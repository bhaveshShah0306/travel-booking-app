// src/app/features/my-booking/my-booking.component.ts
import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { OfflineStorageService } from '../../core/services/offline-storage.service';
import { NetworkService } from '../../core/services/network.service';
import { Booking } from '../../core/models/booking.model';
import { Ticket } from '../../core/models/ticket.model';

interface BookingWithTicket extends Booking {
  ticketDetails?: Ticket;
}

@Component({
  selector: 'app-my-booking',
  templateUrl: './my-booking.component.html',
  styleUrls: ['./my-booking.component.scss'],
})
export class MyBookingComponent implements OnInit {
  bookings: BookingWithTicket[] = [];
  filteredBookings: BookingWithTicket[] = [];
  isOnline = true;
  isLoading = false;

  // Filter options
  selectedStatus: 'all' | 'pending' | 'confirmed' | 'cancelled' = 'all';
  selectedSyncStatus: 'all' | 'synced' | 'pending' | 'failed' = 'all';

  // Stats
  stats = {
    total: 0,
    pending: 0,
    confirmed: 0,
    cancelled: 0,
    needsSync: 0,
  };

  constructor(
    private router: Router,
    private offlineStorage: OfflineStorageService,
    private networkService: NetworkService
  ) {}

  async ngOnInit(): Promise<void> {
    this.monitorNetwork();
    await this.loadBookings();
  }

  private monitorNetwork(): void {
    this.networkService.isOnline$.subscribe(async (status) => {
      this.isOnline = status;

      // Auto-sync when coming online
      if (status) {
        await this.syncPendingBookings();
      }
    });
  }

  private async loadBookings(): Promise<void> {
    this.isLoading = true;
    try {
      const allBookings = await this.offlineStorage.getAllBookings();

      // Load ticket details for each booking
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

  // Filter bookings
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

    // Filter by status
    if (this.selectedStatus !== 'all') {
      result = result.filter((b) => b.status === this.selectedStatus);
    }

    // Filter by sync status
    if (this.selectedSyncStatus !== 'all') {
      result = result.filter((b) => b.syncStatus === this.selectedSyncStatus);
    }

    // Sort by date (newest first)
    result.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    this.filteredBookings = result;
  }

  // Cancel booking - properly update the booking status
  async cancelBooking(booking: Booking): Promise<void> {
    if (!confirm('Are you sure you want to cancel this booking?')) {
      return;
    }

    try {
      if (booking.id !== undefined) {
        // Update the booking with cancelled status
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

  // Delete booking
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

  // Sync all pending bookings - FIXED VERSION
  async syncPendingBookings(): Promise<void> {
    const pendingBookings = this.bookings.filter(
      (b) => b.syncStatus === 'pending'
    );

    if (pendingBookings.length === 0) {
      return;
    }

    if (!this.isOnline) {
      alert('📴 Cannot sync while offline');
      return;
    }

    try {
      console.log(`🔄 Syncing ${pendingBookings.length} pending bookings...`);

      // Update each pending booking in IndexedDB
      for (const booking of pendingBookings) {
        if (booking.id !== undefined) {
          // Use updateBookingSyncStatus which directly updates the DB
          await this.offlineStorage.updateBookingSyncStatus(
            booking.id,
            'synced'
          );

          // Also update the status to confirmed
          await this.offlineStorage.updateBookingStatus(
            booking.id,
            'confirmed'
          );

          console.log(`✅ Synced booking ID: ${booking.id}`);
        }
      }

      alert(`✅ ${pendingBookings.length} booking(s) synced and confirmed`);

      // Reload bookings to reflect changes
      await this.loadBookings();
    } catch (error) {
      console.error('Sync failed:', error);
      alert('❌ Failed to sync bookings');
    }
  }

  // View booking details
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

  // Navigate to search
  searchTickets(): void {
    this.router.navigate(['/search']);
  }

  // Navigate to home
  goHome(): void {
    this.router.navigate(['/']);
  }

  // Get status badge class
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

  // Get sync status badge class
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

  // Get ticket type icon
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
