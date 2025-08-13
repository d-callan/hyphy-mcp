import registryService from './services/registryService';
import ai from './ai';
import { globalJobStore } from './globalJobStore';
import { globalDatasetStore, type Dataset } from './datasetStore';
import { globalVisualizationStore, type Visualization } from './visualizationStore';
import { logger } from '@genkit-ai/core/logging';
import { z } from 'genkit';
import * as schema from './schema'  ;
import * as utils from './utils';

export const listJobs = ai.defineTool(
  {
    name: 'list_jobs',
    description: 'List all available jobs',
    inputSchema: z.object({}),
    outputSchema: z.object({
      jobs: z.array(z.object({
        jobId: z.string(),
        method: z.string(),
        status: z.string(),
        timestamp: z.number(),
        datasetId: z.string().optional(),
      })),
    }),
  },
  async () => {
    try {
      const jobs = globalJobStore.getAllJobs();
      return { jobs };
    } catch (error) {
      logger.error('Error listing jobs:', error);
      return { jobs: [] };
    }
  }
);

export const getJobResults = ai.defineTool(
  {
    name: 'get_job_results',
    description: 'Get the results of a completed job',
    inputSchema: schema.getJobResultsSchema,
    outputSchema: z.object({
      results: z.any().optional(),
      error: z.string().optional(),
    }),
  },
  async (input: z.infer<typeof schema.getJobResultsSchema>) => {
    try {
      const job = globalJobStore.getJob(input.job_id);
      if (!job) {
        return { error: `Job ${input.job_id} not found` };
      }
      if (job.status !== 'completed') {
        return { error: `Job ${input.job_id} is not completed yet` };
      }
      return { results: job.results || {} };
    } catch (error) {
      logger.error(`Error getting job results ${input.job_id}:`, error);
      return { error: `Failed to get job results: ${error instanceof Error ? error.message : String(error)}` };
    }
  }
);

// Dataset and visualization tools
export const listDatasets = ai.defineTool(
  {
    name: 'list_datasets',
    description: 'List all available datasets',
    inputSchema: z.object({}),
    outputSchema: z.object({
      datasets: z.array(z.object({
        datasetId: z.string(),
        name: z.string(),
        description: z.string().optional(),
        timestamp: z.number(),
        hasAlignment: z.boolean(),
        hasTree: z.boolean(),
        fileSize: z.number().optional(),
      })),
    }),
  },
  async () => {
    try {
      const datasets = globalDatasetStore.getAllDatasets();
      return { datasets };
    } catch (error) {
      logger.error('Error listing datasets:', error);
      return { datasets: [] };
    }
  }
);

// Schema for getDatasetDetails tool output
export const getDatasetDetailsOutputSchema = z.object({
  dataset: z.object({
    datasetId: z.string(),
    name: z.string(),
    description: z.string().optional(),
    timestamp: z.number(),
    hasAlignment: z.boolean(),
    hasTree: z.boolean(),
    fileSize: z.number().optional(),
    sequenceCount: z.number().optional(),
    filePath: z.string(),
    treePath: z.string().optional(),
  }).optional(),
  error: z.string().optional(),
});

export const getDatasetDetails = ai.defineTool(
  {
    name: 'get_dataset_details',
    description: 'Get detailed information about a specific dataset',
    inputSchema: schema.getDatasetDetailsSchema,
    outputSchema: getDatasetDetailsOutputSchema,
  },
  async (input: z.infer<typeof schema.getDatasetDetailsSchema>) => {
    try {
      const dataset = globalDatasetStore.getDataset(input.dataset_id);
      if (!dataset) {
        return { error: `Dataset ${input.dataset_id} not found` };
      }
      return { dataset };
    } catch (error) {
      logger.error(`Error getting dataset ${input.dataset_id}:`, error);
      return { 
        dataset: undefined,
        error: `Failed to get dataset: ${error instanceof Error ? error.message : String(error)}` 
      };
    }
  }
);

export const getDatasetJobs = ai.defineTool(
  {
    name: 'get_dataset_jobs',
    description: 'Get all jobs associated with a specific dataset',
    inputSchema: schema.getDatasetDetailsSchema,
    outputSchema: z.object({
      jobs: z.array(z.object({
        jobId: z.string(),
        method: z.string(),
        status: z.string(),
        timestamp: z.number(),
      })),
      error: z.string().optional(),
    }),
  },
  async (input: z.infer<typeof schema.getDatasetDetailsSchema>) => {
    try {
      const allJobs = globalJobStore.getAllJobs();
      const datasetJobs = allJobs.filter(job => job.datasetId === input.dataset_id);
      return { jobs: datasetJobs };
    } catch (error) {
      logger.error(`Error getting jobs for dataset ${input.dataset_id}:`, error);
      return { 
        jobs: [],
        error: `Failed to get dataset jobs: ${error instanceof Error ? error.message : String(error)}` 
      };
    }
  }
);

export const listVisualizations = ai.defineTool(
  {
    name: 'list_visualizations',
    description: 'List all available visualizations',
    inputSchema: z.object({}),
    outputSchema: z.object({
      visualizations: z.array(z.object({
        vizId: z.string(),
        jobId: z.string(),
        datasetId: z.string().optional(),
        type: z.string(),
        title: z.string(),
        timestamp: z.number(),
      })),
    }),
  },
  async () => {
    try {
      const visualizations = globalVisualizationStore.getAllVisualizations();
      return { visualizations };
    } catch (error) {
      logger.error('Error listing visualizations:', error);
      return { visualizations: [] };
    }
  }
);

export const getJobVisualizationsTool = ai.defineTool(
  {
    name: 'get_job_visualizations',
    description: 'Get all visualizations associated with a specific job',
    inputSchema: schema.getJobResultsSchema,
    outputSchema: z.object({
      visualizations: z.array(z.object({
        vizId: z.string(),
        jobId: z.string(),
        datasetId: z.string().optional(),
        type: z.string(),
        title: z.string(),
        timestamp: z.number(),
      })),
      error: z.string().optional(),
    }),
  },
  async (input: z.infer<typeof schema.getJobResultsSchema>) => {
    try {
      const visualizations = globalVisualizationStore.getJobVisualizations(input.job_id);
      return { visualizations };
    } catch (error) {
      logger.error(`Error getting visualizations for job ${input.job_id}:`, error);
      return { 
        visualizations: [],
        error: `Failed to get job visualizations: ${error instanceof Error ? error.message : String(error)}` 
      };
    }
  }
);

export const getVisualizationDetails = ai.defineTool(
  {
    name: 'get_visualization_details',
    description: 'Get detailed information about a specific visualization',
    inputSchema: schema.getVisualizationDetailsSchema,
    outputSchema: z.object({
      visualization: z.object({
        vizId: z.string(),
        jobId: z.string(),
        datasetId: z.string().optional(),
        type: z.string(),
        title: z.string(),
        description: z.string().optional(),
        component: z.string().optional(),
        timestamp: z.number(),
        data: z.any(),
        config: z.record(z.string(), z.any()).optional(),
        metadata: z.record(z.string(), z.any()).optional(),
      }).optional(),
      error: z.string().optional(),
    }),
  },
  async (input: z.infer<typeof schema.getVisualizationDetailsSchema>) => {
    try {
      const visualization = globalVisualizationStore.getVisualization(input.viz_id);
      if (!visualization) {
        return { error: `Visualization ${input.viz_id} not found` };
      }
      
      // Enrich visualization with registry metadata
      if (visualization.type) {
        try {
          logger.info(`Attempting to enrich visualization ${input.viz_id} of type ${visualization.type}`);
          
          // Get the job associated with this visualization to determine the method
          const job = visualization.jobId ? globalJobStore.getJob(visualization.jobId) : null;
          const jobMethod = job?.method;
          
          logger.info(`Visualization is associated with job ${visualization.jobId}, method: ${jobMethod || 'unknown'}`);
          
          let foundRegistryViz = null;
          
          // First priority: If we have a job method, look for a visualization with matching name in that method
          if (jobMethod && registryService.methodExists(jobMethod)) {
            logger.info(`Looking for visualization with name matching "${visualization.type}" in method ${jobMethod}`);
            const methodVisualizations = registryService.getMethodVisualizations(jobMethod);
            
            // Try to find a visualization with a matching name
            const nameMatchViz = methodVisualizations.find(v => 
              v.name === visualization.type || 
              v.name.toLowerCase() === visualization.type.toLowerCase()
            );
            
            if (nameMatchViz) {
              logger.info(`Found visualization with matching name in method ${jobMethod}: ${nameMatchViz.name} (${nameMatchViz.component})`);
              foundRegistryViz = nameMatchViz;
            } else {
              logger.info(`No visualization with name "${visualization.type}" found in method ${jobMethod}`);
            }
          }
          
          // Second check: Is the visualization type itself a method?
          if (!foundRegistryViz && registryService.methodExists(visualization.type)) {
            logger.info(`Found method match for ${visualization.type} in registry`);
            // Get visualizations for this method
            const methodVisualizations = registryService.getMethodVisualizations(visualization.type);
            logger.info(`Method ${visualization.type} has ${methodVisualizations.length} visualizations in registry`);
            
            // Find a matching visualization by component if available, otherwise use the first one
            foundRegistryViz = methodVisualizations.find(v => 
              (visualization.metadata?.component && v.component === visualization.metadata.component) || 
              v.component === 'TileTable'
            ) || methodVisualizations[0];
            
            if (foundRegistryViz) {
              logger.info(`Found visualization in method ${visualization.type}: ${foundRegistryViz.name} (${foundRegistryViz.component})`);
            }
          }
          
          // Third check: Is the visualization type a component name in any method?
          if (!foundRegistryViz) {
            logger.info(`${visualization.type} not found as a method, searching as component across all methods`);
            
            // Get all methods from registry
            const allMethods = await registryService.getAllMethods();
            logger.info(`Searching across ${Object.keys(allMethods).length} methods in registry`);
            
            // Search for component match across all methods
            for (const methodName of Object.keys(allMethods)) {
              const methodVisualizations = registryService.getMethodVisualizations(methodName);
              
              // Look for a visualization with matching component name
              const matchingViz = methodVisualizations.find(v => 
                v.component === visualization.type || 
                v.component.toLowerCase() === visualization.type.toLowerCase()
              );
              
              if (matchingViz) {
                logger.info(`Found component match for ${visualization.type} in method ${methodName}: ${matchingViz.name}`);
                foundRegistryViz = matchingViz;
                break;
              }
            }
            
            // Fourth check: Search for visualization by name across all methods
            if (!foundRegistryViz) {
              logger.info(`Searching for visualization with name "${visualization.type}" across all methods`);
              
              for (const methodName of Object.keys(allMethods)) {
                const methodVisualizations = registryService.getMethodVisualizations(methodName);
                
                // Look for a visualization with matching name
                const nameMatchViz = methodVisualizations.find(v => 
                  v.name === visualization.type || 
                  v.name.toLowerCase() === visualization.type.toLowerCase()
                );
                
                if (nameMatchViz) {
                  logger.info(`Found name match for "${visualization.type}" in method ${methodName}: ${nameMatchViz.name} (${nameMatchViz.component})`);
                  foundRegistryViz = nameMatchViz;
                  break;
                }
              }
              
              if (!foundRegistryViz) {
                logger.info(`No visualization with name "${visualization.type}" found across all methods`);
              }
            }
          }
          
          // Apply registry metadata if found
          if (foundRegistryViz) {
            // Enrich with registry metadata
            if (!visualization.description && foundRegistryViz.description) {
              visualization.description = foundRegistryViz.description;
              logger.info(`Set description to: ${foundRegistryViz.description}`);
            }
            
            if (!visualization.component && foundRegistryViz.component) {
              visualization.component = foundRegistryViz.component;
              logger.info(`Set component to: ${foundRegistryViz.component}`);
            }
            
            // Store component in metadata if not already there
            if (foundRegistryViz.component && (!visualization.metadata || !visualization.metadata.component)) {
              visualization.metadata = visualization.metadata || {};
              visualization.metadata.component = foundRegistryViz.component;
              logger.info(`Set metadata.component to: ${foundRegistryViz.component}`);
            }
            
            logger.info(`Successfully enriched visualization ${input.viz_id} with registry metadata`);
          } else {
            // If no match found, set reasonable defaults
            if (!visualization.component) {
              if (visualization.type === 'Phylotree') {
                visualization.component = 'Phylotree';
                visualization.metadata = visualization.metadata || {};
                visualization.metadata.component = 'Phylotree';
                if (!visualization.description) {
                  visualization.description = 'Phylogenetic tree visualization';
                }
                logger.info(`Applied Phylotree-specific defaults for visualization ${input.viz_id}`);
              } else {
                visualization.component = 'TileTable';
                visualization.metadata = visualization.metadata || {};
                visualization.metadata.component = 'TileTable';
                logger.info(`Applied default component 'TileTable' for visualization ${input.viz_id}`);
              }
            }
          }
        } catch (regError) {
          // Log but don't fail if registry enrichment fails
          logger.error(`Error enriching visualization with registry data: ${regError instanceof Error ? regError.message : String(regError)}`);
          logger.error(`Stack trace: ${regError instanceof Error ? regError.stack : 'No stack trace'}`);
          
          // Set fallback values
          if (!visualization.component) {
            visualization.component = visualization.type === 'Phylotree' ? 'Phylotree' : 'TileTable';
            visualization.metadata = visualization.metadata || {};
            visualization.metadata.component = visualization.component;
            logger.info(`Applied fallback component ${visualization.component} due to registry error`);
          }
        }
      }
      
      return { visualization };
    } catch (error) {
      logger.error(`Error getting visualization ${input.viz_id}:`, error);
      return { error: `Failed to get visualization: ${error instanceof Error ? error.message : String(error)}` };
    }
  }
);

// Schema for requestVisualization tool input
export const requestVisualizationSchema = z.object({
  job_id: schema.JobIdSchema.describe('ID of the job to create visualization for'),
  dataset_id: schema.DatasetIdSchema.optional().describe('Optional dataset ID associated with the visualization'),
  type: z.string().describe('Type of visualization to create (e.g., "fel", "busted", "slac", etc.)'),
  title: z.string().describe('Title for the visualization'),
  description: z.string().optional().describe('Optional description for the visualization'),
  data: z.any().optional().describe('Optional data for the visualization. If not provided, will be populated from job results'),
  config: z.record(z.string(), z.any()).optional().describe('Optional configuration for the visualization'),
});

export const requestVisualization = ai.defineTool(
  {
    name: 'request_visualization',
    description: 'Request a new visualization for a specific job. This will add the visualization to the global visualization store.',
    inputSchema: requestVisualizationSchema,
    outputSchema: z.object({
      success: z.boolean(),
      visualization: z.object({
        vizId: z.string(),
        jobId: z.string(),
        datasetId: z.string().optional(),
        type: z.string(),
        title: z.string(),
        timestamp: z.number(),
      }).optional(),
      error: z.string().optional(),
    }),
  },
  async (input: z.infer<typeof requestVisualizationSchema>) => {
    try {
      // Check if the job exists
      const job = globalJobStore.getJob(input.job_id);
      if (!job) {
        return { 
          success: false, 
          error: `Job ${input.job_id} not found` 
        };
      }
      
      // If no data provided, try to get it from job results
      let vizData = input.data;
      if (!vizData && job.results) {
        vizData = job.results;
      }
      
      // If still no data and job is completed, try to fetch results
      if (!vizData && job.status === 'completed' && job.method) {
        try {
          logger.info(`No results in job object, attempting to fetch results for ${job.method} job ${input.job_id}`);
          
          // Try to fetch results using the job's payload
          if (job.payload) {
            const resultsResponse = await utils.fetchMethodResultsImpl(job.method, input.job_id, job.payload);
            
            if (resultsResponse.status === 'success' && resultsResponse.results) {
              vizData = resultsResponse.results;
              
              // Update the job with the fetched results
              globalJobStore.updateJobStatus(input.job_id, 'completed', vizData);
              logger.info(`Successfully fetched and updated results for job ${input.job_id}`);
            } else {
              logger.warn(`Failed to fetch results for job ${input.job_id}: ${resultsResponse.error || 'Unknown error'}`);
            }
          } else {
            logger.warn(`Cannot fetch results: Job ${input.job_id} has no payload`);
          }
        } catch (error) {
          logger.error(`Error fetching results for job ${input.job_id}:`, error);
        }
      }
      
      if (!vizData) {
        return { 
          success: false, 
          error: `No data provided and job ${input.job_id} has no results. If the job is complete, there might be an issue fetching the results.` 
        };
      }
      
      // Create visualization object
      const visualization: Visualization = {
        vizId: `viz_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        jobId: input.job_id,
        datasetId: input.dataset_id,
        type: input.type,
        title: input.title,
        description: input.description || '',
        timestamp: Date.now(),
        data: vizData,
        config: input.config || {},
        metadata: { requestedByAgent: true }
      };
      
      // Enrich visualization with registry metadata
      if (input.type) {
        try {
          logger.info(`Attempting to enrich new visualization of type ${input.type}`);
          
          // Get the job associated with this visualization to determine the method
          const job = input.job_id ? globalJobStore.getJob(input.job_id) : null;
          const jobMethod = job?.method;
          
          logger.info(`Visualization is associated with job ${input.job_id}, method: ${jobMethod || 'unknown'}`);
          
          let foundRegistryViz = null;
          
          // First priority: If we have a job method, look for a visualization with matching name in that method
          if (jobMethod && registryService.methodExists(jobMethod)) {
            logger.info(`Looking for visualization with name matching "${input.type}" in method ${jobMethod}`);
            const methodVisualizations = registryService.getMethodVisualizations(jobMethod);
            
            // Try to find a visualization with a matching name
            const nameMatchViz = methodVisualizations.find(v => 
              v.name === input.type || 
              v.name.toLowerCase() === input.type.toLowerCase() ||
              v.name === input.title || 
              v.name.toLowerCase() === input.title.toLowerCase()
            );
            
            if (nameMatchViz) {
              logger.info(`Found visualization with matching name in method ${jobMethod}: ${nameMatchViz.name} (${nameMatchViz.component})`);
              foundRegistryViz = nameMatchViz;
            } else {
              logger.info(`No visualization with name "${input.type}" found in method ${jobMethod}`);
            }
          }
          
          // Second check: Is the visualization type itself a method?
          if (!foundRegistryViz && registryService.methodExists(input.type)) {
            logger.info(`Found method match for ${input.type} in registry`);
            // Get visualizations for this method
            const methodVisualizations = registryService.getMethodVisualizations(input.type);
            logger.info(`Method ${input.type} has ${methodVisualizations.length} visualizations in registry`);
            
            // Find a matching visualization by component if available, otherwise use the first one
            foundRegistryViz = methodVisualizations[0]; // Default to first visualization
            
            if (foundRegistryViz) {
              logger.info(`Found visualization in method ${input.type}: ${foundRegistryViz.name} (${foundRegistryViz.component})`);
            }
          }
          
          // Third check: Is the visualization type a component name in any method?
          if (!foundRegistryViz) {
            logger.info(`${input.type} not found as a method, searching as component across all methods`);
            
            // Get all methods from registry
            const allMethods = await registryService.getAllMethods();
            logger.info(`Searching across ${Object.keys(allMethods).length} methods in registry`);
            
            // Search for component match across all methods
            for (const methodName of Object.keys(allMethods)) {
              const methodVisualizations = registryService.getMethodVisualizations(methodName);
              
              // Look for a visualization with matching component name
              const matchingViz = methodVisualizations.find(v => 
                v.component === input.type || 
                v.component.toLowerCase() === input.type.toLowerCase()
              );
              
              if (matchingViz) {
                logger.info(`Found component match for ${input.type} in method ${methodName}: ${matchingViz.name}`);
                foundRegistryViz = matchingViz;
                break;
              }
            }
            
            // Fourth check: Search for visualization by name across all methods
            if (!foundRegistryViz) {
              logger.info(`Searching for visualization with name "${input.type}" across all methods`);
              
              for (const methodName of Object.keys(allMethods)) {
                const methodVisualizations = registryService.getMethodVisualizations(methodName);
                
                // Look for a visualization with matching name
                const nameMatchViz = methodVisualizations.find(v => 
                  v.name === input.type || 
                  v.name.toLowerCase() === input.type.toLowerCase() ||
                  v.name === input.title || 
                  v.name.toLowerCase() === input.title.toLowerCase()
                );
                
                if (nameMatchViz) {
                  logger.info(`Found name match for "${input.type}" in method ${methodName}: ${nameMatchViz.name} (${nameMatchViz.component})`);
                  foundRegistryViz = nameMatchViz;
                  break;
                }
              }
              
              if (!foundRegistryViz) {
                logger.info(`No visualization with name "${input.type}" found across all methods`);
              }
            }
          }
          
          // Apply registry metadata if found
          if (foundRegistryViz) {
            // Enrich with registry metadata
            if (!visualization.description && foundRegistryViz.description) {
              visualization.description = foundRegistryViz.description;
              logger.info(`Set description to: ${foundRegistryViz.description}`);
            }
            
            if (!visualization.component && foundRegistryViz.component) {
              visualization.component = foundRegistryViz.component;
              logger.info(`Set component to: ${foundRegistryViz.component}`);
            }
            
            // Store component in metadata if not already there
            if (foundRegistryViz.component) {
              visualization.metadata = visualization.metadata || {};
              visualization.metadata.component = foundRegistryViz.component;
              logger.info(`Set metadata.component to: ${foundRegistryViz.component}`);
            }
            
            logger.info(`Successfully enriched new visualization with registry metadata`);
          } else {
            // If no match found, set reasonable defaults
            if (!visualization.component) {
              if (input.type === 'Phylotree') {
                visualization.component = 'Phylotree';
                visualization.metadata = visualization.metadata || {};
                visualization.metadata.component = 'Phylotree';
                if (!visualization.description) {
                  visualization.description = 'Phylogenetic tree visualization';
                }
                logger.info(`Applied Phylotree-specific defaults for new visualization`);
              } else {
                visualization.component = 'TileTable';
                visualization.metadata = visualization.metadata || {};
                visualization.metadata.component = 'TileTable';
                logger.info(`Applied default component 'TileTable' for new visualization`);
              }
            }
          }
        } catch (regError) {
          // Log but don't fail if registry enrichment fails
          logger.error(`Error enriching visualization with registry data: ${regError instanceof Error ? regError.message : String(regError)}`);
          logger.error(`Stack trace: ${regError instanceof Error ? regError.stack : 'No stack trace'}`);
          
          // Set fallback values
          if (!visualization.component) {
            visualization.component = input.type === 'Phylotree' ? 'Phylotree' : 'TileTable';
            visualization.metadata = visualization.metadata || {};
            visualization.metadata.component = visualization.component;
            logger.info(`Applied fallback component ${visualization.component} due to registry error`);
          }
        }
      }
      
      // Add visualization to store
      const success = globalVisualizationStore.addVisualization(visualization);
      
      if (!success) {
        return { 
          success: false, 
          error: 'Failed to add visualization to store' 
        };
      }
      
      // Return success with visualization info
      return { 
        success: true, 
        visualization: {
          vizId: visualization.vizId,
          jobId: visualization.jobId,
          datasetId: visualization.datasetId,
          type: visualization.type,
          title: visualization.title,
          timestamp: visualization.timestamp
        }
      };
    } catch (error) {
      logger.error('Error requesting visualization:', error);
      return { 
        success: false, 
        error: `Failed to request visualization: ${error instanceof Error ? error.message : String(error)}` 
      };
    }
  }
);

// Schema for listAvailableVisualizations tool input
export const listAvailableVisualizationsSchema = z.object({
  method: z.string().describe('The HyPhy method name (e.g., "BUSTED", "FEL", "MEME", etc.)'),
});

// List available visualizations for a specific HyPhy method
export const listAvailableVisualizations = ai.defineTool(
  {
    name: 'list_available_visualizations',
    description: 'List available visualizations for a specific HyPhy method',
    inputSchema: listAvailableVisualizationsSchema,
    outputSchema: z.object({
      success: z.boolean(),
      method: z.string().optional(),
      visualizations: z.array(
        z.object({
          name: z.string(),
          description: z.string(),
          component: z.string(),
          category: z.string(),
          glyph: z.string().optional(),
        })
      ).optional(),
      error: z.string().optional(),
    }),
  },
  async (input: z.infer<typeof listAvailableVisualizationsSchema>) => {
    try {
      // Check if the method exists
      if (!registryService.methodExists(input.method)) {
        return { 
          success: false, 
          error: `Method '${input.method}' not found` 
        };
      }
      
      // Get visualizations for the method
      const visualizations = registryService.getMethodVisualizations(input.method);
      
      return { 
        success: true,
        method: input.method,
        visualizations: visualizations.map(viz => ({
          name: viz.name,
          description: viz.description,
          component: viz.component,
          category: viz.category,
          glyph: viz.glyph
        }))
      };
    } catch (error) {
      logger.error('Error listing available visualizations:', error);
      return { 
        success: false, 
        error: `Failed to list available visualizations: ${error instanceof Error ? error.message : String(error)}` 
      };
    }
  }
);

// Job status tool
export const getJobStatus = ai.defineTool(
  {
    name: 'get_job_status',
    description: 'Get the status of a specific job',
    inputSchema: schema.getJobResultsSchema,
    outputSchema: z.object({
      job: z.object({
        jobId: z.string(),
        method: z.string(),
        status: z.string(),
        timestamp: z.number(),
        results: z.any().optional(),
      }).optional(),
      error: z.string().optional(),
    }),
  },
  async (input: z.infer<typeof schema.getJobResultsSchema>) => {
    try {
      const job = globalJobStore.getJob(input.job_id);
      if (!job) {
        return { error: `Job ${input.job_id} not found` };
      }
      return { job };
    } catch (error: any) {
      logger.error(`Error getting job ${input.job_id}:`, error);
      return { error: `Failed to get job: ${error instanceof Error ? error.message : String(error)}` };
    }
  }
);

// Define delete dataset tool
export const deleteDatasetTool = ai.defineTool(
  {
    name: 'delete_dataset',
    description: 'Delete a dataset from the Datamonkey API',
    inputSchema: schema.getDatasetDetailsSchema,
    outputSchema: z.object({
      success: z.boolean(),
      message: z.string(),
      error: z.string().optional(),
    }),
  },
  async (input: z.infer<typeof schema.getDatasetDetailsSchema>) => {
    try {
      const dataset = globalDatasetStore.getDataset(input.dataset_id);
      if (!dataset) {
        return { 
          success: false, 
          message: `Dataset ${input.dataset_id} not found`,
          error: 'Dataset not found'
        };
      }
      
      // Delete the dataset
      globalDatasetStore.deleteDataset(input.dataset_id);
      
      return { 
        success: true, 
        message: `Dataset ${input.dataset_id} has been successfully deleted` 
      };
    } catch (error) {
      logger.error(`Error deleting dataset ${input.dataset_id}:`, error);
      return { 
        success: false, 
        message: `Failed to delete dataset ${input.dataset_id}`,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
);

// Define delete job tool
export const deleteJobTool = ai.defineTool(
  {
    name: 'delete_job',
    description: 'Delete a job from the Datamonkey API',
    inputSchema: schema.getJobResultsSchema,
    outputSchema: z.object({
      success: z.boolean(),
      message: z.string(),
      error: z.string().optional(),
    }),
  },
  async (input: z.infer<typeof schema.getJobResultsSchema>) => {
    try {
      const job = globalJobStore.getJob(input.job_id);
      if (!job) {
        return { 
          success: false, 
          message: `Job ${input.job_id} not found`,
          error: 'Job not found'
        };
      }
      
      // Delete the job
      globalJobStore.deleteJob(input.job_id);
      
      // Also delete any visualizations associated with this job
      globalVisualizationStore.deleteJobVisualizations(input.job_id);
      
      return { 
        success: true, 
        message: `Job ${input.job_id} and its associated visualizations have been successfully deleted` 
      };
    } catch (error) {
      logger.error(`Error deleting job ${input.job_id}:`, error);
      return { 
        success: false, 
        message: `Failed to delete job ${input.job_id}`,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
);

// Define delete visualization tool
export const deleteVisualizationTool = ai.defineTool(
  {
    name: 'delete_visualization',
    description: 'Delete a visualization from the Datamonkey API',
    inputSchema: schema.getVisualizationDetailsSchema,
    outputSchema: z.object({
      success: z.boolean(),
      message: z.string(),
      error: z.string().optional(),
    }),
  },
  async (input: z.infer<typeof schema.getVisualizationDetailsSchema>) => {
    try {
      const visualization = globalVisualizationStore.getVisualization(input.viz_id);
      if (!visualization) {
        return { 
          success: false, 
          message: `Visualization ${input.viz_id} not found`,
          error: 'Visualization not found'
        };
      }
      
      // Delete the visualization
      globalVisualizationStore.deleteVisualization(input.viz_id);
      
      return { 
        success: true, 
        message: `Visualization ${input.viz_id} has been successfully deleted` 
      };
    } catch (error) {
      logger.error(`Error deleting visualization ${input.viz_id}:`, error);
      return { 
        success: false, 
        message: `Failed to delete visualization ${input.viz_id}`,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
);

export const housekeepingTools = [
    getJobStatus,
    listJobs,
    getJobResults,
    // New dataset and visualization tools
    listDatasets,
    getDatasetDetails,
    getDatasetJobs,
    listVisualizations,
    getJobVisualizationsTool,
    getVisualizationDetails,
    // Add missing visualization tools
    requestVisualization,
    listAvailableVisualizations,
    // Delete tools
    deleteDatasetTool,
    deleteJobTool,
    deleteVisualizationTool,
  ];