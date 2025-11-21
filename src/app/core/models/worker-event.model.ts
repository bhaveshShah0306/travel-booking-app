export interface WorkerEvent {
  type:
    | 'BOOKING_SAVED'
    | 'BOOKING_UPDATED'
    | 'BOOKING_DELETED'
    | 'STATS_CHANGED'
    | 'SYNC_PROGRESS'
    | 'SYNC_COMPLETED';
  data: any;
  timestamp: number;
}
