// src/app/shared/components/offline-indicator/offline-indicator.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { NetworkService } from '../../../core/services/network.service';
import { SyncService } from '../../../core/services/sync.service';
import { SyncStatus } from '../../../core/models/syncstatus.model';

@Component({
  selector: 'app-offline-indicator',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './offline-indicator.component.html',
  styleUrls: ['./offline-indicator.component.scss'],
})
export class OfflineIndicatorComponent implements OnInit, OnDestroy {
  isOnline = true;
  pendingCount = 0;
  isSyncing = false;

  private subscriptions: Subscription[] = [];

  constructor(
    private networkService: NetworkService,
    private syncService: SyncService
  ) {}

  async ngOnInit(): Promise<void> {
    const networkSub = this.networkService.isOnline$.subscribe((status) => {
      this.isOnline = status;
    });
    this.subscriptions.push(networkSub);

    const syncSub = this.syncService
      .getSyncStatus()
      .subscribe((status: SyncStatus) => {
        this.pendingCount = status.pendingCount;
        this.isSyncing = status.isSyncing;
      });
    this.subscriptions.push(syncSub);

    await this.syncService.updatePendingCount();
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach((sub) => sub.unsubscribe());
  }
}
