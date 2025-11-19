// src/app/core/services/data-init.service.ts
import { Injectable } from '@angular/core';
import { OfflineStorageService } from './offline-storage.service';
import { Ticket } from '../models/ticket.model';

@Injectable({
  providedIn: 'root',
})
export class DataInitService {
  private readonly CACHE_VERSION_KEY = 'cache_version';
  private readonly CURRENT_VERSION = '1.0.0';

  constructor(private offlineStorage: OfflineStorageService) {}

  async initializeSampleData(): Promise<void> {
    try {
      // Check cache version to force refresh if needed
      const cachedVersion = localStorage.getItem(this.CACHE_VERSION_KEY);
      const existingTickets = await this.offlineStorage.getCachedTickets();

      if (
        cachedVersion === this.CURRENT_VERSION &&
        existingTickets.length > 0
      ) {
        console.log(
          '✅ Sample tickets already exist (version:',
          this.CURRENT_VERSION,
          ')'
        );
        console.log(`📊 Found ${existingTickets.length} tickets in cache`);
        return;
      }

      // Clear old data if version mismatch
      if (cachedVersion !== this.CURRENT_VERSION) {
        console.log('🔄 Cache version mismatch, refreshing data...');
        await this.offlineStorage.clearAllData();
      }

      // Create sample tickets with realistic data
      const sampleTickets: Ticket[] = this.generateSampleTickets();

      // Cache the tickets
      await this.offlineStorage.cacheTickets(sampleTickets);

      // Update cache version
      localStorage.setItem(this.CACHE_VERSION_KEY, this.CURRENT_VERSION);

      console.log(
        `✅ ${sampleTickets.length} sample tickets initialized successfully`
      );
      console.log(
        '📋 Tickets:',
        sampleTickets.map((t) => `${t.id}: ${t.from} → ${t.to}`)
      );
    } catch (error) {
      console.error('❌ Failed to initialize sample data:', error);
      throw error;
    }
  }

  private generateSampleTickets(): Ticket[] {
    const now = Date.now();
    const oneDay = 86400000;

    return [
      {
        id: 'TKT001',
        from: 'Delhi',
        to: 'Mumbai',
        date: new Date(now + oneDay),
        price: 1500,
        type: 'flight',
        availableSeats: 45,
      },
      {
        id: 'TKT002',
        from: 'Delhi',
        to: 'Bangalore',
        date: new Date(now + 2 * oneDay),
        price: 800,
        type: 'train',
        availableSeats: 120,
      },
      {
        id: 'TKT003',
        from: 'Mumbai',
        to: 'Goa',
        date: new Date(now + 3 * oneDay),
        price: 350,
        type: 'bus',
        availableSeats: 30,
      },
      {
        id: 'TKT004',
        from: 'Bangalore',
        to: 'Chennai',
        date: new Date(now + oneDay),
        price: 600,
        type: 'train',
        availableSeats: 80,
      },
      {
        id: 'TKT005',
        from: 'Delhi',
        to: 'Jaipur',
        date: new Date(now + 2 * oneDay),
        price: 250,
        type: 'bus',
        availableSeats: 25,
      },
      {
        id: 'TKT006',
        from: 'Mumbai',
        to: 'Pune',
        date: new Date(now + oneDay),
        price: 200,
        type: 'bus',
        availableSeats: 35,
      },
      {
        id: 'TKT007',
        from: 'Chennai',
        to: 'Kochi',
        date: new Date(now + 3 * oneDay),
        price: 950,
        type: 'train',
        availableSeats: 90,
      },
      {
        id: 'TKT008',
        from: 'Hyderabad',
        to: 'Bangalore',
        date: new Date(now + oneDay),
        price: 1200,
        type: 'flight',
        availableSeats: 55,
      },
      {
        id: 'TKT009',
        from: 'Delhi',
        to: 'Mumbai',
        date: new Date(now + 4 * oneDay),
        price: 1800,
        type: 'flight',
        availableSeats: 60,
      },
      {
        id: 'TKT010',
        from: 'Kolkata',
        to: 'Delhi',
        date: new Date(now + 2 * oneDay),
        price: 1100,
        type: 'flight',
        availableSeats: 50,
      },
      {
        id: 'TKT011',
        from: 'Bangalore',
        to: 'Mumbai',
        date: new Date(now + oneDay),
        price: 1400,
        type: 'flight',
        availableSeats: 40,
      },
      {
        id: 'TKT012',
        from: 'Chennai',
        to: 'Bangalore',
        date: new Date(now + 3 * oneDay),
        price: 450,
        type: 'train',
        availableSeats: 100,
      },
    ];
  }

  // Method to force refresh cache
  async refreshCache(): Promise<void> {
    console.log('🔄 Force refreshing cache...');
    localStorage.removeItem(this.CACHE_VERSION_KEY);
    await this.initializeSampleData();
  }

  // Method to get cache info
  getCacheInfo(): { version: string; isValid: boolean } {
    const version = localStorage.getItem(this.CACHE_VERSION_KEY) || 'none';
    return {
      version,
      isValid: version === this.CURRENT_VERSION,
    };
  }
}
