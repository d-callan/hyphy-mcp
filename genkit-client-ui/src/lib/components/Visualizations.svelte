<script lang="ts">
  import { onMount } from 'svelte';
  import { visualizationStore, type VisualizationInfo } from '$lib/stores/visualizationStore';
  import Modal from './Modal.svelte';
  // Import with type annotation to ensure TypeScript recognizes the props
import { default as VisualizationComponent } from './Visualization.svelte';
  // Force TypeScript to recognize the component's props
  type VisualizationProps = {
    jobId: string;
    vizId?: string;
    datasetId?: string | null;
  };
  
  // Props
  export let jobId: string;
  
  // Local state
  let visualizations: VisualizationInfo[] = [];
  let loading = true;
  let error: string | null = null;
  let showModal = false;
  let selectedVisualization: VisualizationInfo | null = null;
  
  // Load visualizations for the job
  async function loadVisualizations() {
    try {
      loading = true;
      error = null;
      visualizations = await visualizationStore.fetchJobVisualizations(jobId);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      error = `Failed to load visualizations: ${errorMessage}`;
      console.error(error);
    } finally {
      loading = false;
    }
  }
  
  // Open visualization in modal
  function openVisualization(viz: VisualizationInfo) {
    selectedVisualization = viz;
    showModal = true;
  }
  
  // Close modal
  function closeModal() {
    showModal = false;
    selectedVisualization = null;
  }
  
  // Watch for changes to jobId and reload visualizations
  $: if (jobId) {
    loadVisualizations();
  }
  
  onMount(() => {
    if (jobId) {
      loadVisualizations();
    }
  });
</script>

<div class="visualizations-container">
  <div class="visualizations-header">
    <h3>Visualizations for Job: {jobId}</h3>
  </div>
  
  {#if loading}
    <div class="loading">
      <p>Loading visualizations...</p>
    </div>
  {:else if error}
    <div class="error-message">
      <p>{error}</p>
    </div>
  {:else if visualizations.length === 0}
    <div class="coming-soon">
      <p>Visualizations for this job are coming soon!</p>
      <p class="sub-text">We're working on adding interactive visualizations to help you interpret your HyPhy analysis results.</p>
    </div>
  {:else}
    <div class="visualizations-grid">
      {#each visualizations as viz}
        <div class="visualization-card" on:click={() => openVisualization(viz)} on:keydown={(e) => e.key === 'Enter' && openVisualization(viz)} tabindex="0" role="button">
          <h4>{viz.title}</h4>
          <p>{viz.description || 'No description available'}</p>
          <div class="viz-preview">
            <span class="viz-type">{viz.type}</span>
            <span class="view-details">Click to view</span>
          </div>
          <div class="timestamp">
            <span>Created: {new Date(viz.timestamp).toLocaleString()}</span>
          </div>
        </div>
      {/each}
    </div>
  {/if}
  
  {#if showModal && selectedVisualization}
    <Modal on:close={closeModal}>
      <div slot="header">
        <h3>{selectedVisualization.title}</h3>
      </div>
      <div slot="content" class="modal-visualization-content">
        <VisualizationComponent jobId={selectedVisualization.jobId} vizId={selectedVisualization.vizId} />
      </div>
    </Modal>
  {/if}
</div>

<style>
  .visualizations-container {
    background-color: white;
    border-radius: 8px;
    padding: 1rem;
    height: 100%;
    overflow-y: auto;
  }
  
  .visualizations-header {
    margin-bottom: 1.5rem;
  }
  
  h3 {
    margin: 0;
    font-size: 1.25rem;
    color: #333;
  }
  
  .loading, .error-message, .coming-soon {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 2rem;
    text-align: center;
    height: calc(100% - 5rem);
  }
  
  .error-message {
    color: #c62828;
  }
  
  .coming-soon {
    color: #555;
  }
  
  .sub-text {
    font-size: 0.9rem;
    color: #777;
    max-width: 400px;
    margin-top: 0.5rem;
  }
  
  .visualizations-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
    gap: 1rem;
    padding: 1rem 0;
  }
  
  .visualization-card {
    background-color: #f9f9f9;
    border-radius: 6px;
    padding: 1rem;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    cursor: pointer;
    transition: transform 0.2s, box-shadow 0.2s;
  }
  
  .visualization-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  }
  
  .visualization-card:focus {
    outline: 2px solid #4285f4;
    outline-offset: 2px;
  }
  
  .visualization-card h4 {
    margin: 0 0 0.5rem 0;
    font-size: 1rem;
  }
  
  .visualization-card p {
    font-size: 0.9rem;
    color: #666;
    margin: 0 0 1rem 0;
  }
  
  .viz-preview {
    background-color: #e0e0e0;
    border-radius: 4px;
    height: 100px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    color: #555;
    margin-bottom: 0.75rem;
    position: relative;
  }
  
  .viz-type {
    font-weight: 500;
    margin-bottom: 0.5rem;
  }
  
  .view-details {
    font-size: 0.8rem;
    color: #4285f4;
  }
  
  .timestamp {
    font-size: 0.75rem;
    color: #888;
    text-align: right;
  }
  
  .modal-visualization-content {
    min-height: 400px;
    width: 100%;
    padding: 1rem;
  }
</style>
