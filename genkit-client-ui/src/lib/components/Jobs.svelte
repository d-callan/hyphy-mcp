<script lang="ts">
  import { onMount, createEventDispatcher } from 'svelte';
  import { jobStore, type JobInfo } from '$lib/stores/jobStore';
  
  // Event dispatcher
  const dispatch = createEventDispatcher();
  
  // Props
  export let datasetId: string | null = null;
  
  // Track selected job ID
  let selectedJobId: string | null = null;

  // Local state
  let jobs: JobInfo[] = [];
  let filteredJobs: JobInfo[] = [];
  let loading = true;
  let error: string | null = null;
  let refreshInterval: ReturnType<typeof setInterval> | undefined;

  // Format timestamp to readable date
  function formatDate(timestamp: number): string {
    return new Date(timestamp).toLocaleString();
  }

  // Get status badge class based on job status
  function getStatusClass(status: string): string {
    switch (status.toLowerCase()) {
      case 'completed':
      case 'success':
        return 'status-success';
      case 'running':
      case 'pending':
        return 'status-pending';
      case 'failed':
      case 'error':
        return 'status-error';
      default:
        return 'status-default';
    }
  }

  // Filter jobs by dataset ID
  function filterJobsByDataset() {
    if (!datasetId) {
      filteredJobs = jobs;
    } else {
      filteredJobs = jobs.filter(job => job.datasetId === datasetId);
    }
  }
  
  // Watch for changes to datasetId and filter jobs
  $: if (jobs) {
    filterJobsByDataset();
  }
  
  // Load jobs on component mount
  onMount(() => {
    const loadJobs = async () => {
      try {
        loading = true;
        jobs = await jobStore.fetchJobs();
        filterJobsByDataset();
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        error = `Failed to load jobs: ${errorMessage}`;
        console.error(error);
      } finally {
        loading = false;
      }
    };
    
    loadJobs();

    // Set up auto-refresh every 30 seconds
    refreshInterval = setInterval(async () => {
      try {
        jobs = await jobStore.fetchJobs();
        filterJobsByDataset();
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        console.error(`Auto-refresh error: ${errorMessage}`);
      }
    }, 30000);

    // Clean up interval on component destroy
    return () => {
      if (refreshInterval) clearInterval(refreshInterval);
    };
  });

  // Handle manual refresh
  async function refreshJobs(): Promise<void> {
    try {
      loading = true;
      jobs = await jobStore.fetchJobs();
      filterJobsByDataset();
      error = null;
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      error = `Failed to refresh jobs: ${errorMessage}`;
      console.error(error);
    } finally {
      loading = false;
    }
  }

  // Handle job deletion
  async function deleteJob(jobId: string): Promise<void> {
    if (confirm('Are you sure you want to delete this job?')) {
      try {
        const success = await jobStore.deleteJob(jobId);
        if (success) {
          jobs = jobs.filter(job => job.jobId !== jobId);
        } else {
          alert('Failed to delete job');
        }
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        alert(`Error deleting job: ${errorMessage}`);
      }
    }
  }
</script>

<div class="jobs-container">
  <div class="jobs-header">
    <h2>Jobs</h2>
    <button class="refresh-button" on:click={refreshJobs} disabled={loading}>
      {#if loading}
        Loading...
      {:else}
        Refresh
      {/if}
    </button>
  </div>

  {#if error}
    <div class="error-message">
      {error}
    </div>
  {/if}

  {#if filteredJobs.length === 0 && !loading}
    <div class="empty-state">
      {#if datasetId}
        <p>No jobs found for this dataset</p>
        <p class="sub-text">Select a method and run a new job</p>
      {:else}
        <p>No jobs found</p>
      {/if}
    </div>
  {:else}
    <div class="jobs-list">
      <table>
        <thead>
          <tr>
            <th>Job ID</th>
            <th>Method</th>
            <th>Status</th>
            <th>Created</th>
            <th>File</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {#each filteredJobs as job (job.jobId)}
            <tr 
              class="job-row {selectedJobId === job.jobId ? 'selected' : ''}"
              on:click={() => {
                // Select this job and emit the event
                selectedJobId = job.jobId;
                dispatch('selectJob', { jobId: job.jobId });
              }}
            >
              <td>{job.jobId}</td>
              <td>{job.method}</td>
              <td>
                <span class={`status-badge ${getStatusClass(job.status)}`}>
                  {job.status}
                </span>
              </td>
              <td>{formatDate(job.timestamp)}</td>
              <td>{job.filename || 'N/A'}</td>
              <td class="actions">
                <button 
                  class="action-button view-button" 
                  title="View Results"
                  on:click|stopPropagation={() => {
                    // Select this job and emit the event
                    dispatch('selectJob', { jobId: job.jobId });
                  }}
                >
                  View
                </button>
                <button 
                  class="action-button delete-button" 
                  on:click|stopPropagation={() => deleteJob(job.jobId)}
                  title="Delete Job"
                >
                  Delete
                </button>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>

<style>
  .jobs-container {
    background-color: white;
    border-radius: 8px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    padding: 1.5rem;
    margin-bottom: 2rem;
  }

  .jobs-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1.5rem;
  }

  h2 {
    margin: 0;
    font-size: 1.5rem;
    color: #333;
  }

  .refresh-button {
    background-color: #4a90e2;
    color: white;
    border: none;
    border-radius: 4px;
    padding: 0.5rem 1rem;
    cursor: pointer;
    font-size: 0.9rem;
  }

  .refresh-button:hover {
    background-color: #3a80d2;
  }

  .refresh-button:disabled {
    background-color: #cccccc;
    cursor: not-allowed;
  }

  .error-message {
    background-color: #ffebee;
    color: #c62828;
    padding: 1rem;
    border-radius: 4px;
    margin-bottom: 1rem;
  }

  .empty-state {
    text-align: center;
    padding: 2rem;
    color: #666;
    font-style: italic;
  }
  
  .sub-text {
    font-size: 0.9rem;
    color: #777;
    margin-top: 0.5rem;
  }

  .jobs-list {
    overflow-x: auto;
  }

  table {
    width: 100%;
    border-collapse: collapse;
  }

  th, td {
    padding: 0.75rem 1rem;
    text-align: left;
    border-bottom: 1px solid #eee;
  }

  th {
    font-weight: 600;
    color: #333;
    background-color: #f9f9f9;
  }
  
  .job-row {
    cursor: pointer;
    transition: background-color 0.2s;
  }
  
  .job-row:hover {
    background-color: #f5f5f5;
  }
  
  .job-row.selected {
    background-color: #e3f2fd;
  }

  .status-badge {
    display: inline-block;
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
    font-size: 0.8rem;
    font-weight: 500;
  }

  .status-success {
    background-color: #e8f5e9;
    color: #2e7d32;
  }

  .status-pending {
    background-color: #fff8e1;
    color: #f57c00;
  }

  .status-error {
    background-color: #ffebee;
    color: #c62828;
  }

  .status-default {
    background-color: #e0e0e0;
    color: #616161;
  }

  .actions {
    display: flex;
    gap: 0.5rem;
  }

  .action-button {
    border: none;
    border-radius: 4px;
    padding: 0.25rem 0.5rem;
    font-size: 0.8rem;
    cursor: pointer;
  }

  .view-button {
    background-color: #e3f2fd;
    color: #1565c0;
  }

  .view-button:hover {
    background-color: #bbdefb;
  }

  .delete-button {
    background-color: #ffebee;
    color: #c62828;
  }

  .delete-button:hover {
    background-color: #ffcdd2;
  }
</style>
