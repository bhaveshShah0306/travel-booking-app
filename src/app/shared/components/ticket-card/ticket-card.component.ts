// src/app/shared/components/ticket-card/ticket-card.component.ts
import { Component, Input, ViewEncapsulation } from '@angular/core';
import { Ticket } from '../../../core/models/ticket.model';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-ticket-card',
  templateUrl: './ticket-card.component.html',
  styleUrls: ['./ticket-card.component.scss'],
  imports: [CommonModule],
  // Shadow DOM creates a boundary - styles from outside can't get in
  standalone: true,
  encapsulation: ViewEncapsulation.ShadowDom,
})
export class TicketCardComponent {
  @Input() ticket!: Ticket;

  onBookTicket(): void {
    console.log('Booking ticket:', this.ticket.id);
  }
}
