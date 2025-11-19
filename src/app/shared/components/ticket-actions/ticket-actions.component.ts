// src/app/shared/components/ticket-actions/ticket-actions.component.ts
import {
  Component,
  Input,
  Output,
  EventEmitter,
  ViewEncapsulation,
} from '@angular/core';

@Component({
  selector: 'app-ticket-actions',
  templateUrl: './ticket-actions.component.html',
  styleUrls: ['./ticket-actions.component.scss'],

  // NONE encapsulation - styles become global within the shadow boundary
  encapsulation: ViewEncapsulation.None,
})
export class TicketActionsComponent {
  @Input() ticketType!: 'bus' | 'train' | 'flight';
  @Input() price!: number;
  @Input() availableSeats!: number;
  @Output() book = new EventEmitter<void>();
}
