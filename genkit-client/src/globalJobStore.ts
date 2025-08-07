import fs from 'fs';
import path from 'path';
import { logger } from '@genkit-ai/core/logging';
import { JobInfo } from './types';

/**
 * GlobalJobStore provides app-wide storage for jobs and datasets
 * independent of chat sessions
 */
export class GlobalJobStore {
  private filePath: string;
  private jobs: JobInfo[] = [];
  
  /**
   * Creates a new GlobalJobStore instance
   * @param directory Directory to store the global jobs file (default: './data')
   * @param filename Name of the jobs file (default: 'global-jobs.json')
   */
  constructor(directory = './data', filename = 'global-jobs.json') {
    // Ensure the data directory exists
    if (!fs.existsSync(directory)) {
      fs.mkdirSync(directory, { recursive: true });
    }
    
    this.filePath = path.join(directory, filename);
    this.loadJobs();
  }
  
  /**
   * Load jobs from the file
   */
  private loadJobs(): void {
    try {
      if (fs.existsSync(this.filePath)) {
        const content = fs.readFileSync(this.filePath, 'utf-8');
        this.jobs = JSON.parse(content) as JobInfo[];
        logger.info(`Loaded ${this.jobs.length} jobs from global store`);
      } else {
        this.jobs = [];
        logger.info('No global jobs file found, starting with empty job list');
      }
    } catch (error) {
      logger.error('Error loading global jobs:', error);
      this.jobs = [];
    }
  }
  
  /**
   * Save jobs to the file
   */
  private saveJobs(): void {
    try {
      fs.writeFileSync(this.filePath, JSON.stringify(this.jobs, null, 2));
      logger.info(`Saved ${this.jobs.length} jobs to global store`);
    } catch (error) {
      logger.error('Error saving global jobs:', error);
    }
  }
  
  /**
   * Add a job to the global store
   * @param jobInfo The job information
   * @returns True if the job was added successfully
   */
  addJob(jobInfo: JobInfo): boolean {
    try {
      // Check if job already exists
      const existingIndex = this.jobs.findIndex(job => job.jobId === jobInfo.jobId);
      
      if (existingIndex >= 0) {
        // Update existing job
        this.jobs[existingIndex] = {
          ...this.jobs[existingIndex],
          ...jobInfo,
          timestamp: Date.now() // Update timestamp
        };
        logger.info(`Updated job ${jobInfo.jobId} in global store`);
      } else {
        // Add new job
        this.jobs.push({
          ...jobInfo,
          timestamp: jobInfo.timestamp || Date.now()
        });
        logger.info(`Added job ${jobInfo.jobId} to global store`);
      }
      
      this.saveJobs();
      return true;
    } catch (error) {
      logger.error(`Error adding job to global store: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }
  
  /**
   * Get all jobs from the global store
   * @returns Array of job information
   */
  getAllJobs(): JobInfo[] {
    return [...this.jobs];
  }
  
  /**
   * Get a specific job by ID
   * @param jobId The job ID
   * @returns The job information or undefined if not found
   */
  getJob(jobId: string): JobInfo | undefined {
    return this.jobs.find(job => job.jobId === jobId);
  }
  
  /**
   * Update job status in the global store
   * @param jobId The job ID
   * @param status The new status
   * @param results Optional job results
   * @returns True if the job was updated successfully
   */
  updateJobStatus(
    jobId: string,
    status: string,
    results?: any
  ): boolean {
    try {
      // Find the job in the store
      const jobIndex = this.jobs.findIndex(job => job.jobId === jobId);
      if (jobIndex === -1) {
        logger.error(`Job ${jobId} not found in global store`);
        return false;
      }
      
      // Update the job status
      this.jobs[jobIndex].status = status;
      if (results) {
        this.jobs[jobIndex].results = results;
      }
      
      this.saveJobs();
      logger.info(`Updated job ${jobId} status to ${status} in global store`);
      return true;
    } catch (error) {
      logger.error(`Error updating job status in global store: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }
  
  /**
   * Delete a job from the global store
   * @param jobId The job ID
   * @returns True if the job was deleted successfully
   */
  deleteJob(jobId: string): boolean {
    try {
      const initialLength = this.jobs.length;
      this.jobs = this.jobs.filter(job => job.jobId !== jobId);
      
      if (this.jobs.length < initialLength) {
        this.saveJobs();
        logger.info(`Deleted job ${jobId} from global store`);
        return true;
      } else {
        logger.warn(`Job ${jobId} not found in global store, nothing to delete`);
        return false;
      }
    } catch (error) {
      logger.error(`Error deleting job from global store: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }
}

// Create and export a singleton instance
export const globalJobStore = new GlobalJobStore();
