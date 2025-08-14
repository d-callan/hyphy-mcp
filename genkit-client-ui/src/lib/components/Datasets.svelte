<script lang="ts">
  import { onMount, createEventDispatcher } from 'svelte';
  import { datasetStore, type DatasetInfo } from '$lib/stores/datasetStore';
  
  // Event dispatcher
  const dispatch = createEventDispatcher();
  
  // Track selected dataset ID
  let selectedDatasetId: string | null = null;
  
  // Local state
  let datasets: DatasetInfo[] = [];
  let loading = true;
  let error: string | null = null;
  let uploadingFile = false;
  
  // Format timestamp to readable date
  function formatDate(timestamp: number): string {
    return new Date(timestamp).toLocaleString();
  }
  
  // Format file size to human-readable format
  function formatFileSize(bytes: number | undefined): string {
    if (bytes === undefined) return 'Unknown';
    
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;
    
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    
    return `${size.toFixed(1)} ${units[unitIndex]}`;
  }
  
  // Load datasets
  async function loadDatasets() {
    try {
      loading = true;
      error = null;
      datasets = await datasetStore.fetchDatasets();
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      error = `Failed to load datasets: ${errorMessage}`;
      console.error(error);
    } finally {
      loading = false;
    }
  }
  
  // Handle file upload
  async function handleFileUpload(event: Event) {
    const input = event.target as HTMLInputElement;
    const files = input.files;
    
    if (!files || files.length === 0) {
      return;
    }
    
    const file = files[0];
    
    try {
      uploadingFile = true;
      // For now, assume it's just an alignment file
      const hasTree = file.name.toLowerCase().endsWith('.nwk') || file.name.toLowerCase().endsWith('.tree');
      const newDataset = await datasetStore.uploadDataset(file, hasTree);
      
      if (newDataset) {
        // Refresh datasets list
        await loadDatasets();
        // Select the newly uploaded dataset
        selectedDatasetId = newDataset.datasetId;
        dispatch('selectDataset', { datasetId: newDataset.datasetId });
      } else {
        alert('Failed to upload dataset');
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      alert(`Error uploading file: ${errorMessage}`);
    } finally {
      uploadingFile = false;
      // Reset the input
      input.value = '';
    }
  }
  
  // Handle dataset deletion
  async function deleteDataset(datasetId: string) {
    if (confirm('Are you sure you want to delete this dataset?')) {
      try {
        const success = await datasetStore.deleteDataset(datasetId);
        if (success) {
          // If the deleted dataset was selected, clear selection
          if (selectedDatasetId === datasetId) {
            selectedDatasetId = null;
            dispatch('selectDataset', { datasetId: null });
          }
          // Refresh datasets list
          await loadDatasets();
        } else {
          alert('Failed to delete dataset');
        }
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        alert(`Error deleting dataset: ${errorMessage}`);
      }
    }
  }
  
  onMount(() => {
    loadDatasets();
  });
</script>

<div class="datasets-container">
  <div class="datasets-header">
    <h3>Datasets</h3>
    <div class="upload-container">
      <label for="file-upload" class="upload-button">
        {#if uploadingFile}
          Uploading...
        {:else}
          Upload Dataset
        {/if}
      </label>
      <input 
        id="file-upload" 
        type="file" 
        accept=".fasta,.fas,.fa,.nex,.nexus,.nwk,.tree" 
        on:change={handleFileUpload}
        disabled={uploadingFile}
      />
    </div>
  </div>
  
  {#if error}
    <div class="error-message">
      <p>{error}</p>
    </div>
  {/if}
  
  {#if loading}
    <div class="loading">
      <p>Loading datasets...</p>
    </div>
  {:else if datasets.length === 0}
    <div class="empty-state">
      <p>No datasets found</p>
      <p class="sub-text">Upload a FASTA alignment file to get started</p>
    </div>
  {:else}
    <div class="datasets-list">
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Sequences</th>
            <th>Size</th>
            <th>Uploaded</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {#each datasets as dataset (dataset.datasetId)}
            <tr 
              class="dataset-row {selectedDatasetId === dataset.datasetId ? 'selected' : ''}"
              on:click={() => {
                selectedDatasetId = dataset.datasetId;
                dispatch('selectDataset', { datasetId: dataset.datasetId });
              }}
            >
              <td>{dataset.name}</td>
              <td>
                {#if dataset.hasAlignment && dataset.hasTree}
                  Alignment + Tree
                {:else if dataset.hasAlignment}
                  Alignment
                {:else if dataset.hasTree}
                  Tree
                {:else}
                  Unknown
                {/if}
              </td>
              <td>{dataset.sequenceCount || 'N/A'}</td>
              <td>{formatFileSize(dataset.fileSize)}</td>
              <td>{formatDate(dataset.timestamp)}</td>
              <td class="actions">
                <button 
                  class="action-button view-button" 
                  title="View Dataset"
                  on:click|stopPropagation={() => {
                    selectedDatasetId = dataset.datasetId;
                    dispatch('selectDataset', { datasetId: dataset.datasetId });
                  }}
                >
                  View
                </button>
                <button 
                  class="action-button delete-button" 
                  on:click|stopPropagation={() => deleteDataset(dataset.datasetId)}
                  title="Delete Dataset"
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
  .datasets-container {
    background-color: white;
    border-radius: 8px;
    padding: 1rem;
    height: 100%;
  }
  
  .datasets-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1.5rem;
  }
  
  h3 {
    margin: 0;
    font-size: 1.25rem;
    color: #333;
  }
  
  .upload-container {
    position: relative;
  }
  
  .upload-button {
    display: inline-block;
    background-color: #4a90e2;
    color: white;
    padding: 0.5rem 1rem;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.9rem;
  }
  
  .upload-button:hover {
    background-color: #3a80d2;
  }
  
  input[type="file"] {
    position: absolute;
    width: 0.1px;
    height: 0.1px;
    opacity: 0;
    overflow: hidden;
    z-index: -1;
  }
  
  .loading, .error-message, .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 2rem;
    text-align: center;
  }
  
  .error-message {
    color: #c62828;
  }
  
  .empty-state {
    color: #555;
  }
  
  .sub-text {
    font-size: 0.9rem;
    color: #777;
    margin-top: 0.5rem;
  }
  
  .datasets-list {
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
  
  .dataset-row {
    cursor: pointer;
    transition: background-color 0.2s;
  }
  
  .dataset-row:hover {
    background-color: #f5f5f5;
  }
  
  .dataset-row.selected {
    background-color: #e3f2fd;
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
