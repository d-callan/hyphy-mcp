/**
 * Shared TypeScript interfaces for HyPhy MCP
 */

export interface HyphyMethod {
  name: string;
  full_name: string;
  description: string;
}

export interface FileUploadResult {
  status: 'success' | 'error';
  file_handle?: string;
  file_name?: string;
  file_size?: number;
  error?: string;
}

export interface JobResult {
  status: 'success' | 'error' | 'running';
  job_id?: string;
  message?: string;
  error?: string;
  input?: {
    method?: string;
    alignment?: string;
    tree?: string;
    [key: string]: any;
  };
  results?: any;
}

export interface ApiStatus {
  status: 'connected' | 'error';
  url?: string;
  version?: string;
  error?: string;
}
