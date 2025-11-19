// src/app/features/home/home.component.ts
import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { OfflineStorageService } from '../../core/services/offline-storage.service';
import { DataInitService } from '../../core/services/data-init.service';
import { Ticket } from '../../core/models/ticket.model';

@Component({
  selector: 'app-home',
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
    // Initialize sample data if needed
    await this.dataInitService.initializeSampleData();

    // Load tickets and stats
    await this.loadTickets();
    await this.loadStats();
  }

  searchTickets() {
    // Navigate to search
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
