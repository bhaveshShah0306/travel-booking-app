// src/app/features/home/home.component.ts
import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { OfflineStorageService } from '../../core/services/offline-storage.service';
import { DataInitService } from '../../core/services/data-init.service';
import { Ticket } from '../../core/models/ticket.model';

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

  constructor(
    private router: Router,
    private offlineStorage: OfflineStorageService,
    private dataInitService: DataInitService
  ) {}

  async ngOnInit(): Promise<void> {
    try {
      // Initialize sample data if needed
      await this.dataInitService.initializeSampleData();

      // Load tickets and stats
      await this.loadTickets();
      await this.loadStats();
    } catch (error) {
      console.error('Failed to initialize home component:', error);
      alert('⚠️ Failed to load data. Please refresh the page.');
    }
  }

  private async loadTickets(): Promise<void> {
    try {
      this.tickets = await this.offlineStorage.getCachedTickets();
      console.log('✅ Loaded tickets:', this.tickets.length);
    } catch (error) {
      console.error('Failed to load tickets:', error);
      this.tickets = [];
    }
  }

  private async loadStats(): Promise<void> {
    try {
      this.storageStats = await this.offlineStorage.getStorageStats();
      console.log('✅ Loaded stats:', this.storageStats);
    } catch (error) {
      console.error('Failed to load stats:', error);
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
