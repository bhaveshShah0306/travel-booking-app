// src/app/features/search/search.component.ts
import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import {
  FormBuilder,
  FormGroup,
  Validators,
  ReactiveFormsModule,
} from '@angular/forms';
import { OfflineStorageService } from '../../core/services/offline-storage.service';
import { NetworkService } from '../../core/services/network.service';
import { Ticket } from '../../core/models/ticket.model';

@Component({
  selector: 'app-search',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './search.component.html',
  styleUrls: ['./search.component.scss'],
})
export class SearchComponent implements OnInit {
  tickets: Ticket[] = [];
  filteredTickets: Ticket[] = [];
  searchForm!: FormGroup;
  isOnline = true;
  isLoading = false;

  popularRoutes = [
    { from: 'Delhi', to: 'Mumbai' },
    { from: 'Delhi', to: 'Bangalore' },
    { from: 'Mumbai', to: 'Goa' },
    { from: 'Bangalore', to: 'Chennai' },
  ];

  cities = [
    'Delhi',
    'Mumbai',
    'Bangalore',
    'Chennai',
    'Kolkata',
    'Hyderabad',
    'Pune',
    'Ahmedabad',
    'Jaipur',
    'Goa',
    'Lucknow',
    'Kochi',
  ];

  selectedType: 'all' | 'bus' | 'train' | 'flight' = 'all';
  sortBy: 'price' | 'date' | 'seats' = 'price';

  constructor(
    public router: Router,
    private fb: FormBuilder,
    private offlineStorage: OfflineStorageService,
    private networkService: NetworkService
  ) {}

  async ngOnInit(): Promise<void> {
    this.initSearchForm();
    await this.loadTickets();
    this.monitorNetwork();
  }

  private initSearchForm(): void {
    this.searchForm = this.fb.group({
      from: ['', Validators.required],
      to: ['', Validators.required],
      date: ['', Validators.required],
    });
  }

  private async loadTickets(): Promise<void> {
    this.isLoading = true;
    try {
      this.tickets = await this.offlineStorage.getCachedTickets();
      this.filteredTickets = [...this.tickets];
      this.applyFiltersAndSort();
    } catch (error) {
      console.error('Failed to load tickets:', error);
    } finally {
      this.isLoading = false;
    }
  }

  private monitorNetwork(): void {
    this.networkService.isOnline$.subscribe((status) => {
      this.isOnline = status;
    });
  }

  async onSearch(): Promise<void> {
    if (this.searchForm.invalid) {
      this.markFormGroupTouched(this.searchForm);
      return;
    }

    this.isLoading = true;
    const { from, to, date } = this.searchForm.value;

    try {
      const searchDate = date ? new Date(date) : undefined;
      const results = await this.offlineStorage.searchTickets(
        from,
        to,
        searchDate
      );

      this.filteredTickets = results;
      this.applyFiltersAndSort();

      if (results.length === 0) {
        alert('🔍 No tickets found for this route');
      }
    } catch (error) {
      console.error('Search failed:', error);
      alert('❌ Search failed. Please try again.');
    } finally {
      this.isLoading = false;
    }
  }

  quickSearch(route: { from: string; to: string }): void {
    this.searchForm.patchValue({
      from: route.from,
      to: route.to,
      date: new Date().toISOString().split('T')[0],
    });
    this.onSearch();
  }

  clearSearch(): void {
    this.searchForm.reset();
    this.filteredTickets = [...this.tickets];
    this.selectedType = 'all';
    this.applyFiltersAndSort();
  }

  filterByType(type: 'all' | 'bus' | 'train' | 'flight'): void {
    this.selectedType = type;
    this.applyFiltersAndSort();
  }

  sortTickets(sortBy: 'price' | 'date' | 'seats'): void {
    this.sortBy = sortBy;
    this.applyFiltersAndSort();
  }

  private applyFiltersAndSort(): void {
    let result = [...this.filteredTickets];

    if (this.selectedType !== 'all') {
      result = result.filter((ticket) => ticket.type === this.selectedType);
    }

    result.sort((a, b) => {
      switch (this.sortBy) {
        case 'price':
          return a.price - b.price;
        case 'date':
          return new Date(a.date).getTime() - new Date(b.date).getTime();
        case 'seats':
          return b.availableSeats - a.availableSeats;
        default:
          return 0;
      }
    });

    this.filteredTickets = result;
  }

  bookTicket(ticket: Ticket): void {
    if (ticket.availableSeats === 0) {
      alert('❌ No seats available for this ticket');
      return;
    }
    this.router.navigate(['/booking', ticket.id]);
  }

  getTicketIcon(type: string): string {
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

  private markFormGroupTouched(formGroup: FormGroup): void {
    Object.keys(formGroup.controls).forEach((key) => {
      const control = formGroup.get(key);
      control?.markAsTouched();
    });
  }

  get minDate(): string {
    return new Date().toISOString().split('T')[0];
  }

  get f() {
    return this.searchForm.controls;
  }
}
