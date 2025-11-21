// src/app/features/booking/booking.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormBuilder,
  FormGroup,
  FormArray,
  Validators,
  ReactiveFormsModule,
} from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { OfflineStorageService } from '../../core/services/offline-storage.service';
import { NetworkService } from '../../core/services/network.service';
import { Ticket } from '../../core/models/ticket.model';
import { Booking } from '../../core/models/booking.model';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-booking',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './booking.component.html',
  styleUrls: ['./booking.component.scss'],
})
export class BookingComponent implements OnInit, OnDestroy {
  // ✅ CRITICAL: Initialize form immediately to prevent template errors
  bookingForm: FormGroup;
  ticket: Ticket | null = null;
  isOnline = true;
  isSubmitting = false;

  private subscriptions: Subscription[] = [];

  constructor(
    private fb: FormBuilder,
    private route: ActivatedRoute,
    public router: Router,
    private offlineStorage: OfflineStorageService,
    private networkService: NetworkService
  ) {
    // ✅ CRITICAL: Initialize form in constructor BEFORE template renders
    this.bookingForm = this.fb.group({
      passengers: this.fb.array([this.createPassengerForm()]),
    });
  }

  async ngOnInit(): Promise<void> {
    // Form is already initialized in constructor

    // Monitor network status
    const networkSub = this.networkService.isOnline$.subscribe(
      (status): void => {
        this.isOnline = status;
      }
    );
    this.subscriptions.push(networkSub);

    // Load ticket data
    const ticketId = this.route.snapshot.paramMap.get('ticketId');
    if (ticketId) {
      const loadedTicket = await this.offlineStorage.getTicketById(ticketId);
      if (loadedTicket) {
        this.ticket = loadedTicket;
      } else {
        alert('❌ Ticket not found');
        this.router.navigate(['/']);
        return;
      }
    } else {
      alert('❌ Invalid ticket ID');
      this.router.navigate(['/']);
      return;
    }

    // Focus on main heading for accessibility
    setTimeout(() => {
      const mainHeading = document.querySelector('h1');
      if (mainHeading instanceof HTMLElement) {
        mainHeading.focus({ preventScroll: true });
      }
    }, 100);
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach((sub) => sub.unsubscribe());
  }

  private createPassengerForm(): FormGroup {
    return this.fb.group({
      name: ['', [Validators.required, Validators.minLength(3)]],
      age: ['', [Validators.required, Validators.min(1), Validators.max(120)]],
      gender: ['', Validators.required],
    });
  }

  get passengers(): FormArray {
    return this.bookingForm.get('passengers') as FormArray;
  }

  addPassenger(): void {
    if (this.passengers.length < 5) {
      this.passengers.push(this.createPassengerForm());
      this.announceToScreenReader(
        `Passenger ${this.passengers.length} form added. Please fill in the required details.`
      );
    }
  }

  removePassenger(index: number): void {
    if (this.passengers.length > 1) {
      this.passengers.removeAt(index);
      this.announceToScreenReader(
        `Passenger ${index + 1} removed. ${
          this.passengers.length
        } passenger(s) remaining.`
      );
    }
  }

  async submitBooking(): Promise<void> {
    if (this.bookingForm.invalid || !this.ticket) {
      this.announceToScreenReader(
        'Please fill all required fields before submitting'
      );
      this.markFormGroupTouched(this.bookingForm);
      return;
    }

    this.isSubmitting = true;

    const booking: Booking = {
      ticketId: this.ticket.id,
      passengers: this.bookingForm.value.passengers,
      totalAmount: this.ticket.price * this.passengers.length,
      status: 'pending',
      createdAt: new Date(),
      syncStatus: this.isOnline ? 'synced' : 'pending',
    };

    try {
      const bookingId = await this.offlineStorage.saveBooking(booking);

      const message = this.isOnline
        ? `✅ Booking confirmed! Booking ID: ${bookingId}`
        : `💾 Booking saved offline (ID: ${bookingId}). Will sync when online.`;

      this.announceToScreenReader(message);
      alert(message);
      this.router.navigate(['/my-bookings']);
    } catch (error) {
      const errorMessage = 'Failed to save booking';
      this.announceToScreenReader(errorMessage);
      alert(`❌ ${errorMessage}`);
      console.error(error);
    } finally {
      this.isSubmitting = false;
    }
  }

  getTotalAmount(): number {
    return this.ticket ? this.ticket.price * this.passengers.length : 0;
  }

  private announceToScreenReader(message: string): void {
    const announcement = document.createElement('div');
    announcement.setAttribute('role', 'status');
    announcement.setAttribute('aria-live', 'polite');
    announcement.setAttribute('aria-atomic', 'true');
    announcement.className = 'sr-only';
    announcement.textContent = message;
    document.body.appendChild(announcement);

    setTimeout(() => {
      announcement.remove();
    }, 1000);
  }

  private markFormGroupTouched(formGroup: FormGroup | FormArray): void {
    Object.keys(formGroup.controls).forEach((key) => {
      const control = formGroup.get(key);
      control?.markAsTouched();

      if (control instanceof FormGroup || control instanceof FormArray) {
        this.markFormGroupTouched(control);
      }
    });
  }
}
