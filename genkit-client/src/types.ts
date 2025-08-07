/**
 * Job information interface
 */
export interface JobInfo {
  jobId: string;
  method: string;
  status: string;
  timestamp: number;
  fileName?: string;
  treeName?: string;
  params?: Record<string, any>; // UI-friendly parameters with file paths
  payload?: Record<string, any>; // API payload with file handles for API communication
  results?: any;
}

/**
 * Session interface
 */
export interface Session {
  id: string;
  created: number;
  updated: number;
  messages: any[];
  jobs?: JobInfo[];
}

/**
 * Tool options interface with session
 */
export interface ToolOptions {
  session?: {
    id: string;
    [key: string]: any;
  };
  [key: string]: any;
}
