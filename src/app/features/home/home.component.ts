// src/app/features/home/home.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, NavigationEnd } from '@angular/router';
import { Subscription, filter } from 'rxjs';
import { OfflineStorageService } from '../../core/services/offline-storage.service';
import { DataInitService } from '../../core/services/data-init.service';
import { SyncService } from '../../core/services/sync.service';
import { Ticket } from '../../core/models/ticket.model';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss'],
})
export class HomeComponent implements OnInit, OnDestroy {
  tickets: Ticket[] = [];
  storageStats = { bookings: 0, tickets: 0, pendingSync: 0 };

  private subscriptions: Subscription[] = [];

  constructor(
    private router: Router,
    private offlineStorage: OfflineStorageService,
    private dataInitService: DataInitService,
    private syncService: SyncService
  ) {}

  async ngOnInit(): Promise<void> {
    try {
      // Initialize sample data if needed
      await this.dataInitService.initializeSampleData();

      // Load tickets and stats
      await this.loadTickets();
      await this.loadStats();

      // ✅ FIX: Subscribe to sync status changes
      const syncSub = this.syncService
        .getSyncStatus()
        .subscribe(async (status) => {
          console.log('[Home] Sync status updated:', status);
          // Refresh stats when sync completes
          if (!status.isSyncing) {
            await this.loadStats();
          }
        });
      this.subscriptions.push(syncSub);

      // ✅ FIX: Refresh stats when navigating back to home
      const routerSub = this.router.events
        .pipe(filter((event) => event instanceof NavigationEnd))
        .subscribe(async (event) => {
          if (
            (event as NavigationEnd).url === '/' ||
            (event as NavigationEnd).url === ''
          ) {
            console.log('[Home] Navigated back to home, refreshing stats');
            await this.loadStats();
          }
        });
      this.subscriptions.push(routerSub);
    } catch (error) {
      console.error('Failed to initialize home component:', error);
      alert('⚠️ Failed to load data. Please refresh the page.');
    }
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach((sub) => sub.unsubscribe());
  }

  private async loadTickets(): Promise<void> {
    try {
      this.tickets = await this.offlineStorage.getCachedTickets();
      console.log('[Home] ✅ Loaded tickets:', this.tickets.length);
    } catch (error) {
      console.error('[Home] Failed to load tickets:', error);
      this.tickets = [];
    }
  }

  private async loadStats(): Promise<void> {
    try {
      this.storageStats = await this.offlineStorage.getStorageStats();
      console.log('[Home] ✅ Loaded stats:', this.storageStats);
    } catch (error) {
      console.error('[Home] Failed to load stats:', error);
    }
  }

  bookTicket(ticket: Ticket): void {
    if (ticket.availableSeats === 0) {
      alert('❌ No seats available for this ticket');
      return;
    }
    this.router.navigate(['/booking', ticket.id]);
  }

  viewMyBookings(): void {
    this.router.navigate(['/my-bookings']);
  }
}
