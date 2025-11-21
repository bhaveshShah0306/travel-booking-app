// src/app/features/home/home.component.ts
import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { CommonModule } from '@angular/common';
import { OfflineStorageService } from '../../core/services/offline-storage.service';
import { DataInitService } from '../../core/services/data-init.service';
import { Ticket } from '../../core/models/ticket.model';
import { DataStoreService } from '../../core/services/data-store.service';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss'],
})
export class HomeComponent implements OnInit {
  tickets: Ticket[] = [];
  storageStats = { bookings: 0, tickets: 0, pendingSync: 0 };
  private subscriptions: Subscription[] = [];
  constructor(
    private router: Router,
    private offlineStorage: OfflineStorageService,
    private dataInitService: DataInitService,
    private dataStoreService: DataStoreService
  ) {}

  async ngOnInit(): Promise<void> {
    await this.dataInitService.initializeSampleData();
    await this.loadTickets();
    await this.loadStats();
    this.subscribeToBookingStats();
    this.subscribeToWorkerEvents();
  }
  private subscribeToBookingStats(): void {
    const statsSub = this.dataStoreService
      .getBookingStats$()
      .subscribe((stats) => {
        console.log('[Home] 📊 Stats updated from DataStore:', stats);

        // Update only the stats that changed
        this.storageStats = {
          ...this.storageStats,
          bookings: stats.total,
          pendingSync: stats.needsSync,
        };
      });

    this.subscriptions.push(statsSub);
  }

  /**
   * ✅ NEW: Subscribe to worker events for auto-refresh
   * Refreshes data when bookings are saved/updated/deleted
   */
  private subscribeToWorkerEvents(): void {
    const eventsSub = this.dataStoreService
      .getEvents$()
      .subscribe(async (event) => {
        console.log('[Home] 📢 Worker event received:', event.type);

        // Refresh data on relevant events
        switch (event.type) {
          case 'BOOKING_SAVED':
            console.log('[Home] 🆕 New booking created, refreshing stats...');
            await this.loadStats();
            break;

          case 'BOOKING_UPDATED':
            console.log('[Home] ✏️ Booking updated, refreshing stats...');
            await this.loadStats();
            break;

          case 'BOOKING_DELETED':
            console.log('[Home] 🗑️ Booking deleted, refreshing stats...');
            await this.loadStats();
            break;

          case 'SYNC_COMPLETED':
            console.log('[Home] 🔄 Sync completed, refreshing all data...');
            await this.loadStats();
            break;

          case 'STATS_CHANGED':
            console.log('[Home] 📊 Stats changed directly, refreshing...');
            await this.loadStats();
            break;
        }
      });

    this.subscriptions.push(eventsSub);
  }
  searchTickets() {
    this.router.navigate(['/search']);
  }

  private async loadTickets(): Promise<void> {
    this.tickets = await this.offlineStorage.getCachedTickets();
  }

  private async loadStats(): Promise<void> {
    this.storageStats = await this.offlineStorage.getStorageStats();
  }

  bookTicket(ticket: Ticket): void {
    this.router.navigate(['/booking', ticket.id]);
  }

  viewMyBookings(): void {
    this.router.navigate(['/my-bookings']);
  }
}
