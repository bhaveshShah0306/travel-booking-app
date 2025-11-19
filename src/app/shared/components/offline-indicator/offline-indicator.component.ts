// src/app/shared/components/offline-indicator/offline-indicator.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { Subscription } from 'rxjs';
import { NetworkService } from '../../../core/services/network.service';
import { SyncService, SyncStatus } from '../../../core/services/sync.service';

@Component({
  selector: 'app-offline-indicator',
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
    // Monitor network status
    const networkSub = this.networkService.isOnline$.subscribe((status) => {
      this.isOnline = status;
    });
    this.subscriptions.push(networkSub);

    // Monitor sync status
    const syncSub = this.syncService
      .getSyncStatus()
      .subscribe((status: SyncStatus) => {
        this.pendingCount = status.pendingCount;
        this.isSyncing = status.isSyncing;
      });
    this.subscriptions.push(syncSub);

    // Initial update
    await this.syncService.updatePendingCount();
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach((sub) => sub.unsubscribe());
  }
}
