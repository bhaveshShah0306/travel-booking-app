export interface SyncStatus {
  isSyncing: boolean;
  lastSyncTime: Date | null;
  pendingCount: number;
  failedCount: number;
  syncErrors: string[];
}
