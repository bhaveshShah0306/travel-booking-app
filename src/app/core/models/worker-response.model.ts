import { WorkerMessageType } from './worker-message.model';
export interface WorkerResponse<T = unknown> {
  id: string;
  type: WorkerMessageType;
  success: boolean;
  data?: T;
  error?: string;
}
