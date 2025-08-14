import { writable } from 'svelte/store';

// Define JobInfo interface to match backend type
export interface JobInfo {
  jobId: string;
  method: string;
  status: string;
  timestamp: number;
  filename?: string;
  datasetId?: string;
  payload?: Record<string, any>;
  results?: any;
}

// API endpoints
const API_BASE = 'http://localhost:3000'; // Update with actual API base URL
const ENDPOINTS = {
  JOBS: `${API_BASE}/api/jobs`,
  JOB: (id: string) => `${API_BASE}/api/jobs/${id}`,
  JOB_STATUS: (id: string) => `${API_BASE}/api/jobs/${id}/status`,
  JOB_RESULTS: (id: string) => `${API_BASE}/api/jobs/${id}/results`,
  DATASET_JOBS: (datasetId: string) => `${API_BASE}/api/datasets/${datasetId}/jobs`
};

// Create a writable store for jobs
const createJobStore = () => {
  const { subscribe, set, update } = writable<JobInfo[]>([]);
  
  // Load jobs from localStorage on initialization
  const loadFromLocalStorage = (): JobInfo[] => {
    if (typeof localStorage !== 'undefined') {
      const storedJobs = localStorage.getItem('hyphy_jobs');
      return storedJobs ? JSON.parse(storedJobs) : [];
    }
    return [];
  };
  
  // Save jobs to localStorage
  const saveToLocalStorage = (jobs: JobInfo[]): void => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('hyphy_jobs', JSON.stringify(jobs));
    }
  };
  
  // Initialize store with jobs from localStorage
  const init = () => {
    const localJobs = loadFromLocalStorage();
    set(localJobs);
    
    // Sync with backend on initialization
    fetchJobs();
  };
  
  // Fetch all jobs
  const fetchJobs = async (datasetId?: string): Promise<JobInfo[]> => {
    try {
      // Fetch jobs from the backend API
      const endpoint = datasetId ? ENDPOINTS.DATASET_JOBS(datasetId) : ENDPOINTS.JOBS;
      const response = await fetch(endpoint);
      if (!response.ok) {
        throw new Error(`Failed to fetch jobs: ${response.statusText}`);
      }
      
      const data = await response.json();
      const jobs: JobInfo[] = data.jobs || [];
      
      // Update store and localStorage
      if (!datasetId) {
        // Only update the full store if we're fetching all jobs
        set(jobs);
        saveToLocalStorage(jobs);
      }
      
      return jobs;
    } catch (error) {
      console.error('Error fetching jobs:', error);
      const allJobs = loadFromLocalStorage();
      
      // If datasetId is provided, filter jobs by dataset
      if (datasetId) {
        return allJobs.filter(job => job.datasetId === datasetId);
      }
      
      return allJobs; // Fallback to local cache
    }
  };
  
  // Add a new job
  const addJob = async (job: Partial<JobInfo>): Promise<JobInfo> => {
    try {
      // Send job to backend API
      const response = await fetch(ENDPOINTS.JOBS, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(job)
      });
      
      if (!response.ok) {
        throw new Error(`Failed to add job: ${response.statusText}`);
      }
      
      const data = await response.json();
      const newJob = data.job;
      
      // Fallback to local creation if API doesn't return a job
      if (!newJob) {
        console.warn('API did not return a job object, creating locally');
        const localJob: JobInfo = {
          ...job,
          jobId: `job_${Date.now()}`,
          timestamp: Date.now(),
          status: 'pending',
          datasetId: job.datasetId || '',
          method: job.method || 'unknown' // Ensure required fields are present
        };
        
        // Update local store
        update(jobs => {
          const updatedJobs = [...jobs, localJob];
          saveToLocalStorage(updatedJobs);
          return updatedJobs;
        });
        
        return localJob;
      }
      
      // Update local store with API response
      update(jobs => {
        const updatedJobs = [...jobs, newJob];
        saveToLocalStorage(updatedJobs);
        return updatedJobs;
      });
      
      return newJob;
    } catch (error) {
      console.error('Error adding job:', error);
      
      // Fallback to local creation on API error
      const localJob: JobInfo = {
        ...job,
        jobId: `job_${Date.now()}`,
        timestamp: Date.now(),
        status: 'pending',
        datasetId: job.datasetId || '',
        method: job.method || 'unknown' // Ensure required fields are present
      };
      
      // Update local store
      update(jobs => {
        const updatedJobs = [...jobs, localJob];
        saveToLocalStorage(updatedJobs);
        return updatedJobs;
      });
      
      return localJob;
    }
  };
  
  // Update job status
  const updateJobStatus = async (jobId: string, status: string, results?: any): Promise<boolean> => {
    try {
      const response = await fetch(ENDPOINTS.JOB_STATUS(jobId), {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ status, results })
      });
      
      if (!response.ok) {
        throw new Error(`Failed to update job status: ${response.statusText}`);
      }
      
      // Update local store
      update(jobs => {
        const index = jobs.findIndex(job => job.jobId === jobId);
        
        if (index >= 0) {
          const updatedJobs = [...jobs];
          updatedJobs[index] = { 
            ...updatedJobs[index], 
            status,
            ...(results && { results })
          };
          saveToLocalStorage(updatedJobs);
          return updatedJobs;
        }
        
        return jobs;
      });
      
      return true;
    } catch (error) {
      console.error('Error updating job status:', error);
      return false;
    }
  };
  
  // Delete a job
  const deleteJob = async (jobId: string): Promise<boolean> => {
    try {
      // Try to delete from API first
      const response = await fetch(ENDPOINTS.JOB(jobId), {
        method: 'DELETE'
      });
      
      if (!response.ok) {
        console.warn(`API error deleting job: ${response.statusText}, proceeding with local deletion`);
      }
      
      // Always update local store regardless of API success
      // This ensures UI is updated even if API fails
      update(jobs => {
        const updatedJobs = jobs.filter(job => job.jobId !== jobId);
        saveToLocalStorage(updatedJobs);
        return updatedJobs;
      });
      
      return true;
    } catch (error) {
      console.error('Error deleting job:', error);
      
      // Still update local store on API error
      update(jobs => {
        const updatedJobs = jobs.filter(job => job.jobId !== jobId);
        saveToLocalStorage(updatedJobs);
        return updatedJobs;
      });
      
      return true; // Return true since local deletion succeeded
    }
  };
  
  // Initialize the store
  init();
  
  // Update an existing job
  const updateJob = async (jobId: string, updates: Partial<JobInfo>): Promise<boolean> => {
    try {
      // Send update to backend API
      const response = await fetch(ENDPOINTS.JOB(jobId), {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(updates)
      });
      
      if (!response.ok) {
        console.warn(`API error updating job: ${response.statusText}, falling back to local update`);
      }
      
      // Update local store regardless of API success
      // This ensures UI is updated even if API fails
      update(jobs => {
        const index = jobs.findIndex(job => job.jobId === jobId);
        
        if (index >= 0) {
          const updatedJobs = [...jobs];
          updatedJobs[index] = { ...updatedJobs[index], ...updates };
          saveToLocalStorage(updatedJobs);
          return updatedJobs;
        }
        
        return jobs;
      });
      
      return true;
    } catch (error) {
      console.error(`Error updating job ${jobId}:`, error);
      
      // Still update local store on API error
      update(jobs => {
        const index = jobs.findIndex(job => job.jobId === jobId);
        
        if (index >= 0) {
          const updatedJobs = [...jobs];
          updatedJobs[index] = { ...updatedJobs[index], ...updates };
          saveToLocalStorage(updatedJobs);
          return updatedJobs;
        }
        
        return jobs;
      });
      
      return true; // Return true since local update succeeded
    }
  };
  
  // Fetch job results
  const fetchJobResults = async (jobId: string): Promise<any> => {
    try {
      // Try to fetch from API first
      const response = await fetch(ENDPOINTS.JOB_RESULTS(jobId));
      if (response.ok) {
        const data = await response.json();
        if (data.results) {
          // Update local storage with the latest results
          update(jobs => {
            const index = jobs.findIndex(job => job.jobId === jobId);
            if (index >= 0) {
              const updatedJobs = [...jobs];
              updatedJobs[index] = { ...updatedJobs[index], results: data.results };
              saveToLocalStorage(updatedJobs);
              return updatedJobs;
            }
            return jobs;
          });
          
          return data.results;
        }
      }
      
      console.warn(`API fetch for job results failed or returned no results, falling back to local storage`);
      
      // Fallback to local storage
      const allJobs = loadFromLocalStorage();
      const job = allJobs.find(j => j.jobId === jobId);
      return job?.results || null;
    } catch (error) {
      console.error(`Error fetching job results for ${jobId}:`, error);
      
      // Fallback to local storage on error
      const allJobs = loadFromLocalStorage();
      const job = allJobs.find(j => j.jobId === jobId);
      return job?.results || null;
    }
  };
  
  // Add or update a job (for backward compatibility)
  const addOrUpdateJob = async (jobInfo: JobInfo): Promise<boolean> => {
    try {
      // If job has an ID, update it, otherwise add it
      if (jobInfo.jobId) {
        await updateJob(jobInfo.jobId, jobInfo);
      } else {
        await addJob(jobInfo);
      }
      return true;
    } catch (error) {
      console.error('Error in addOrUpdateJob:', error);
      return false;
    }
  };

  return {
    subscribe,
    fetchJobs,
    addJob,
    updateJobStatus,
    deleteJob,
    addOrUpdateJob,
    fetchJobResults
  };
};

// Export the store
export const jobStore = createJobStore();
