import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { globalDatasetStore } from './datasetStore';
import { globalJobStore } from './globalJobStore';
import { logger } from '@genkit-ai/core/logging';
import { z } from 'genkit';
import ai from './ai';
import * as schema from './schema';
import * as utils from './utils';

export const uploadFileToDatamonkey = ai.defineTool(
  {
    name: 'upload_file_to_datamonkey',
    description: 'Upload a file to the Datamonkey API and return the file handle',
    inputSchema: schema.uploadFileSchema,
    outputSchema: z.object({
      status: z.string(),
      file_handle: z.string().optional(),
      file_name: z.string().optional(),
      file_size: z.number().optional(),
      error: z.string().optional(),
    }),
  },
  async (input: z.infer<typeof schema.uploadFileSchema>) => {
    return utils.uploadFileToDatamonkeyImpl(input.file_path);
  }
);

export const startOrMonitorBustedJob = ai.defineTool(
  {
    name: 'start_or_monitor_busted_job',
    description: 'Start a BUSTED analysis job on the Datamonkey API or check the status of an existing job.',
    inputSchema: schema.startOrMonitorBustedJobSchema,
    outputSchema: z.object({
      status: z.string(),
      job_id: z.string().optional(),
      message: z.string().optional(),
      error: z.string().optional(),
      input: z.object({
        alignment: z.string().optional(),
        tree: z.string().optional(),
        branches: z.string().optional(),
      }).optional(),
    }),
  },
  async (input: z.infer<typeof schema.startOrMonitorBustedJobSchema>) => {
    try {
      // Resolve dataset ID to file path if needed
      const resolvedAlignmentPath = utils.resolveDatasetPath(input.alignment_file);
      
      // Upload alignment file
      const alignmentUpload = await utils.uploadFileToDatamonkeyImpl(resolvedAlignmentPath);
      if (alignmentUpload.status === 'error') {
        return { status: 'error', error: alignmentUpload.error };
      }
      
      // Upload tree file if provided
      let treeUpload = null;
      if (input.tree_file) {
        // Resolve dataset ID to file path if needed
        const resolvedTreePath = utils.resolveDatasetPath(input.tree_file);
        
        treeUpload = await utils.uploadFileToDatamonkeyImpl(resolvedTreePath);
        if (treeUpload.status === 'error') {
          return { status: 'error', error: treeUpload.error };
        }
      }
      
      // Prepare payload for BUSTED analysis
      const payload = {
        alignment: alignmentUpload.file_handle,
        tree: treeUpload?.file_handle,
        //branches: input.branches || 'All',
      };
      
      // Use helper function to start the job
      const jobResult = await utils.startOrMonitorMethodJobImpl('busted', payload);
      
      if (jobResult.status === 'error') {
        return {
          status: 'error',
          error: jobResult.error,
          job_id: jobResult.jobId // Include job ID even on error for reference
        };
      }
      
      const jobId = jobResult.jobId;
      
      // Determine job status for session tracking
      const jobStatus = jobResult.completed ? 'completed' : 'pending';
      
      // Store job in global store
      // Extract dataset ID from alignment or tree file
      const datasetId = utils.extractDatasetId(input.alignment_file, input.tree_file);
      
      const jobInfo = {
        jobId: jobId,
        method: 'busted',
        status: jobStatus,
        timestamp: Date.now(),
        fileName: input.alignment_file,
        datasetId, // Add dataset ID to job info
        // UI-friendly parameters with file paths (for display)
        params: {
          alignment: input.alignment_file,
          tree: input.tree_file,
          branches: input.branches || 'All'
        },
        // API payload with file handles (for API communication)
        payload: payload
      };
      
      // Store job in global job store for app-wide tracking
      globalJobStore.addJob(jobInfo);
      
      // Customize message based on job status
      let statusMessage;
      if (jobResult.completed) {
        statusMessage = 'BUSTED analysis is already complete and ready for results. Use fetch_datamonkey_job_results to retrieve the results.';
      } else {
        statusMessage = 'BUSTED analysis started on Datamonkey API. Use check_datamonkey_job_status to monitor progress.';
      }

      return {
        status: 'success',
        job_id: jobId,
        message: statusMessage,
        completed: jobResult.completed,
        input: {
          alignment: input.alignment_file,
          tree: input.tree_file,
          branches: input.branches || 'All',
        }
      };
    } catch (error) {
      return {
        status: 'error',
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
);

export const checkDatasetExists = ai.defineTool(
  {
    name: 'check_dataset_exists',
    description: 'Check if a dataset exists on the Datamonkey API',
    inputSchema: schema.checkDatasetExistsSchema,
    outputSchema: z.object({
      exists: z.boolean(),
      dataset_id: z.string(),
    }),
  },
  async (input: z.infer<typeof schema.checkDatasetExistsSchema>) => {
    const exists = await utils.checkDatasetExistsImpl(input.dataset_id);
    return {
      exists,
      dataset_id: input.dataset_id,
    };
  }
);

export const getAvailableMethods = ai.defineTool(
  {
    name: 'get_available_methods',
    description: 'Get a list of available HyPhy analysis methods supported by the Datamonkey API',
    inputSchema: schema.getAvailableMethodsSchema,
    outputSchema: z.object({
      methods: z.array(z.object({
        name: z.string(),
        full_name: z.string(),
        description: z.string(),
      })),
    }),
  },
  async () => {
    // This could be fetched from the API if they provide such an endpoint
    // For now, we'll return the static list of all implemented methods
    return {
      methods: [
        {
          name: "ABSREL",
          full_name: "Adaptive Branch-Site Random Effects Likelihood",
          description: "Tests for evidence of episodic diversifying selection on a per-branch basis"
        },
        {
          name: "BGM",
          full_name: "Bayesian Graphical Model",
          description: "Infers patterns of conditional dependence among sites in an alignment"
        },
        {
          name: "BUSTED",
          full_name: "Branch-Site Unrestricted Statistical Test for Episodic Diversification",
          description: "Tests for evidence of episodic positive selection at a subset of sites"
        },
        {
          name: "CONTRAST-FEL",
          full_name: "Contrast Fixed Effects Likelihood",
          description: "Tests for differences in selective pressures between two sets of branches"
        },
        {
          name: "FADE",
          full_name: "FUBAR Approach to Directional Evolution",
          description: "Detects directional selection in protein-coding sequences"
        },
        {
          name: "FEL",
          full_name: "Fixed Effects Likelihood",
          description: "Tests for pervasive positive or negative selection at individual sites"
        },
        {
          name: "FUBAR",
          full_name: "Fast Unconstrained Bayesian AppRoximation",
          description: "Detects sites under positive or negative selection using a Bayesian approach"
        },
        {
          name: "GARD",
          full_name: "Genetic Algorithm for Recombination Detection",
          description: "Identifies evidence of recombination breakpoints in an alignment"
        },
        {
          name: "MEME",
          full_name: "Mixed Effects Model of Evolution",
          description: "Detects sites evolving under episodic positive selection"
        },
        {
          name: "MULTIHIT",
          full_name: "Multiple Hit Analysis",
          description: "Accounts for multiple nucleotide substitutions in evolutionary models"
        },
        {
          name: "NRM",
          full_name: "Nucleotide Rate Matrix",
          description: "Estimates nucleotide substitution rates from sequence data"
        },
        {
          name: "RELAX",
          full_name: "Relaxation of Selection",
          description: "Tests for relaxation or intensification of selection between two sets of branches"
        },
        {
          name: "SLAC",
          full_name: "Single-Likelihood Ancestor Counting",
          description: "Counts ancestral mutations to infer selection at individual sites"
        },
        {
          name: "SLATKIN",
          full_name: "Slatkin-Maddison Test",
          description: "Tests for phylogeny-trait associations in viral evolution"
        }
      ]
    };
  }
);

export const startOrMonitorFelJob = ai.defineTool(
  {
    name: 'start_or_monitor_fel_job',
    description: 'Start a FEL (Fixed Effects Likelihood) analysis job on the Datamonkey API or check the status of an existing job.',
    inputSchema: schema.startOrMonitorFelJobSchema,
    outputSchema: z.object({
      status: z.string(),
      job_id: z.string().optional(),
      message: z.string().optional(),
      error: z.string().optional(),
      input: z.object({
        alignment: z.string().optional(),
        tree: z.string().optional(),
        branches: z.string().optional(),
        pvalue: z.number().optional(),
        ci: z.string().optional(),
        srv: z.string().optional(),
        resample: z.number().optional(),
        multiple_hits: z.string().optional(),
        site_multihit: z.string().optional(),
        genetic_code: z.string().optional(),
      }).optional(),
    }),
  },
  async (input: z.infer<typeof schema.startOrMonitorFelJobSchema>) => {
    try {
      // Log input parameters
      logger.info(`Starting FEL job with alignment file: ${input.alignment_file}`);
      if (input.tree_file) {
        logger.info(`Tree file provided: ${input.tree_file}`);
      }
      
      // Resolve dataset ID to file path if needed
      const resolvedAlignmentPath = utils.resolveDatasetPath(input.alignment_file);
      
      // Upload alignment file
      logger.info(`Uploading alignment file: ${resolvedAlignmentPath}`);
      const alignmentUpload = await utils.uploadFileToDatamonkeyImpl(resolvedAlignmentPath);
      logger.info(`Alignment upload result: ${JSON.stringify(alignmentUpload)}`);
      
      if (alignmentUpload.status === 'error') {
        logger.error(`Failed to upload alignment file: ${alignmentUpload.error}`);
        return {
          status: 'error',
          error: alignmentUpload.error
        };
      }
      
      // Upload tree file if provided
      let treeUpload = null;
      if (input.tree_file) {
        // Resolve dataset ID to file path if needed
        const resolvedTreePath = utils.resolveDatasetPath(input.tree_file);
        
        logger.info(`Uploading tree file: ${resolvedTreePath}`);
        treeUpload = await utils.uploadFileToDatamonkeyImpl(resolvedTreePath);
        logger.info(`Tree upload result: ${JSON.stringify(treeUpload)}`);
        
        if (treeUpload.status === 'error') {
          logger.error(`Failed to upload tree file: ${treeUpload.error}`);
          return {
            status: 'error',
            error: treeUpload.error
          };
        }
      }
      
      // Prepare payload for FEL analysis
      const payload = {
        alignment: alignmentUpload.file_handle,
        tree: treeUpload?.file_handle,
        // Convert 'All' to empty array as per API spec
        branches: input.branches === 'All' ? [] : [input.branches],
        ci: input.ci || 'No',
        srv: input.srv || 'Yes',
        resample: input.resample || 0,
        multiple_hits: input.multiple_hits || 'None',
        site_multihit: input.site_multihit || 'Estimate',
        genetic_code: input.genetic_code || 'Universal',
      };
      
      // Use helper function to start the job
      const jobResult = await utils.startOrMonitorMethodJobImpl('fel', payload);
      
      if (jobResult.status === 'error') {
        return {
          status: 'error',
          error: jobResult.error,
          job_id: jobResult.jobId // Include job ID even on error for reference
        };
      }
      
      // Determine job status
      const jobStatus = jobResult.completed ? 'completed' : 'pending';
      
      // Extract dataset ID from alignment or tree file
      const datasetId = utils.extractDatasetId(input.alignment_file, input.tree_file);
      
      // Store job in global job store for app-wide tracking
      globalJobStore.addJob({
        jobId: jobResult.jobId,
        method: 'fel',
        status: jobStatus,
        timestamp: Date.now(),
        fileName: input.alignment_file,
        treeName: input.tree_file,
        datasetId, // Add dataset ID to job info
        // API payload with file handles (for API communication)
        payload: payload,
        // UI-friendly parameters with file paths (for display)
        params: {
          alignment: input.alignment_file,
          tree: input.tree_file
        }
      });
      logger.info(`Job ${jobResult.jobId} added to global job store`);
      
      // Customize message based on job status
      let statusMessage;
      if (jobResult.completed) {
        statusMessage = `FEL analysis is already complete and ready for results. Use fetch_datamonkey_job_results to retrieve the results.`;
      } else {
        statusMessage = `FEL job started successfully with ID: ${jobResult.jobId}`;
      }
      
      return {
        status: 'success',
        job_id: jobResult.jobId,
        message: statusMessage,
        completed: jobResult.completed
      };
    } catch (error) {
      return {
        status: 'error',
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
);

// Start or monitor MEME job tool
export const startOrMonitorMemeJob = ai.defineTool(
  {
    name: 'start_or_monitor_meme_job',
    description: 'Start a MEME (Mixed Effects Model of Evolution) analysis job on the Datamonkey API or check the status of an existing job.',
    inputSchema: schema.startOrMonitorMemeJobSchema,
    outputSchema: z.object({
      status: z.string(),
      job_id: z.string().optional(),
      message: z.string().optional(),
      error: z.string().optional(),
      input: z.object({
        alignment: z.string().optional(),
        tree: z.string().optional(),
        branches: z.string().optional(),
        pvalue: z.number().optional(),
        genetic_code: z.string().optional(),
      }).optional(),
    }),
  },
  async (input: z.infer<typeof schema.startOrMonitorMemeJobSchema>) => {
    try {
      // Upload alignment file
      const alignmentUpload = await utils.uploadFileToDatamonkeyImpl(input.alignment_file);
      if (alignmentUpload.status === 'error') {
        return {
          status: 'error',
          error: alignmentUpload.error
        };
      }
      
      // Upload tree file if provided
      let treeUpload = null;
      if (input.tree_file) {
        treeUpload = await utils.uploadFileToDatamonkeyImpl(input.tree_file);
        if (treeUpload.status === 'error') {
          return {
            status: 'error',
            error: treeUpload.error
          };
        }
      }
      
      // Prepare payload for MEME analysis
      const payload = {
        alignment: alignmentUpload.file_handle,
        tree: treeUpload?.file_handle,
        branches: input.branches || 'All',
        genetic_code: input.genetic_code || 'Universal',
      };
      
      // Use helper function to start the job
      const jobResult = await utils.startOrMonitorMethodJobImpl('meme', payload);
      
      if (jobResult.status === 'error') {
        return {
          status: 'error',
          error: jobResult.error,
          job_id: jobResult.jobId // Include job ID even on error for reference
        };
      }
      
      const jobId = jobResult.jobId;
      const sessionId = input.session?.id;
      
      // Determine job status for session tracking
      const jobStatus = jobResult.completed ? 'completed' : 'pending';
      
      // Store job in global job store for app-wide tracking
      globalJobStore.addJob({
        jobId: jobId,
        method: 'meme',
        status: jobStatus,
        timestamp: Date.now(),
        fileName: input.alignment_file,
        treeName: input.tree_file,
        // API payload with file handles (for API communication)
        payload: payload,
        // UI-friendly parameters with file paths (for display)
        params: {
          alignment: input.alignment_file,
          tree: input.tree_file
        }
      });
      logger.info(`Job ${jobId} added to global job store`);
      
      // Customize message based on job status
      let statusMessage;
      if (jobResult.completed) {
        statusMessage = 'MEME analysis is already complete and ready for results. Use fetch_datamonkey_job_results to retrieve the results.';
      } else {
        statusMessage = 'MEME analysis started on Datamonkey API. Use check_datamonkey_job_status to monitor progress.';
      }
      
      return {
        status: 'success',
        job_id: jobId,
        message: statusMessage,
        completed: jobResult.completed,
        input: {
          alignment: input.alignment_file,
          tree: input.tree_file,
          branches: input.branches || 'All',
          pvalue: input.pvalue || 0.1,
          genetic_code: input.genetic_code || 'Universal',
        }
      };
    } catch (error) {
      return {
        status: 'error',
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
);

export const startOrMonitorAbsrelJob = ai.defineTool(
  {
    name: 'start_or_monitor_absrel_job',
    description: 'Start an ABSREL (Adaptive Branch-Site Random Effects Likelihood) analysis job on the Datamonkey API or check the status of an existing job.',
    inputSchema: schema.startOrMonitorAbsrelJobSchema,
    outputSchema: z.object({
      status: z.string(),
      job_id: z.string().optional(),
      message: z.string().optional(),
      error: z.string().optional(),
      input: z.object({
        alignment: z.string().optional(),
        tree: z.string().optional(),
        branches: z.string().optional(),
        pvalue: z.number().optional(),
        genetic_code: z.string().optional(),
      }).optional(),
    }),
  },
  async (input: z.infer<typeof schema.startOrMonitorAbsrelJobSchema>) => {
    try {
      // Upload alignment file
      const alignmentUpload = await utils.uploadFileToDatamonkeyImpl(input.alignment_file);
      if (alignmentUpload.status === 'error') {
        return {
          status: 'error',
          error: alignmentUpload.error
        };
      }
      
      // Upload tree file if provided
      let treeUpload = null;
      if (input.tree_file) {
        treeUpload = await utils.uploadFileToDatamonkeyImpl(input.tree_file);
        if (treeUpload.status === 'error') {
          return {
            status: 'error',
            error: treeUpload.error
          };
        }
      }
      
      // Prepare payload for ABSREL analysis
      const payload = {
        alignment: alignmentUpload.file_handle,
        tree: treeUpload?.file_handle,
        branches: input.branches || 'All',
        genetic_code: input.genetic_code || 'Universal',
      };
      
      // Use helper function to start the job
      const jobResult = await utils.startOrMonitorMethodJobImpl('absrel', payload);
      
      if (jobResult.status === 'error') {
        return {
          status: 'error',
          error: jobResult.error,
          job_id: jobResult.jobId // Include job ID even on error for reference
        };
      }
      
      const jobId = jobResult.jobId;
      const sessionId = input.session?.id;
      
      // Determine job status for session tracking
      const jobStatus = jobResult.completed ? 'completed' : 'pending';
      
      // Store job in global job store for app-wide tracking
      globalJobStore.addJob({
        jobId: jobId,
        method: 'absrel',
        status: jobStatus,
        timestamp: Date.now(),
        fileName: input.alignment_file,
        treeName: input.tree_file,
        // API payload with file handles (for API communication)
        payload: payload,
        // UI-friendly parameters with file paths (for display)
        params: {
          alignment: input.alignment_file,
          tree: input.tree_file,
          branches: input.branches || 'All',
          genetic_code: input.genetic_code || 'Universal'
        }
      });
      logger.info(`Job ${jobId} added to global job store`);

      // Customize message based on job status
      let statusMessage;
      if (jobResult.completed) {
        statusMessage = 'ABSREL analysis is already complete and ready for results. Use fetch_datamonkey_job_results to retrieve the results.';
      } else {
        statusMessage = 'ABSREL analysis started on Datamonkey API. Use check_datamonkey_job_status to monitor progress.';
      }

      return {
        status: 'success',
        job_id: jobId,
        message: statusMessage,
        completed: jobResult.completed,
        input: {
          alignment: input.alignment_file,
          tree: input.tree_file,
          branches: input.branches || 'All',
          pvalue: input.pvalue || 0.1,
          genetic_code: input.genetic_code || 'Universal',
        }
      };
    } catch (error) {
      return {
        status: 'error',
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
);  

export const fetchDatamonkeyJobResults = ai.defineTool(
  {
    name: 'fetch_datamonkey_job_results',
    description: 'Fetch the results of a completed job from the Datamonkey API',
    inputSchema: schema.fetchDatamonkeyJobResultsSchema,
    outputSchema: z.object({
      status: z.string(),
      results: z.any().optional(),
      error: z.string().optional(),
      saved_to: z.string().optional(),
    }),
  },
  async (input: z.infer<typeof schema.fetchDatamonkeyJobResultsSchema>) => {
    try {
      let method = '';
      let payload: Record<string, any> | null = null;
      let payloadFound = false;
      
      logger.info(`Session ID: ${input.session?.id}`);
      // Try to get the job payload from the global job store
      logger.info(`Looking for job ${input.job_id} in global job store`);
      try {
        const job = await globalJobStore.getJob(input.job_id);
        if (job) {
          // Use payload (contains file handles for API communication)
          if (job.payload) {
            payload = job.payload;
            payloadFound = true;
            method = job.method;
            logger.info(`Fetching results for ${method} job ${input.job_id}`);
            logger.info(`Retrieved payload with file handles for job ${input.job_id} from global job store`);
          } else {
            logger.warn(`Job ${input.job_id} found in global job store but has no payload with file handles`);
          }
        } else {
          logger.warn(`Job ${input.job_id} not found in global job store`);
        }
      } catch (error) {
        logger.warn(`Could not retrieve job payload from session: ${error instanceof Error ? error.message : String(error)}`);
      }
      
      // If payload wasn't found, return an error - we can't proceed without it
      if (!payloadFound) {
        return {
          status: 'error',
          error: `Cannot fetch results: Original job payload not found for job ${input.job_id}. Please ensure the job was started in this session.`
        };
      }
      
      // Fetch results using the method-specific endpoint with the payload
      const resultsResponse = await utils.fetchMethodResultsImpl(method, input.job_id, payload);
      
      if (resultsResponse.status === 'error') {
        return {
          status: 'error',
          error: `Failed to fetch results: ${resultsResponse.error}`
        };
      }
      
      const results = resultsResponse.results;
      
      // Save to file if requested
      if (input.save_to) {
        fs.writeFileSync(input.save_to, JSON.stringify(results, null, 2));
        logger.info(`Results saved to ${input.save_to}`);
        return {
          status: 'success',
          results: results,
          saved_to: input.save_to
        };
      }
      
      return {
        status: 'success',
        results: results
      };
    } catch (error) {
      logger.error(`Error fetching results: ${error instanceof Error ? error.message : String(error)}`);
      return {
        status: 'error',
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
);

// Start or monitor BGM job tool
export const startOrMonitorBgmJob = ai.defineTool(
  {
    name: 'start_or_monitor_bgm_job',
    description: 'Start a BGM (Bayesian Graphical Model) analysis job on the Datamonkey API or check the status of an existing job.',
    inputSchema: z.object({
      alignment_file: schema.FilePathSchema.describe('Path to the alignment file in FASTA format'),
      genetic_code: z.string().optional().describe('Genetic code to use (default: Universal)'),
      session: z.object({
        id: z.string()
      }).optional().describe('Session information for tracking jobs'),
    }),
    outputSchema: z.object({
      status: z.string(),
      job_id: z.string().optional(),
      message: z.string().optional(),
      error: z.string().optional(),
      input: z.object({
        alignment: z.string().optional(),
        genetic_code: z.string().optional(),
      }).optional(),
    }),
  },
  async (input: z.infer<typeof schema.startOrMonitorNrmJobSchema>) => {
    try {
      // Upload alignment file
      const alignmentUpload = await utils.uploadFileToDatamonkeyImpl(input.alignment_file);
      if (alignmentUpload.status === 'error') {
        return {
          status: 'error',
          error: alignmentUpload.error
        };
      }
      
      // Prepare payload for BGM analysis
      const payload = {
        alignment: alignmentUpload.file_handle,
        genetic_code: input.genetic_code || 'Universal',
      };
      
      // Use helper function to start the job
      const jobResult = await utils.startOrMonitorMethodJobImpl('bgm', payload);
      
      if (jobResult.status === 'error') {
        return {
          status: 'error',
          error: jobResult.error,
          job_id: jobResult.jobId // Include job ID even on error for reference
        };
      }
      
      const jobId = jobResult.jobId;
      const sessionId = input.session?.id;
      
      // Determine job status for session tracking
      const jobStatus = jobResult.completed ? 'completed' : 'pending';
      
      // Store job in global job store for app-wide tracking
      globalJobStore.addJob({
        jobId: jobId,
        method: 'bgm',
        status: jobStatus,
        timestamp: Date.now(),
        fileName: input.alignment_file,
        treeName: undefined,
        // API payload with file handles (for API communication)
        payload: payload,
        // UI-friendly parameters with file paths (for display)
        params: {
          alignment: input.alignment_file,
          genetic_code: input.genetic_code || 'Universal'
        }
      });
      logger.info(`Job ${jobId} added to global job store`);
      
      // Customize message based on job status
      let statusMessage;
      if (jobResult.completed) {
        statusMessage = 'BGM analysis is already complete and ready for results. Use fetch_datamonkey_job_results to retrieve the results.';
      } else {
        statusMessage = 'BGM analysis started on Datamonkey API. Use check_datamonkey_job_status to monitor progress.';
      }
      
      return {
        status: 'success',
        job_id: jobId,
        message: statusMessage,
        completed: jobResult.completed,
        input: {
          alignment: input.alignment_file,
          genetic_code: input.genetic_code || 'Universal',
        }
      };
    } catch (error) {
      return {
        status: 'error',
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
);

export const startOrMonitorContrastFelJob = ai.defineTool(
  {
    name: 'start_or_monitor_contrast_fel_job',
    description: 'Start a Contrast-FEL analysis job on the Datamonkey API or check the status of an existing job.',
    inputSchema: schema.startOrMonitorContrastFelJobSchema,
    outputSchema: z.object({
      status: z.string(),
      job_id: z.string().optional(),
      message: z.string().optional(),
      error: z.string().optional(),
      input: z.object({
        alignment: z.string().optional(),
        tree: z.string().optional(),
        branches: z.string().optional(),
        pvalue: z.number().optional(),
        genetic_code: z.string().optional(),
      }).optional(),
    }),
  },
  async (input: z.infer<typeof schema.startOrMonitorContrastFelJobSchema>) => {
    try {
      // Upload alignment file
      const alignmentUpload = await utils.uploadFileToDatamonkeyImpl(input.alignment_file);
      if (alignmentUpload.status === 'error') {
        return {
          status: 'error',
          error: alignmentUpload.error
        };
      }
      
      // Upload tree file if provided
      let treeUpload = null;
      if (input.tree_file) {
        treeUpload = await utils.uploadFileToDatamonkeyImpl(input.tree_file);
        if (treeUpload.status === 'error') {
          return {
            status: 'error',
            error: treeUpload.error
          };
        }
      }
      
      // Prepare payload for Contrast-FEL analysis
      const payload = {
        alignment: alignmentUpload.file_handle,
        tree: treeUpload?.file_handle,
        branches: input.branches || 'All',
        genetic_code: input.genetic_code || 'Universal',
      };
      
      // Use helper function to start the job
      const jobResult = await utils.startOrMonitorMethodJobImpl('contrast-fel', payload);
      
      if (jobResult.status === 'error') {
        return {
          status: 'error',
          error: jobResult.error,
          job_id: jobResult.jobId // Include job ID even on error for reference
        };
      }
      
      const jobId = jobResult.jobId;
      const sessionId = input.session?.id;
      
      // Determine job status for session tracking
      const jobStatus = jobResult.completed ? 'completed' : 'pending';
      
      // Store job in global job store for app-wide tracking
      globalJobStore.addJob({
        jobId: jobId,
        method: 'contrast-fel',
        status: jobStatus,
        timestamp: Date.now(),
        fileName: input.alignment_file,
        treeName: input.tree_file,
        // API payload with file handles (for API communication)
        payload: payload,
        // UI-friendly parameters with file paths (for display)
        params: {
          alignment: input.alignment_file,
          tree: input.tree_file,
          branches: input.branches || 'All',
          genetic_code: input.genetic_code || 'Universal'
        }
      });
      logger.info(`Job ${jobId} added to global job store`);
      
      // Customize message based on job status
      let statusMessage;
      if (jobResult.completed) {
        statusMessage = 'Contrast-FEL analysis is already complete and ready for results. Use fetch_datamonkey_job_results to retrieve the results.';
      } else {
        statusMessage = 'Contrast-FEL analysis started on Datamonkey API. Use check_datamonkey_job_status to monitor progress.';
      }
      
      return {
        status: 'success',
        job_id: jobId,
        message: statusMessage,
        completed: jobResult.completed,
        input: {
          alignment: input.alignment_file,
          tree: input.tree_file,
          branches: input.branches || 'All',
          pvalue: input.pvalue || 0.1,
          genetic_code: input.genetic_code || 'Universal',
        }
      };
    } catch (error) {
      return {
        status: 'error',
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
);

// Start or monitor FADE job tool
export const startOrMonitorFadeJob = ai.defineTool(
  {
    name: 'start_or_monitor_fade_job',
    description: 'Start a FADE (FUBAR Approach to Directional Evolution) analysis job on the Datamonkey API or check the status of an existing job.',
    inputSchema: schema.startOrMonitorFadeJobSchema,
    outputSchema: z.object({
      status: z.string(),
      job_id: z.string().optional(),
      message: z.string().optional(),
      error: z.string().optional(),
      input: z.object({
        alignment: z.string().optional(),
        tree: z.string().optional(),
        branches: z.string().optional(),
        genetic_code: z.string().optional(),
      }).optional(),
    }),
  },
  async (input: z.infer<typeof schema.startOrMonitorFadeJobSchema>) => {
    try {
      // Upload alignment file
      const alignmentUpload = await utils.uploadFileToDatamonkeyImpl(input.alignment_file);
      if (alignmentUpload.status === 'error') {
        return {
          status: 'error',
          error: alignmentUpload.error
        };
      }
      
      // Upload tree file if provided
      let treeUpload = null;
      if (input.tree_file) {
        treeUpload = await utils.uploadFileToDatamonkeyImpl(input.tree_file);
        if (treeUpload.status === 'error') {
          return {
            status: 'error',
            error: treeUpload.error
          };
        }
      }
      
      // Prepare payload for FADE analysis
      const payload = {
        alignment: alignmentUpload.file_handle,
        tree: treeUpload?.file_handle,
        branches: input.branches || 'All',
        genetic_code: input.genetic_code || 'Universal',
      };
      
      // Use helper function to start the job
      const jobResult = await utils.startOrMonitorMethodJobImpl('fade', payload);
      
      if (jobResult.status === 'error') {
        return {
          status: 'error',
          error: jobResult.error,
          job_id: jobResult.jobId // Include job ID even on error for reference
        };
      }
      
      const jobId = jobResult.jobId;
      const sessionId = input.session?.id;
      
      // Determine job status for session tracking
      const jobStatus = jobResult.completed ? 'completed' : 'pending';
      
      // Extract dataset ID from alignment or tree file
      const datasetId = utils.extractDatasetId(input.alignment_file, input.tree_file);
      
      // Store job in global job store for app-wide tracking
      globalJobStore.addJob({
        jobId: jobId,
        method: 'fade',
        status: jobStatus,
        timestamp: Date.now(),
        fileName: input.alignment_file,
        treeName: input.tree_file,
        datasetId, // Add dataset ID to job info
        // API payload with file handles (for API communication)
        payload: payload,
        // UI-friendly parameters with file paths (for display)
        params: {
          alignment: input.alignment_file,
          tree: input.tree_file,
          branches: input.branches || 'All',
          genetic_code: input.genetic_code || 'Universal'
        }
      });
      logger.info(`Job ${jobId} added to global job store`);
      
      // Customize message based on job status
      let statusMessage;
      if (jobResult.completed) {
        statusMessage = 'FADE analysis is already complete and ready for results. Use fetch_datamonkey_job_results to retrieve the results.';
      } else {
        statusMessage = 'FADE analysis started on Datamonkey API. Use check_datamonkey_job_status to monitor progress.';
      }
      
      return {
        status: 'success',
        job_id: jobId,
        message: statusMessage,
        completed: jobResult.completed,
        input: {
          alignment: input.alignment_file,
          tree: input.tree_file,
          branches: input.branches || 'All',
          genetic_code: input.genetic_code || 'Universal',
        }
      };
    } catch (error) {
      return {
        status: 'error',
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
);

// Start or monitor FUBAR job tool
export const startOrMonitorFubarJob = ai.defineTool(
  {
    name: 'start_or_monitor_fubar_job',
    description: 'Start a FUBAR (Fast Unconstrained Bayesian AppRoximation) analysis job on the Datamonkey API or check the status of an existing job.',
    inputSchema: schema.startOrMonitorFubarJobSchema,
    outputSchema: z.object({
      status: z.string(),
      job_id: z.string().optional(),
      message: z.string().optional(),
      error: z.string().optional(),
      input: z.object({
        alignment: z.string().optional(),
        tree: z.string().optional(),
        branches: z.string().optional(),
        posterior: z.number().optional(),
        grid_points: z.number().optional(),
        chains: z.number().optional(),
        chain_length: z.number().optional(),
        burn_in: z.number().optional(),
        samples: z.number().optional(),
        genetic_code: z.string().optional(),
      }).optional(),
    }),
  },
  async (input: z.infer<typeof schema.startOrMonitorFubarJobSchema>) => {
    try {
      // Upload alignment file
      const alignmentUpload = await utils.uploadFileToDatamonkeyImpl(input.alignment_file);
      if (alignmentUpload.status === 'error') {
        return {
          status: 'error',
          error: alignmentUpload.error
        };
      }
      
      // Upload tree file if provided
      let treeUpload = null;
      if (input.tree_file) {
        treeUpload = await utils.uploadFileToDatamonkeyImpl(input.tree_file);
        if (treeUpload.status === 'error') {
          return {
            status: 'error',
            error: treeUpload.error
          };
        }
      }
      
      // Prepare payload for FUBAR analysis
      const payload = {
        alignment: alignmentUpload.file_handle,
        tree: treeUpload?.file_handle,
        branches: input.branches || 'All',
        posterior: input.posterior || 0.9,
        grid_points: input.grid_points || 20,
        chains: input.chains || 5,
        chain_length: input.chain_length || 2000000,
        burn_in: input.burn_in || 1000000,
        samples: input.samples || 100,
        genetic_code: input.genetic_code || 'Universal',
      };
      
      // Use helper function to start the job
      const jobResult = await utils.startOrMonitorMethodJobImpl('fubar', payload);
      
      if (jobResult.status === 'error') {
        return {
          status: 'error',
          error: jobResult.error,
          job_id: jobResult.jobId // Include job ID even on error for reference
        };
      }
      
      const jobId = jobResult.jobId;
      
      // Determine job status for session tracking
      const jobStatus = jobResult.completed ? 'completed' : 'pending';
      
      // Store job in global job store for app-wide tracking
      globalJobStore.addJob({
        jobId: jobId,
        method: 'fubar',
        status: jobStatus,
        timestamp: Date.now(),
        fileName: input.alignment_file,
        treeName: input.tree_file,
        // API payload with file handles (for API communication)
        payload: payload,
        // UI-friendly parameters with file paths (for display)
        params: {
          alignment: input.alignment_file,
          tree: input.tree_file,
          branches: input.branches || 'All',
          posterior: input.posterior || 0.9,
          grid_points: input.grid_points || 20,
          chains: input.chains || 5,
          chain_length: input.chain_length || 2000000,
          burn_in: input.burn_in || 1000000,
          samples: input.samples || 100,
          genetic_code: input.genetic_code || 'Universal'
        }
      });
      logger.info(`Job ${jobId} added to global job store`);
      
      // Customize message based on job status
      let statusMessage;
      if (jobResult.completed) {
        statusMessage = 'FUBAR analysis is already complete and ready for results. Use fetch_datamonkey_job_results to retrieve the results.';
      } else {
        statusMessage = 'FUBAR analysis started on Datamonkey API. Use check_datamonkey_job_status to monitor progress.';
      }
      
      return {
        status: 'success',
        job_id: jobId,
        message: statusMessage,
        completed: jobResult.completed,
        input: {
          alignment: input.alignment_file,
          tree: input.tree_file,
          branches: input.branches || 'All',
          posterior: input.posterior || 0.9,
          grid_points: input.grid_points || 20,
          chains: input.chains || 5,
          chain_length: input.chain_length || 2000000,
          burn_in: input.burn_in || 1000000,
          samples: input.samples || 100,
          genetic_code: input.genetic_code || 'Universal',
        }
      };
    } catch (error) {
      return {
        status: 'error',
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
);


// Start or monitor GARD job tool
export const startOrMonitorGardJob = ai.defineTool(
  {
    name: 'start_or_monitor_gard_job',
    description: 'Start a GARD (Genetic Algorithm for Recombination Detection) analysis job on the Datamonkey API or check the status of an existing job.',
    inputSchema: schema.startOrMonitorGardJobSchema,
    outputSchema: z.object({
      status: z.string(),
      job_id: z.string().optional(),
      message: z.string().optional(),
      error: z.string().optional(),
      input: z.object({
        alignment: z.string().optional(),
        rate_classes: z.number().optional(),
        site_rate_variation: z.string().optional(),
        genetic_code: z.string().optional(),
      }).optional(),
    }),
  },
  async (input: z.infer<typeof schema.startOrMonitorGardJobSchema>) => {
    try {
      // Upload alignment file
      const alignmentUpload = await utils.uploadFileToDatamonkeyImpl(input.alignment_file);
      if (alignmentUpload.status === 'error') {
        return {
          status: 'error',
          error: alignmentUpload.error
        };
      }
      
      // Prepare payload for GARD analysis
      const payload = {
        alignment: alignmentUpload.file_handle,
        rate_classes: input.rate_classes || 2,
        site_rate_variation: input.site_rate_variation || 'Yes',
        genetic_code: input.genetic_code || 'Universal',
      };
      
      // Use helper function to start the job
      const jobResult = await utils.startOrMonitorMethodJobImpl('gard', payload);
      
      if (jobResult.status === 'error') {
        return {
          status: 'error',
          error: jobResult.error,
          job_id: jobResult.jobId // Include job ID even on error for reference
        };
      }
      
      const jobId = jobResult.jobId;
      const sessionId = input.session?.id;
      
      // Determine job status for session tracking
      const jobStatus = jobResult.completed ? 'completed' : 'pending';
      
      // Store job in global job store for app-wide tracking
      globalJobStore.addJob({
        jobId: jobId,
        method: 'gard',
        status: jobStatus,
        timestamp: Date.now(),
        fileName: input.alignment_file,
        treeName: undefined,
        // API payload with file handles (for API communication)
        payload: payload,
        // UI-friendly parameters with file paths (for display)
        params: {
          alignment: input.alignment_file,
          rate_classes: input.rate_classes || 2,
          site_rate_variation: input.site_rate_variation || 'Yes',
          genetic_code: input.genetic_code || 'Universal'
        }
      });
      logger.info(`Job ${jobId} added to global job store`);
      
      // Customize message based on job status
      let statusMessage;
      if (jobResult.completed) {
        statusMessage = 'GARD analysis is already complete and ready for results. Use fetch_datamonkey_job_results to retrieve the results.';
      } else {
        statusMessage = 'GARD analysis started on Datamonkey API. Use check_datamonkey_job_status to monitor progress.';
      }
      
      return {
        status: 'success',
        job_id: jobId,
        message: statusMessage,
        completed: jobResult.completed,
        input: {
          alignment: input.alignment_file,
          rate_classes: input.rate_classes || 2,
          site_rate_variation: input.site_rate_variation || 'Yes',
          genetic_code: input.genetic_code || 'Universal',
        }
      };
    } catch (error) {
      return {
        status: 'error',
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
);

// Start or monitor MultiHit job tool
export const startOrMonitorMultihitJob = ai.defineTool(
  {
    name: 'start_or_monitor_multihit_job',
    description: 'Start a MultiHit analysis job on the Datamonkey API or check the status of an existing job.',
    inputSchema: schema.startOrMonitorMultihitJobSchema,
    outputSchema: z.object({
      status: z.string(),
      job_id: z.string().optional(),
      message: z.string().optional(),
      error: z.string().optional(),
      input: z.object({
        alignment: z.string().optional(),
        tree: z.string().optional(),
        branches: z.string().optional(),
        multiple_hits: z.string().optional(),
        genetic_code: z.string().optional(),
      }).optional(),
    }),
  },
  async (input: z.infer<typeof schema.startOrMonitorMultihitJobSchema>) => {
    try {
      // Upload alignment file
      const alignmentUpload = await utils.uploadFileToDatamonkeyImpl(input.alignment_file);
      if (alignmentUpload.status === 'error') {
        return {
          status: 'error',
          error: alignmentUpload.error
        };
      }
      
      // Upload tree file if provided
      let treeUpload = null;
      if (input.tree_file) {
        treeUpload = await utils.uploadFileToDatamonkeyImpl(input.tree_file);
        if (treeUpload.status === 'error') {
          return {
            status: 'error',
            error: treeUpload.error
          };
        }
      }
      
      // Prepare payload for MultiHit analysis
      const payload = {
        alignment: alignmentUpload.file_handle,
        tree: treeUpload?.file_handle,
        branches: input.branches || 'All',
        multiple_hits: input.multiple_hits || 'Double',
        genetic_code: input.genetic_code || 'Universal',
      };
      
      // Use helper function to start the job
      const jobResult = await utils.startOrMonitorMethodJobImpl('multihit', payload);
      
      if (jobResult.status === 'error') {
        return {
          status: 'error',
          error: jobResult.error,
          job_id: jobResult.jobId // Include job ID even on error for reference
        };
      }
      
      const jobId = jobResult.jobId;
      const sessionId = input.session?.id;
      
      // Determine job status for session tracking
      const jobStatus = jobResult.completed ? 'completed' : 'pending';
      
      // Store job in global job store for app-wide tracking
      globalJobStore.addJob({
        jobId: jobId,
        method: 'multihit',
        status: jobStatus,
        timestamp: Date.now(),
        fileName: input.alignment_file,
        treeName: input.tree_file,
        // API payload with file handles (for API communication)
        payload: payload,
        // UI-friendly parameters with file paths (for display)
        params: {
          alignment: input.alignment_file,
          tree: input.tree_file,
          branches: input.branches || 'All',
          multiple_hits: input.multiple_hits || 'Double',
          genetic_code: input.genetic_code || 'Universal'
        }
      });
      logger.info(`Job ${jobId} added to global job store`);
      
      // Customize message based on job status
      let statusMessage;
      if (jobResult.completed) {
        statusMessage = 'MultiHit analysis is already complete and ready for results. Use fetch_datamonkey_job_results to retrieve the results.';
      } else {
        statusMessage = 'MultiHit analysis started on Datamonkey API. Use check_datamonkey_job_status to monitor progress.';
      }
      
      return {
        status: 'success',
        job_id: jobId,
        message: statusMessage,
        completed: jobResult.completed,
        input: {
          alignment: input.alignment_file,
          tree: input.tree_file,
          branches: input.branches || 'All',
          multiple_hits: input.multiple_hits || 'Double',
          genetic_code: input.genetic_code || 'Universal',
        }
      };
    } catch (error) {
      return {
        status: 'error',
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
);


// Start or monitor NRM job tool
export const startOrMonitorNrmJob = ai.defineTool(
  {
    name: 'start_or_monitor_nrm_job',
    description: 'Start an NRM (Nucleotide Rate Matrix) analysis job on the Datamonkey API or check the status of an existing job.',
    inputSchema: schema.startOrMonitorNrmJobSchema,
    outputSchema: z.object({
      status: z.string(),
      job_id: z.string().optional(),
      message: z.string().optional(),
      error: z.string().optional(),
      input: z.object({
        alignment: z.string().optional(),
        tree: z.string().optional(),
        genetic_code: z.string().optional(),
      }).optional(),
    }),
  },
  async (input: z.infer<typeof schema.startOrMonitorNrmJobSchema>) => {
    try {
      // Upload alignment file
      const alignmentUpload = await utils.uploadFileToDatamonkeyImpl(input.alignment_file);
      if (alignmentUpload.status === 'error') {
        return {
          status: 'error',
          error: alignmentUpload.error
        };
      }
      
      // Upload tree file if provided
      let treeUpload = null;
      if (input.tree_file) {
        treeUpload = await utils.uploadFileToDatamonkeyImpl(input.tree_file);
        if (treeUpload.status === 'error') {
          return {
            status: 'error',
            error: treeUpload.error
          };
        }
      }
      
      // Prepare payload for NRM analysis
      const payload = {
        alignment: alignmentUpload.file_handle,
        tree: treeUpload?.file_handle,
        genetic_code: input.genetic_code || 'Universal',
      };
      
      // Use helper function to start the job
      const jobResult = await utils.startOrMonitorMethodJobImpl('nrm', payload);
      
      if (jobResult.status === 'error') {
        return {
          status: 'error',
          error: jobResult.error,
          job_id: jobResult.jobId // Include job ID even on error for reference
        };
      }
      
      const jobId = jobResult.jobId;
      const sessionId = input.session?.id;
      
      // Determine job status for session tracking
      const jobStatus = jobResult.completed ? 'completed' : 'pending';
      
      // Store job in global job store for app-wide tracking
      globalJobStore.addJob({
        jobId: jobId,
        method: 'nrm',
        status: jobStatus,
        timestamp: Date.now(),
        fileName: input.alignment_file,
        treeName: input.tree_file,
        // API payload with file handles (for API communication)
        payload: payload,
        // UI-friendly parameters with file paths (for display)
        params: {
          alignment: input.alignment_file,
          tree: input.tree_file,
          genetic_code: input.genetic_code || 'Universal'
        }
      });
      logger.info(`Job ${jobId} added to global job store`);
      
      // Customize message based on job status
      let statusMessage;
      if (jobResult.completed) {
        statusMessage = 'NRM analysis is already complete and ready for results. Use fetch_datamonkey_job_results to retrieve the results.';
      } else {
        statusMessage = 'NRM analysis started on Datamonkey API. Use check_datamonkey_job_status to monitor progress.';
      }
      
      return {
        status: 'success',
        job_id: jobId,
        message: statusMessage,
        completed: jobResult.completed,
        input: {
          alignment: input.alignment_file,
          tree: input.tree_file,
          genetic_code: input.genetic_code || 'Universal',
        }
      };
    } catch (error) {
      return {
        status: 'error',
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
);

// Start or monitor RELAX job tool
export const startOrMonitorRelaxJob = ai.defineTool(
  {
    name: 'start_or_monitor_relax_job',
    description: 'Start a RELAX (Relaxation of Selection) analysis job on the Datamonkey API or check the status of an existing job.',
    inputSchema: schema.startOrMonitorRelaxJobSchema,
    outputSchema: z.object({
      status: z.string(),
      job_id: z.string().optional(),
      message: z.string().optional(),
      error: z.string().optional(),
      input: z.object({
        alignment: z.string().optional(),
        tree: z.string().optional(),
        test_branches: z.string().optional(),
        reference_branches: z.string().optional(),
        genetic_code: z.string().optional(),
      }).optional(),
    }),
  },
  async (input: z.infer<typeof schema.startOrMonitorRelaxJobSchema>) => {
    try {
      // Upload alignment file
      const alignmentUpload = await utils.uploadFileToDatamonkeyImpl(input.alignment_file);
      if (alignmentUpload.status === 'error') {
        return {
          status: 'error',
          error: alignmentUpload.error
        };
      }
      
      // Upload tree file if provided
      let treeUpload = null;
      if (input.tree_file) {
        treeUpload = await utils.uploadFileToDatamonkeyImpl(input.tree_file);
        if (treeUpload.status === 'error') {
          return {
            status: 'error',
            error: treeUpload.error
          };
        }
      }
      
      // Prepare payload for RELAX analysis
      const payload = {
        alignment: alignmentUpload.file_handle,
        tree: treeUpload?.file_handle,
        test_branches: input.test_branches || '',
        reference_branches: input.reference_branches || '',
        genetic_code: input.genetic_code || 'Universal',
      };
      
      // Use helper function to start the job
      const jobResult = await utils.startOrMonitorMethodJobImpl('relax', payload);
      
      if (jobResult.status === 'error') {
        return {
          status: 'error',
          error: jobResult.error,
          job_id: jobResult.jobId // Include job ID even on error for reference
        };
      }
      
      const jobId = jobResult.jobId;
      const sessionId = input.session?.id;
      
      // Determine job status for session tracking
      const jobStatus = jobResult.completed ? 'completed' : 'pending';
      
      // Store job in global job store for app-wide tracking
      globalJobStore.addJob({
        jobId: jobId,
        method: 'relax',
        status: jobStatus,
        timestamp: Date.now(),
        fileName: input.alignment_file,
        treeName: input.tree_file,
        // API payload with file handles (for API communication)
        payload: payload,
        // UI-friendly parameters with file paths (for display)
        params: {
          alignment: input.alignment_file,
          tree: input.tree_file,
          test_branches: input.test_branches || '',
          reference_branches: input.reference_branches || '',
          genetic_code: input.genetic_code || 'Universal'
        }
      });
      logger.info(`Job ${jobId} added to global job store`);
      
      // Customize message based on job status
      let statusMessage;
      if (jobResult.completed) {
        statusMessage = 'RELAX analysis is already complete and ready for results. Use fetch_datamonkey_job_results to retrieve the results.';
      } else {
        statusMessage = 'RELAX analysis started on Datamonkey API. Use check_datamonkey_job_status to monitor progress.';
      }
      
      return {
        status: 'success',
        job_id: jobId,
        message: statusMessage,
        completed: jobResult.completed,
        input: {
          alignment: input.alignment_file,
          tree: input.tree_file,
          test_branches: input.test_branches || '',
          reference_branches: input.reference_branches || '',
          genetic_code: input.genetic_code || 'Universal',
        }
      };
    } catch (error) {
      return {
        status: 'error',
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
);

// Start or monitor SLAC job tool
export const startOrMonitorSlacJob = ai.defineTool(
  {
    name: 'start_or_monitor_slac_job',
    description: 'Start a SLAC (Single-Likelihood Ancestor Counting) analysis job on the Datamonkey API or check the status of an existing job.',
    inputSchema: schema.startOrMonitorSlacJobSchema,
    outputSchema: z.object({
      status: z.string(),
      job_id: z.string().optional(),
      message: z.string().optional(),
      error: z.string().optional(),
      input: z.object({
        alignment: z.string().optional(),
        tree: z.string().optional(),
        branches: z.string().optional(),
        pvalue: z.number().optional(),
        samples: z.number().optional(),
        genetic_code: z.string().optional(),
      }).optional(),
    }),
  },
  async (input: z.infer<typeof schema.startOrMonitorSlacJobSchema>) => {
    try {
      // Upload alignment file
      const alignmentUpload = await utils.uploadFileToDatamonkeyImpl(input.alignment_file);
      if (alignmentUpload.status === 'error') {
        return {
          status: 'error',
          error: alignmentUpload.error
        };
      }
      
      // Upload tree file if provided
      let treeUpload = null;
      if (input.tree_file) {
        treeUpload = await utils.uploadFileToDatamonkeyImpl(input.tree_file);
        if (treeUpload.status === 'error') {
          return {
            status: 'error',
            error: treeUpload.error
          };
        }
      }
      
      // Prepare payload for SLAC analysis
      const payload = {
        alignment: alignmentUpload.file_handle,
        tree: treeUpload?.file_handle,
        branches: input.branches || 'All',
        samples: input.samples || 100,
        genetic_code: input.genetic_code || 'Universal',
      };
      
      // Use helper function to start the job
      const jobResult = await utils.startOrMonitorMethodJobImpl('slac', payload);
      
      if (jobResult.status === 'error') {
        return {
          status: 'error',
          error: jobResult.error,
          job_id: jobResult.jobId // Include job ID even on error for reference
        };
      }
      
      const jobId = jobResult.jobId;
      const sessionId = input.session?.id;
      
      // Determine job status for session tracking
      const jobStatus = jobResult.completed ? 'completed' : 'pending';
      
      // Extract dataset ID from alignment or tree file
      const datasetId = utils.extractDatasetId(input.alignment_file, input.tree_file);
      
      // Store job in global job store for app-wide tracking
      globalJobStore.addJob({
        jobId: jobId,
        method: 'slac',
        status: jobStatus,
        timestamp: Date.now(),
        fileName: input.alignment_file,
        treeName: input.tree_file,
        datasetId, // Add dataset ID to job info
        // API payload with file handles (for API communication)
        payload: payload,
        // UI-friendly parameters with file paths (for display)
        params: {
          alignment: input.alignment_file,
          tree: input.tree_file,
          branches: input.branches || 'All',
          pvalue: input.pvalue || 0.1,
          samples: input.samples || 100,
          genetic_code: input.genetic_code || 'Universal'
        }
      });
      logger.info(`Job ${jobId} added to global job store`);
      
      // Customize message based on job status
      let statusMessage;
      if (jobResult.completed) {
        statusMessage = 'SLAC analysis is already complete and ready for results. Use fetch_datamonkey_job_results to retrieve the results.';
      } else {
        statusMessage = 'SLAC analysis started on Datamonkey API. Use check_datamonkey_job_status to monitor progress.';
      }
      
      return {
        status: 'success',
        job_id: jobId,
        message: statusMessage,
        completed: jobResult.completed,
        input: {
          alignment: input.alignment_file,
          tree: input.tree_file,
          branches: input.branches || 'All',
          pvalue: input.pvalue || 0.1,
          samples: input.samples || 100,
          genetic_code: input.genetic_code || 'Universal',
        }
      };
    } catch (error) {
      return {
        status: 'error',
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
);

// Start or monitor Slatkin job tool
export const startOrMonitorSlatkinJob = ai.defineTool(
  {
    name: 'start_or_monitor_slatkin_job',
    description: 'Start a Slatkin-Maddison test for phylogeny-trait association on the Datamonkey API or check the status of an existing job.',
    inputSchema: schema.startOrMonitorSlatkinJobSchema,
    outputSchema: z.object({
      status: z.string(),
      job_id: z.string().optional(),
      message: z.string().optional(),
      error: z.string().optional(),
      input: z.object({
        alignment: z.string().optional(),
        tree: z.string().optional(),
        genetic_code: z.string().optional(),
      }).optional(),
    }),
  },
  async (input: z.infer<typeof schema.startOrMonitorSlatkinJobSchema>) => {
    try {
      // Upload alignment file
      const alignmentUpload = await utils.uploadFileToDatamonkeyImpl(input.alignment_file);
      if (alignmentUpload.status === 'error') {
        return {
          status: 'error',
          error: alignmentUpload.error
        };
      }
      
      // Upload tree file if provided
      let treeUpload = null;
      if (input.tree_file) {
        treeUpload = await utils.uploadFileToDatamonkeyImpl(input.tree_file);
        if (treeUpload.status === 'error') {
          return {
            status: 'error',
            error: treeUpload.error
          };
        }
      }
      
      // Prepare payload for Slatkin analysis
      const payload = {
        alignment: alignmentUpload.file_handle,
        tree: treeUpload?.file_handle,
        genetic_code: input.genetic_code || 'Universal',
      };
      
      // Use helper function to start the job
      const jobResult = await utils.startOrMonitorMethodJobImpl('slatkin', payload);
      
      if (jobResult.status === 'error') {
        return {
          status: 'error',
          error: jobResult.error,
          job_id: jobResult.jobId // Include job ID even on error for reference
        };
      }
      
      const jobId = jobResult.jobId;
      
      // Determine job status for session tracking
      const jobStatus = jobResult.completed ? 'completed' : 'pending';
      
      // Add job to global job store
      globalJobStore.addJob({
        jobId: jobId,
        method: 'slatkin',
        status: jobStatus,
        timestamp: Date.now(),
        fileName: input.alignment_file,
        treeName: input.tree_file,
        // API payload with file handles (for API communication)
        payload: payload,
        // UI-friendly parameters with file paths (for display)
        params: {
          alignment: input.alignment_file,
          tree: input.tree_file,
          genetic_code: input.genetic_code || 'Universal'
        }
      });
      logger.info(`Job ${jobId} added to global job store`);
      
      // Customize message based on job status
      let statusMessage;
      if (jobResult.completed) {
        statusMessage = 'Slatkin-Maddison test is already complete and ready for results. Use fetch_datamonkey_job_results to retrieve the results.';
      } else {
        statusMessage = 'Slatkin-Maddison test started on Datamonkey API. Use check_datamonkey_job_status to monitor progress.';
      }
      
      return {
        status: 'success',
        job_id: jobId,
        message: statusMessage,
        completed: jobResult.completed,
        input: {
          alignment: input.alignment_file,
          tree: input.tree_file,
          genetic_code: input.genetic_code || 'Universal',
        }
      };
    } catch (error: any) {
      return {
        status: 'error',
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
);

export const hyphyTools = [
    startOrMonitorNrmJob,
    startOrMonitorRelaxJob,
    startOrMonitorSlacJob,
    startOrMonitorSlatkinJob,
    startOrMonitorFubarJob,
    startOrMonitorFelJob,
    startOrMonitorGardJob,
    startOrMonitorMultihitJob,
    startOrMonitorAbsrelJob,
    startOrMonitorBustedJob,
    startOrMonitorBgmJob,
    startOrMonitorContrastFelJob,
    startOrMonitorFadeJob,
    startOrMonitorMemeJob,
    uploadFileToDatamonkey,
    checkDatasetExists,
    getAvailableMethods,
];
  