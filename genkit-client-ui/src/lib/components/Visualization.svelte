<script lang="ts">
  import { onMount } from 'svelte';
  import vegaEmbed from 'vega-embed';
  import { visualizationStore } from '../stores/visualizationStore';
  
  // Props
  export let jobId: string;
  export let vizId: string | null = null;
  
  // State
  let loading = true;
  let error: string | null = null;
  let jobInfo: any = null;
  let visualizations: any[] = [];
  
  // Registry for method names
  let hyphyEyeRegistry: any = null;
  let registryMethods: any[] = [];
  
  // Store DOM container references
  let domContainers: Record<string, HTMLElement> = {};
  
  // Define interfaces for visualization data
  interface VisualizationComponent {
    name: string;
    description: string;
    component: string;
    glyph: string;
    category: string;
    outputType: string;
    options?: Record<string, any>;
  }
  
  interface HyPhyMethod {
    name: string;
    visualizations: VisualizationComponent[];
  }
  
  // Define job info interface
  interface JobInfo {
    id: string;
    method: string;
    status: string;
    results?: any;
  }
  
  // Define visualization info interface
  interface VisualizationInfo {
    id: string;
    jobId: string;
    title: string;
    description: string;
    component: string;
    data: any;
    options: Record<string, any>;
    outputType: string;
    createdAt: string;
    updatedAt: string;
  }
  
  onMount(async () => {
    try {
      loading = true;
      
      // Fetch job info to get the method
      const API_BASE = 'http://localhost:3000'; // Match the base URL used in visualizationStore
      const response = await fetch(`${API_BASE}/api/jobs/${jobId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch job information');
      }
      const responseData = await response.json();
      
      // Handle both direct job object and wrapped response formats
      if (responseData.success && responseData.job) {
        // API returns { success: true, job: {...} }
        jobInfo = responseData.job;
      } else {
        // API returns job object directly
        jobInfo = responseData;
      }
      
      // Fetch registry methods
      async function fetchRegistryMethods() {
        try {
          const response = await fetch(`${API_BASE}/api/registry/methods`);
          if (!response.ok) {
            throw new Error(`Failed to fetch registry methods: ${response.status}`);
          }
          const methods = await response.json();
          console.log('Registry methods:', methods);
          return methods;
        } catch (e) {
          console.error('Error fetching registry methods:', e);
          return [];
        }
      }
      
      const methodsData = await fetchRegistryMethods();
      registryMethods = methodsData.methods || [];
      
      let fetchedVisualizations;
      
      // If vizId is provided, fetch only that specific visualization
      if (vizId) {
        try {
          const vizResponse = await fetch(`${API_BASE}/api/visualizations/${vizId}`);
          if (!vizResponse.ok) {
            throw new Error(`Failed to fetch visualization with ID ${vizId}`);
          }
          const vizData = await vizResponse.json();
          fetchedVisualizations = [vizData];
        } catch (vizError) {
          console.error(`Error fetching visualization ${vizId}:`, vizError);
          // Fall back to fetching all visualizations for the job
          fetchedVisualizations = await visualizationStore.fetchJobVisualizations(jobId);
          // Filter to find the requested visualization
          fetchedVisualizations = fetchedVisualizations.filter(v => v.vizId === vizId);
        }
      } else {
        // Fetch all visualizations for this job
        fetchedVisualizations = await visualizationStore.fetchJobVisualizations(jobId);
      }
      console.log("fetched viz: ", fetchedVisualizations)
      // Ensure all required properties are present in each visualization
      visualizations = fetchedVisualizations.map(viz => {
        console.log('Processing visualization:', viz.visualization);
        // Extract component from metadata if available, otherwise use viz.component
        const component = viz.visualization.component || (viz.visualization.metadata && viz.visualization.metadata.component) || 'TileTable';
        const data = viz.visualization.data?.results || viz.visualization.data
        console.log("data: ", data)

        // Determine output type based on component or type
        let outputType = 'dom-element'; // Default output type
        
        // Check if this is a custom Vega visualization from the agent
        if (component === 'VegaLiteVisualization' || viz.type === 'vega-spec') {
          outputType = 'vega-spec';
        }

       
        return {
          id: viz.vizId,
          jobId: viz.jobId,
          title: viz.title || 'Visualization',
          description: viz.description || '',
          component,
          data,  // Using the data variable defined above to handle both hyphy-eye and custom vizs
          options: viz.config || {},
          outputType,
          createdAt: new Date(viz.timestamp || Date.now()).toISOString(),
          updatedAt: new Date(viz.timestamp || Date.now()).toISOString()
        };
      });
      
      loading = false;
    } catch (err: any) {
      error = err.message || 'Failed to load visualizations';
      loading = false;
    }
  });
  
  // Generate visualization using hyphy-eye
  async function generateVisualization(componentType: string, data: any, method: any, options: Record<string, any> = {}): Promise<{ result: any, outputType: string } | null> {
    // Handle custom Vega plots
    if (componentType == "VegaLiteVisualization") {
      
      return { result: data, outputType: 'vega-spec'};
    }

    try {
      console.log(`Generating visualization for ${componentType} with method:`, method);
      
      // Mapping from backend method names (lowercase) to hyphy-eye method names (uppercase)
      const methodNameMapping: Record<string, string> = {
        'busted': 'BUSTED',
        'absrel': 'aBSREL',
        'fel': 'FEL',
        'meme': 'MEME',
        'multihit': 'MULTIHIT',
        'gard': 'GARD',
        'nrm': 'NRM',
      };

      // Extract method name from jobInfo.method (which could be a string or an object)
      let methodName = '';
      if (method) {
        if (typeof method === 'string') {
          methodName = method.toLowerCase();
        } else if (typeof method === 'object' && method !== null && 'name' in method) {
          methodName = (method.name as string).toLowerCase();
        }
        
        // Map backend method name to hyphy-eye method name
        if (methodName && methodNameMapping[methodName]) {
          methodName = methodNameMapping[methodName];
          console.log(`Mapped method name from ${method} to ${methodName}`);
        } else {
          console.warn(`No mapping found for method name: ${methodName}`);
        }
      }

      // Import hyphy-eye
      const hyphyEye = await import('@veg/hyphy-eye');
      
      // Store the registry for later use
      const hyphyEyeRegistry = await import('@veg/hyphy-eye/registry')
      
      // Try with Generator suffix first (following dm3-web-mock pattern)
      const generatorName = `${componentType}Generator`;
      let component;
      let outputType = 'dom-element';
      
      // Check if this is a Vega visualization component
      if (componentType.toLowerCase().includes('vega')) {
        outputType = 'vega-spec';
      }
      
      // Get registry options for this component if available
      let registryOptions = {};
      
      // Try to find options in the registry for this component
      if (hyphyEyeRegistry && methodName) {
        try {
          // Find the method in the registry
          const methodObj = hyphyEyeRegistry.HyPhyMethods[methodName];
          console.log("method registry: ", methodObj)
          if (methodObj && methodObj.visualizations) {
            // Find the visualization with matching component
            const vizConfig = methodObj.visualizations.find((v: any) => 
              v.component === componentType || 
              v.component === componentType.replace('Generator', '')
            );
            
            if (vizConfig && vizConfig.options) {
              console.log(`Found options in registry for ${componentType}:`, vizConfig.options);
              registryOptions = vizConfig.options;
              
              // Merge with provided options, with provided options taking precedence
              options = { ...registryOptions, ...options };
              console.log(`Using merged options for ${componentType}:`, options);
            }
          }
        } catch (e) {
          console.warn('Error getting options from registry:', e);
        }
      }
      
      if ((hyphyEye as any)[generatorName]) {
        console.log(`Found component with Generator suffix: ${generatorName}`);
        component = (hyphyEye as any)[generatorName];
      } else if ((hyphyEye as any)[componentType]) {
        console.log(`Found component directly: ${componentType}`);
        component = (hyphyEye as any)[componentType];
      } else if (componentType != "VegaLiteVisualization") {
        console.warn(`Component ${componentType} not found in hyphy-eye, falling back to TileTable`);
        // Fall back to TileTable if component not found
        if ((hyphyEye as any).TileTableGenerator) {
          console.log('Using TileTableGenerator as fallback');
          component = (hyphyEye as any).TileTableGenerator;
        } else if ((hyphyEye as any).TileTable) {
          console.log('Using TileTable as fallback');
          component = (hyphyEye as any).TileTable;
        } else {
          console.error('Neither requested component nor fallback TileTable found');
          return null;
        }
      }
      
      // Get the data ready - parse if it's a string
      const parsedData = typeof data === 'string' ? JSON.parse(data) : data;
      
      // Call the component function with the correct parameters
      let result;
      try {
        if (typeof component === 'function') {
          console.log(`Calling ${componentType} as a function with method ${methodName} and options:`, options);
          result = component(parsedData, methodName, options);
        } else if (component && typeof component.render === 'function') {
          console.log(`Calling ${componentType}.render with method ${methodName} and options:`, options);
          result = component.render(parsedData, methodName, options);
        } else if (componentType != "VegaLiteVisualization") {
          console.error('Component is not a function or does not have a render method');
          // Create a friendly error message
          const errorDiv = document.createElement('div');
          errorDiv.className = 'visualization-error';
          errorDiv.innerHTML = `<h3>Sorry, couldn't render this visualization</h3><p>The component "${componentType}" is not properly defined.</p>`;
          return { result: errorDiv, outputType: 'dom-element' };
        }
      } catch (err) {
        console.error(`Error calling ${componentType} component:`, err);
        // Create a friendly error message
        const errorDiv = document.createElement('div');
        errorDiv.className = 'visualization-error';
        errorDiv.innerHTML = `
          <h3>Sorry, couldn't render this visualization</h3>
          <p>There was an error rendering the "${componentType}" component.</p>
          <p class="error-details">Error: ${err instanceof Error ? err.message : String(err)}</p>
        `;
        return { result: errorDiv, outputType: 'dom-element' };
      }
      
      // Get the output type from the registry if not a custom plot
      if (componentType != "VegaLiteVisualization" && 
      hyphyEyeRegistry && hyphyEyeRegistry.HyPhyMethods) {
        const methodObj = hyphyEyeRegistry.HyPhyMethods[methodName];
        console.log(methodObj.visualizations)
        if (methodObj && methodObj.visualizations) {
          const vizConfig = methodObj.visualizations.find((v: any) => 
            v.component === componentType || v.component === componentType.replace('Generator', ''));
            console.log(vizConfig);
          if (vizConfig && vizConfig.outputType) {
            console.log(`Found output type in registry: ${vizConfig.outputType}`);
            outputType = vizConfig.outputType.toLowerCase();
          }
        }
      }
      
      return { result, outputType };
    } catch (error: any) {
      console.error(`Error generating visualization:`, error);
      return null;
    }
  }
</script>

<div class="visualization-container">
  {#if loading}
    <div class="loading">Loading...</div>
  {:else if error}
    <div class="error">{error}</div>
  {:else if visualizations && visualizations.length > 0}
    <div class="visualizations-grid">
      {#each visualizations as viz (viz.id)}
        <div class="visualization-card">
          <div class="visualization-content">
            {#if viz.component && jobInfo}
              <div class="viz-container">
                {#await generateVisualization(viz.component, viz.data, jobInfo.method, viz.options || {})}
                  <div class="loading">Generating visualization...</div>
                {:then vizResult}
                  {#if vizResult}
                    {#if vizResult.outputType === 'vega-spec'}
                      <div class="vega-container">
                        <!-- For Vega specs, use vega-embed to render the visualization -->
                        <div class="vega-vis" bind:this={domContainers[`vega-${viz.id}`]} data-viz-id={viz.id}></div>
                        {#if domContainers[`vega-${viz.id}`]}
                          <!-- This is a reactive statement that will run when both the container and result are available -->
                          {@const _ = (() => {
                            try {
                              console.log('Rendering Vega visualization:', vizResult.result);
                              vegaEmbed(domContainers[`vega-${viz.id}`], vizResult.result, {
                                actions: true,
                                // Use a valid theme from vega-embed
                                renderer: 'svg'
                              }).catch(error => {
                                console.error('Error rendering Vega visualization:', error);
                                domContainers[`vega-${viz.id}`].innerHTML = `
                                  <div class="vega-error">
                                    <h3>Error rendering visualization</h3>
                                    <p>${error.message || 'Invalid Vega specification'}</p>
                                  </div>
                                `;
                              });
                            } catch (e) {
                              console.error('Error setting up Vega visualization:', e);
                              domContainers[`vega-${viz.id}`].innerHTML = `
                                <div class="vega-error">
                                  <h3>Error setting up visualization</h3>
                                  <p>${e instanceof Error ? e.message : String(e)}</p>
                                </div>
                              `;
                            }
                            return true; // Just to make the reactive statement work
                          })()}
                        {/if}
                      </div>
                    {:else if vizResult.outputType === 'dom-element' || vizResult.outputType === 'html-string'}
                      <!-- For DOM elements and HTML strings, we need to use a container and bind:this -->
                      <div class="dom-container" bind:this={domContainers[viz.id]} data-viz-id={viz.id}></div>
                      {#if domContainers[viz.id]}
                        <!-- This is a reactive statement that will run when both the container and result are available -->
                        {@const _ = (() => {
                          try {
                            // Clear previous content
                            domContainers[viz.id].innerHTML = '';
                            
                            if (vizResult.outputType === 'dom-element') {
                              // For DOM elements, append directly
                              domContainers[viz.id].appendChild(vizResult.result);
                            } else {
                              // For HTML strings, set innerHTML
                              domContainers[viz.id].innerHTML = vizResult.result;
                            }
                          } catch (e) {
                            console.error('Error rendering visualization:', e);
                          }
                          return true; // Just to make the reactive statement work
                        })()}
                      {/if}
                    {:else}
                      <div class="unknown-type">
                        <p>Unknown output type: {vizResult.outputType}</p>
                        <pre>{JSON.stringify(vizResult.result, null, 2)}</pre>
                      </div>
                    {/if}
                  {:else}
                    <div class="error">Failed to generate visualization</div>
                  {/if}
                {:catch error}
                  <div class="error">Error generating visualization: {error.message}</div>
                {/await}
              </div>
            {:else}
              <div class="error">No visualization component specified</div>
            {/if}
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .visualization-container {
    margin: 20px 0;
  }
  
  .loading, .error, .visualizations-grid {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .visualization-card {
    border: 1px solid #ddd;
    border-radius: 4px;
    padding: 1rem;
    background-color: white;
  }
</style>
