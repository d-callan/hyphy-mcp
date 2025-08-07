import { genkit, z } from 'genkit';
import { googleAI } from '@genkit-ai/googleai';
import { logger } from '@genkit-ai/core/logging';
import dotenv from 'dotenv';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { FileSessionStore } from './sessionStore';
import { fileManager } from './fileManager';
import { globalJobStore } from './globalJobStore';
// We'll import the job tracker after ai is defined to avoid circular dependencies

// Initialize session store for chat message history
const sessionStore = new FileSessionStore('./data/sessions');

// Load environment variables from .env file
dotenv.config();

// Imports for other providers based on installed packages
import { anthropic, claude35Sonnet, claude35Haiku, claude37Sonnet, claude3Haiku, claude3Opus, claude3Sonnet, claude4Opus, claude4Sonnet } from 'genkitx-anthropic';
import { ollama } from 'genkitx-ollama';
import { openAI } from '@genkit-ai/compat-oai/openai';
import { deepSeek } from '@genkit-ai/compat-oai/deepseek';


// Helper function to configure the model based on environment variables
export function configureModel() {
  const provider = process.env.MODEL_PROVIDER || 'google';
  const modelName = process.env.MODEL_NAME || 'gemini-2.5-flash';
  const temperature = parseFloat(process.env.MODEL_TEMPERATURE || '0.7');
  
  switch(provider.toLowerCase()) {
    case 'google':
      // Configure Google AI with API key if provided
      if (process.env.GOOGLE_API_KEY) {
        return googleAI.model(modelName, {
          temperature,
          apiKey: process.env.GOOGLE_API_KEY,
        });
      } else {
        return googleAI.model(modelName, { temperature });
      }
    
    case 'openai':
      if (!process.env.OPENAI_API_KEY) {
        throw new Error('OPENAI_API_KEY is required when using OpenAI provider');
      }
      return openAI.model(modelName, {
        temperature,
        apiKey: process.env.OPENAI_API_KEY,
      });
    
    case 'anthropic':
      if (!process.env.ANTHROPIC_API_KEY) {
        throw new Error('ANTHROPIC_API_KEY is required when using Anthropic provider');
      }
      // Anthropic requires using specific model references directly
      // Apply temperature through Genkit's model options
      const modelOptions = { temperature };
      
      switch(modelName) {
        case 'claude-3-5-sonnet':
          return claude35Sonnet;
        case 'claude-3-5-haiku':
          return claude35Haiku;
        case 'claude-3-7-sonnet':
          return claude37Sonnet;
        case 'claude-3-haiku':
          return claude3Haiku;
        case 'claude-3-opus':
          return claude3Opus;
        case 'claude-3-sonnet':
          return claude3Sonnet;
        case 'claude-4-opus':
          return claude4Opus;
        case 'claude-4-sonnet':
          return claude4Sonnet;
        default:
          logger.warn(`Unknown Anthropic model '${modelName}', falling back to claude-3-5-sonnet`);
          return claude35Sonnet;
      }
    
    case 'ollama':
      const ollamaUrl = process.env.OLLAMA_URL || 'http://localhost:11434';
      return ollama.model(modelName, {
        temperature,
        baseURL: ollamaUrl,
      });

    case 'deepseek':
      if (!process.env.DEEPSEEK_API_KEY) {
        throw new Error('DEEPSEEK_API_KEY is required when using DeepSeek provider');
      }
      return deepSeek.model(modelName, {
        temperature,
        apiKey: process.env.DEEPSEEK_API_KEY,
      });
    
    default:
      logger.warn(`Unknown provider '${provider}', falling back to Google AI`);
      return googleAI.model(modelName, { temperature });
  }
}

// Helper function to configure model provider plugins
function configureProviderPlugins() {
  const provider = process.env.MODEL_PROVIDER || 'google';
  
  switch(provider.toLowerCase()) {
    case 'google':
      return googleAI(process.env.GOOGLE_API_KEY ? { apiKey: process.env.GOOGLE_API_KEY } : undefined);
    
    case 'openai':
      if (!process.env.OPENAI_API_KEY) {
        throw new Error('OPENAI_API_KEY is required when using OpenAI provider');
      }
      return openAI({ apiKey: process.env.OPENAI_API_KEY });
    
    case 'anthropic':
      if (!process.env.ANTHROPIC_API_KEY) {
        throw new Error('ANTHROPIC_API_KEY is required when using Anthropic provider');
      }
      return anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    
    case 'ollama':
      const ollamaUrl = process.env.OLLAMA_URL || 'http://localhost:11434';
      return ollama({ serverAddress: ollamaUrl });
    
    case 'deepseek':
      if (!process.env.DEEPSEEK_API_KEY) {
        throw new Error('DEEPSEEK_API_KEY is required when using DeepSeek provider');
      }
      return deepSeek({ apiKey: process.env.DEEPSEEK_API_KEY });
    
    default:
      logger.warn(`Unknown provider '${provider}', falling back to Google AI`);
      return googleAI();
  }
}

// Get model configuration
const modelConfig = (() => {
  try {
    return configureModel();
  } catch (error: any) { // Type assertion for error
    logger.error(`Error configuring model: ${error?.message || 'Unknown error'}`);
    logger.warn('Falling back to default Google AI model');
    return googleAI.model('gemini-2.5-flash', { temperature: 0.7 });
  }
})();

// Configure Genkit and plugins centrally
const ai = genkit({
  plugins: [
    // Configure your model provider based on environment variables
    configureProviderPlugins(),
  ],
  model: modelConfig,
  // You can register your flows here, but importing them and ensuring they
  // are defined is often enough, especially for simpler setups.
  // resources: {
  //   flows: { chatFlow },
  // },
});

// Set logging level (optional, useful for debugging)
logger.setLogLevel('debug');

// Configuration
const datamonkeyConfig = {
  apiUrl: process.env.DATAMONKEY_API_URL || 'http://localhost',
  apiPort: parseInt(process.env.DATAMONKEY_API_PORT || '9300'),
};

// Helper function to get full API URL
const getApiUrl = () => `${datamonkeyConfig.apiUrl}:${datamonkeyConfig.apiPort}/api/v1`;

// Define schemas for common inputs
const FilePathSchema = z.string().describe('Path to a file');
const OptionalFilePathSchema = z.string().optional().describe('Optional path to a file');
const DatasetIdSchema = z.string().describe('Datamonkey dataset ID');

// Helper function to check if a dataset exists on the Datamonkey API
async function checkDatasetExistsImpl(datasetId: string): Promise<boolean> {
  try {
    logger.info(`Checking if dataset exists: ${datasetId}`);
    
    // Get the list of datasets from the API
    const response = await axios.get(`${getApiUrl()}/datasets`, {
      validateStatus: null // Don't throw on any status code
    });
    
    // Log response details
    logger.info(`Response status: ${response.status}`);
    
    if (response.status >= 400) {
      logger.error(`Error response from Datamonkey API: ${JSON.stringify(response.data)}`);
      return false;
    }
    
    // Check if the dataset exists in the response
    if (Array.isArray(response.data)) {
      // If the response is an array, check if any dataset has the matching ID
      const exists = response.data.some((dataset: any) => dataset.id === datasetId);
      logger.info(`Dataset ${datasetId} ${exists ? 'exists' : 'does not exist'} on the server`);
      return exists;
    } else if (response.data && typeof response.data === 'object') {
      // If the response is an object with datasets property, check that
      const datasets = response.data.datasets || [];
      const exists = datasets.some((dataset: any) => dataset.id === datasetId);
      logger.info(`Dataset ${datasetId} ${exists ? 'exists' : 'does not exist'} on the server`);
      return exists;
    }
    
    logger.warn(`Unexpected response format from Datamonkey API: ${JSON.stringify(response.data)}`);
    return false;
  } catch (error) {
    logger.error(`Error checking if dataset exists: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

// Helper function to upload a file to Datamonkey API
async function uploadFileToDatamonkeyImpl(filePath: string, skipExistenceCheck: boolean = false) {
  try {
    // Check if file exists locally
    if (!fs.existsSync(filePath)) {
      logger.error(`File not found: ${filePath}`);
      return {
        status: 'error',
        error: `File not found: ${filePath}`
      };
    }
    
    // Read file content and generate a hash to use as a unique identifier
    const fileContent = fs.readFileSync(filePath);
    const crypto = require('crypto');
    const fileHash = crypto.createHash('sha256').update(fileContent).digest('hex');
    logger.info(`Generated file hash: ${fileHash}`);
    
    // Get file stats and name
    const fileStats = fs.statSync(filePath);
    const fileName = path.basename(filePath);
    
    // Check if this file already exists on the server (by hash/ID)
    if (!skipExistenceCheck) {
      logger.info(`Checking if file already exists on server with ID: ${fileHash}`);
      const exists = await checkDatasetExistsImpl(fileHash);
      
      if (exists) {
        logger.info(`File already exists on server with ID: ${fileHash}`);
        return {
          status: 'success',
          file_handle: fileHash,
          file_name: fileName,
          file_size: fileStats.size,
          already_exists: true
        };
      }
    }
    
    // Log file details
    logger.info(`Uploading file: ${filePath}`);
    logger.info(`File size: ${fileStats.size} bytes`);
    logger.info(`File permissions: ${fileStats.mode.toString(8)}`);
    logger.info(`File last modified: ${fileStats.mtime}`);
    logger.info(`File name: ${fileName}`);
    
    // Log file content preview (first 100 chars)
    const contentPreview = fileContent.slice(0, 100).toString('utf8').replace(/\n/g, ' ');
    logger.info(`File content preview: ${contentPreview}...`);
    
    // Create form data with required meta field
    const formData = new FormData();
    
    // Add meta information as required by the API
    const meta = {
      name: fileName,
      description: `Uploaded from GenKit client at ${new Date().toISOString()}`,
      type: 'fasta' // Assuming FASTA format for HyPhy analysis
    };
    
    // Add meta as JSON string
    formData.append('meta', JSON.stringify(meta));
    
    // Add file
    formData.append('file', new Blob([fileContent]), fileName);
    
    // Log the complete request payload
    logger.info(`Request payload: file=${fileName}, meta=${JSON.stringify(meta)}`);
    
    // Log request details
    const apiUrl = getApiUrl();
    const endpoint = `${apiUrl}/datasets`;
    
    // Ensure we're using the correct API endpoint format
    // The API spec shows /api/v1/datasets but our getApiUrl might return something different
    logger.info(`Sending request to Datamonkey API: ${endpoint}`);
    logger.info(`Request headers: ${JSON.stringify({
      'Content-Type': 'multipart/form-data',
      // Add any other headers that might be relevant
    })}`);
    
    // Upload to Datamonkey API with detailed logging
    logger.info('Sending request to Datamonkey API...');
    
    try {
      const response = await axios.post(endpoint, formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        },
        validateStatus: null // Don't throw on any status code
      });
      
      // Log response details
      logger.info(`Response status: ${response.status}`);
      logger.info(`Response headers: ${JSON.stringify(response.headers)}`);
      
      if (response.status >= 400) {
        logger.error(`Error response from Datamonkey API: ${JSON.stringify(response.data)}`);
        return {
          status: 'error',
          error: `API returned status ${response.status}: ${JSON.stringify(response.data)}`
        };
      }
      
      logger.info(`Response data: ${JSON.stringify(response.data)}`);
      
      // Extract file handle from response - API returns 'file' property, not 'id'
      const fileHandle = response.data.file;
      if (!fileHandle) {
        logger.error('No file handle returned from Datamonkey API');
        return {
          status: 'error',
          error: 'No file handle returned from Datamonkey API'
        };
      }
      
      logger.info(`Successfully uploaded file with handle: ${fileHandle}`);
      
      return {
        status: 'success',
        file_handle: fileHandle,
        file_name: fileName,
        file_size: fileStats.size
      };
    } catch (requestError) {
      logger.error(`Request error: ${requestError instanceof Error ? requestError.message : String(requestError)}`);
      if (requestError instanceof Error && 'response' in requestError) {
        const axiosError = requestError as any;
        if (axiosError.response) {
          logger.error(`Response status: ${axiosError.response.status}`);
          logger.error(`Response data: ${JSON.stringify(axiosError.response.data)}`);
        }
        if (axiosError.request) {
          logger.error(`Request details: ${JSON.stringify(axiosError.request)}`);
        }
        if (axiosError.config) {
          logger.error(`Request config: ${JSON.stringify({
            url: axiosError.config.url,
            method: axiosError.config.method,
            headers: axiosError.config.headers
          })}`);
        }
      }
      throw requestError;
    }
  } catch (error) {
    logger.error(`Error in uploadFileToDatamonkeyImpl: ${error instanceof Error ? error.message : String(error)}`);
    return {
      status: 'error',
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

// Upload file tool
export const uploadFileToDatamonkey = ai.defineTool(
  {
    name: 'upload_file_to_datamonkey',
    description: 'Upload a file to the Datamonkey API and return the file handle',
    inputSchema: z.object({
      file_path: FilePathSchema.describe('Path to the file to upload'),
    }),
    outputSchema: z.object({
      status: z.string(),
      file_handle: z.string().optional(),
      file_name: z.string().optional(),
      file_size: z.number().optional(),
      error: z.string().optional(),
    }),
  },
  async (input) => {
    return uploadFileToDatamonkeyImpl(input.file_path);
  }
);

// Start or monitor BUSTED job tool
export const startOrMonitorBustedJob = ai.defineTool(
  {
    name: 'start_or_monitor_busted_job',
    description: 'Start a BUSTED analysis job on the Datamonkey API or check the status of an existing job.',
    inputSchema: z.object({
      alignment_file: FilePathSchema.describe('Path to the alignment file in FASTA format'),
      tree_file: OptionalFilePathSchema.describe('Optional path to the tree file in Newick format'),
      branches: z.string().optional().describe('Branch selection specification (e.g., "All", "Internal", or specific branches)'),
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
        tree: z.string().optional(),
        branches: z.string().optional(),
      }).optional(),
    }),
  },
  async (input) => {
    try {
      // Upload alignment file
      const alignmentUpload = await uploadFileToDatamonkeyImpl(input.alignment_file);
      if (alignmentUpload.status === 'error') {
        return { status: 'error', error: alignmentUpload.error };
      }
      
      // Upload tree file if provided
      let treeUpload = null;
      if (input.tree_file) {
        treeUpload = await uploadFileToDatamonkeyImpl(input.tree_file);
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
      const jobResult = await startOrMonitorMethodJobImpl('busted', payload);
      
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
      const jobInfo = {
        jobId: jobId,
        method: 'busted',
        status: jobStatus,
        timestamp: Date.now(),
        fileName: input.alignment_file,
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

// Check if dataset exists tool
export const checkDatasetExists = ai.defineTool(
  {
    name: 'check_dataset_exists',
    description: 'Check if a dataset exists on the Datamonkey API',
    inputSchema: z.object({
      dataset_id: DatasetIdSchema,
    }),
    outputSchema: z.object({
      exists: z.boolean(),
      dataset_id: z.string(),
    }),
  },
  async (input) => {
    const exists = await checkDatasetExistsImpl(input.dataset_id);
    return {
      exists,
      dataset_id: input.dataset_id,
    };
  }
);

// Get available methods tool
export const getAvailableMethods = ai.defineTool(
  {
    name: 'get_available_methods',
    description: 'Get a list of available HyPhy analysis methods supported by the Datamonkey API',
    inputSchema: z.object({}),
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

// Start or monitor   FEL job tool
export const startOrMonitorFelJob = ai.defineTool(
  {
    name: 'start_or_monitor_fel_job',
    description: 'Start a FEL (Fixed Effects Likelihood) analysis job on the Datamonkey API or check the status of an existing job.',
    inputSchema: z.object({
      alignment_file: FilePathSchema.describe('Path to the alignment file in FASTA format'),
      tree_file: OptionalFilePathSchema.describe('Optional path to the tree file in Newick format'),
      branches: z.string().optional().describe('Branch selection specification (e.g., "All", "Internal", or specific branches)'),
      pvalue: z.number().optional().describe('P-value threshold for significance (default: 0.1)'),
      ci: z.enum(['Yes', 'No']).optional().describe('Compute confidence intervals for estimated rates'),
      srv: z.enum(['Yes', 'No']).optional().describe('Include synonymous rate variation in the model'),
      resample: z.number().optional().describe('Number of bootstrap resamples'),
      multiple_hits: z.enum(['None', 'Double', 'Double+Triple']).optional().describe('Specify handling of multiple nucleotide substitutions'),
      site_multihit: z.enum(['Estimate', 'Global']).optional().describe('Specify whether to estimate multiple hit rates for each site'),
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
  async (input) => {
    try {
      // Log input parameters
      logger.info(`Starting FEL job with alignment file: ${input.alignment_file}`);
      if (input.tree_file) {
        logger.info(`Tree file provided: ${input.tree_file}`);
      }
      
      // Upload alignment file
      logger.info(`Uploading alignment file: ${input.alignment_file}`);
      const alignmentUpload = await uploadFileToDatamonkeyImpl(input.alignment_file);
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
        logger.info(`Uploading tree file: ${input.tree_file}`);
        treeUpload = await uploadFileToDatamonkeyImpl(input.tree_file);
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
      const jobResult = await startOrMonitorMethodJobImpl('fel', payload);
      
      if (jobResult.status === 'error') {
        return {
          status: 'error',
          error: jobResult.error,
          job_id: jobResult.jobId // Include job ID even on error for reference
        };
      }
      
      // Determine job status
      const jobStatus = jobResult.completed ? 'completed' : 'pending';
      
      // Store job in global job store for app-wide tracking
      globalJobStore.addJob({
        jobId: jobResult.jobId,
        method: 'fel',
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
    inputSchema: z.object({
      alignment_file: FilePathSchema.describe('Path to the alignment file in FASTA format'),
      tree_file: OptionalFilePathSchema.describe('Optional path to the tree file in Newick format'),
      branches: z.string().optional().describe('Branch selection specification (e.g., "All", "Internal", or specific branches)'),
      pvalue: z.number().optional().describe('P-value threshold for significance (default: 0.1)'),
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
        tree: z.string().optional(),
        branches: z.string().optional(),
        pvalue: z.number().optional(),
        genetic_code: z.string().optional(),
      }).optional(),
    }),
  },
  async (input) => {
    try {
      // Upload alignment file
      const alignmentUpload = await uploadFileToDatamonkeyImpl(input.alignment_file);
      if (alignmentUpload.status === 'error') {
        return {
          status: 'error',
          error: alignmentUpload.error
        };
      }
      
      // Upload tree file if provided
      let treeUpload = null;
      if (input.tree_file) {
        treeUpload = await uploadFileToDatamonkeyImpl(input.tree_file);
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
      const jobResult = await startOrMonitorMethodJobImpl('meme', payload);
      
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

// Start or monitor ABSREL job tool
export const startOrMonitorAbsrelJob = ai.defineTool(
  {
    name: 'start_or_monitor_absrel_job',
    description: 'Start an ABSREL (Adaptive Branch-Site Random Effects Likelihood) analysis job on the Datamonkey API or check the status of an existing job.',
    inputSchema: z.object({
      alignment_file: FilePathSchema.describe('Path to the alignment file in FASTA format'),
      tree_file: OptionalFilePathSchema.describe('Optional path to the tree file in Newick format'),
      branches: z.string().optional().describe('Branch selection specification (e.g., "All", "Internal", or specific branches)'),
      pvalue: z.number().optional().describe('P-value threshold for significance (default: 0.1)'),
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
        tree: z.string().optional(),
        branches: z.string().optional(),
        pvalue: z.number().optional(),
        genetic_code: z.string().optional(),
      }).optional(),
    }),
  },
  async (input) => {
    try {
      // Upload alignment file
      const alignmentUpload = await uploadFileToDatamonkeyImpl(input.alignment_file);
      if (alignmentUpload.status === 'error') {
        return {
          status: 'error',
          error: alignmentUpload.error
        };
      }
      
      // Upload tree file if provided
      let treeUpload = null;
      if (input.tree_file) {
        treeUpload = await uploadFileToDatamonkeyImpl(input.tree_file);
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
      const jobResult = await startOrMonitorMethodJobImpl('absrel', payload);
      
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

/**
 * Helper function to fetch results for a specific method from the Datamonkey API
 * @param method The HyPhy method name (e.g., 'fel', 'meme', etc.)
 * @param jobId The ID of the job to fetch results for
 * @param payload The original payload used to submit the job
 * @returns Object containing the results or error information
 */
async function fetchMethodResultsImpl(method: string, jobId: string, payload: any) {
  try {
    // Validate payload
    if (!payload || Object.keys(payload).length === 0) {
      return {
        status: 'error',
        error: `Cannot fetch results: Missing or empty payload for job ${jobId}`
      };
    }
    
    // First check if the job is finished
    logger.info(`Checking status of ${method} job ${jobId} before fetching results`);
    logger.debug(`Using payload for status check: ${JSON.stringify(payload)}`);
    
    const statusResponse = await startOrMonitorMethodJobImpl(method, payload);
    const jobStatus = statusResponse.status;
    
    if (jobStatus === 'error') {
      logger.error(`Job failed with message: ${JSON.stringify(statusResponse.error)}`);
      return {
        status: 'error',
        error: `Cannot fetch results: Job failed with message: ${JSON.stringify(statusResponse.error)}`
      };
    }
    
    if (jobStatus !== 'success') {
      logger.error(`Job is not completed (status: ${jobStatus})`);
      return {
        status: 'error',
        error: `Cannot fetch results: Job is not completed (status: ${jobStatus})`
      };
    }
    
    // Job is completed, fetch results using POST with the original payload
    logger.info(`Fetching results for ${method} job ${jobId} using POST`);
    logger.debug(`Using payload for results: ${JSON.stringify(payload)}`);
    
    const resultsResponse = await axios.post(`${getApiUrl()}/methods/${method}-result`, payload);
    
    return {
      status: 'success',
      results: resultsResponse.data
    };
  } catch (error) {
    return {
      status: 'error',
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Helper function to start a job for a specific method in the Datamonkey API
 * @param method The HyPhy method name (e.g., 'fel', 'meme', etc.)
 * @param payload The payload to send to the API
 * @returns Object containing job ID or error information
 */
async function startOrMonitorMethodJobImpl(method: string, payload: any) {
  try {
    logger.info(`Starting ${method} job with payload: ${JSON.stringify(payload)}`);
    
    const apiUrl = getApiUrl();
    const jobsEndpoint = `${apiUrl}/methods/${method}-start`;
    logger.info(`Sending request to Datamonkey API: ${jobsEndpoint}`);
    
    const response = await axios.post(jobsEndpoint, payload, {
      validateStatus: null // Don't throw on any status code
    });
    
    logger.info(`Response status: ${response.status}`);
    logger.info(`Response data: ${JSON.stringify(response.data)}`);
    
    if (response.status === 200) {
      // Check the job status in the response data
      if (response.data.status === 'failed') {
        return {
          status: 'error',
          error: `Job failed: ${JSON.stringify(response.data)}`,
          jobId: response.data.jobId
        };
      }
      
      // Check if the job is already complete
      if (response.data.status === 'complete' || response.data.status === 'completed') {
        return {
          status: 'success',
          jobId: response.data.jobId,
          completed: true,
          message: `Job is already complete and ready for results`
        };
      }
      
      // Job was successfully started but is not yet complete
      return {
        status: 'success',
        jobId: response.data.jobId
      };
    } else {
      return {
        status: 'error',
        error: `API returned status ${response.status}: ${JSON.stringify(response.data)}`
      };
    }
  } catch (error) {
    logger.error(`Job request error: ${error instanceof Error ? error.message : String(error)}`);
    if (error instanceof Error && 'response' in error) {
      const axiosError = error as any;
      if (axiosError.response) {
        logger.error(`Response status: ${axiosError.response.status}`);
        logger.error(`Response data: ${JSON.stringify(axiosError.response.data)}`);
      }
    }
    return {
      status: 'error',
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

export const fetchDatamonkeyJobResults = ai.defineTool(
  {
    name: 'fetch_datamonkey_job_results',
    description: 'Fetch the results of a completed job from the Datamonkey API',
    inputSchema: z.object({
      job_id: z.string().describe('The ID of the job to fetch results for'),
      save_to: z.string().optional().describe('Optional path to save the results to a JSON file'),
      session: z.object({
        id: z.string()
      }).optional().describe('Session information for retrieving job payload'),
    }),
    outputSchema: z.object({
      status: z.string(),
      results: z.any().optional(),
      error: z.string().optional(),
      saved_to: z.string().optional(),
    }),
  },
  async (input) => {
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
      const resultsResponse = await fetchMethodResultsImpl(method, input.job_id, payload);
      
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
      alignment_file: FilePathSchema.describe('Path to the alignment file in FASTA format'),
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
  async (input) => {
    try {
      // Upload alignment file
      const alignmentUpload = await uploadFileToDatamonkeyImpl(input.alignment_file);
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
      const jobResult = await startOrMonitorMethodJobImpl('bgm', payload);
      
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

// Start or monitor Contrast-FEL job tool
export const startOrMonitorContrastFelJob = ai.defineTool(
  {
    name: 'start_or_monitor_contrast_fel_job',
    description: 'Start a Contrast-FEL analysis job on the Datamonkey API or check the status of an existing job.',
    inputSchema: z.object({
      alignment_file: FilePathSchema.describe('Path to the alignment file in FASTA format'),
      tree_file: OptionalFilePathSchema.describe('Optional path to the tree file in Newick format'),
      branches: z.string().optional().describe('Branch selection specification (e.g., "All", "Internal", or specific branches)'),
      pvalue: z.number().optional().describe('P-value threshold for significance (default: 0.1)'),
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
        tree: z.string().optional(),
        branches: z.string().optional(),
        pvalue: z.number().optional(),
        genetic_code: z.string().optional(),
      }).optional(),
    }),
  },
  async (input) => {
    try {
      // Upload alignment file
      const alignmentUpload = await uploadFileToDatamonkeyImpl(input.alignment_file);
      if (alignmentUpload.status === 'error') {
        return {
          status: 'error',
          error: alignmentUpload.error
        };
      }
      
      // Upload tree file if provided
      let treeUpload = null;
      if (input.tree_file) {
        treeUpload = await uploadFileToDatamonkeyImpl(input.tree_file);
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
      const jobResult = await startOrMonitorMethodJobImpl('contrast-fel', payload);
      
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
    inputSchema: z.object({
      alignment_file: FilePathSchema.describe('Path to the alignment file in FASTA format'),
      tree_file: OptionalFilePathSchema.describe('Optional path to the tree file in Newick format'),
      branches: z.string().optional().describe('Branch selection specification (e.g., "All", "Internal", or specific branches)'),
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
        tree: z.string().optional(),
        branches: z.string().optional(),
        genetic_code: z.string().optional(),
      }).optional(),
    }),
  },
  async (input) => {
    try {
      // Upload alignment file
      const alignmentUpload = await uploadFileToDatamonkeyImpl(input.alignment_file);
      if (alignmentUpload.status === 'error') {
        return {
          status: 'error',
          error: alignmentUpload.error
        };
      }
      
      // Upload tree file if provided
      let treeUpload = null;
      if (input.tree_file) {
        treeUpload = await uploadFileToDatamonkeyImpl(input.tree_file);
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
      const jobResult = await startOrMonitorMethodJobImpl('fade', payload);
      
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
        method: 'fade',
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
    inputSchema: z.object({
      alignment_file: FilePathSchema.describe('Path to the alignment file in FASTA format'),
      tree_file: OptionalFilePathSchema.describe('Optional path to the tree file in Newick format'),
      branches: z.string().optional().describe('Branch selection specification (e.g., "All", "Internal", or specific branches)'),
      posterior: z.number().optional().describe('Posterior probability threshold (default: 0.9)'),
      grid_points: z.number().optional().describe('Number of grid points (default: 20)'),
      chains: z.number().optional().describe('Number of MCMC chains (default: 5)'),
      chain_length: z.number().optional().describe('Length of each chain (default: 2000000)'),
      burn_in: z.number().optional().describe('Burn-in length (default: 1000000)'),
      samples: z.number().optional().describe('Number of samples (default: 100)'),
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
  async (input) => {
    try {
      // Upload alignment file
      const alignmentUpload = await uploadFileToDatamonkeyImpl(input.alignment_file);
      if (alignmentUpload.status === 'error') {
        return {
          status: 'error',
          error: alignmentUpload.error
        };
      }
      
      // Upload tree file if provided
      let treeUpload = null;
      if (input.tree_file) {
        treeUpload = await uploadFileToDatamonkeyImpl(input.tree_file);
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
      const jobResult = await startOrMonitorMethodJobImpl('fubar', payload);
      
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
    inputSchema: z.object({
      alignment_file: FilePathSchema.describe('Path to the alignment file in FASTA format'),
      rate_classes: z.number().optional().describe('Number of rate classes (default: 2)'),
      site_rate_variation: z.enum(['Yes', 'No']).optional().describe('Include site-to-site rate variation (default: Yes)'),
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
        rate_classes: z.number().optional(),
        site_rate_variation: z.string().optional(),
        genetic_code: z.string().optional(),
      }).optional(),
    }),
  },
  async (input) => {
    try {
      // Upload alignment file
      const alignmentUpload = await uploadFileToDatamonkeyImpl(input.alignment_file);
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
      const jobResult = await startOrMonitorMethodJobImpl('gard', payload);
      
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
    inputSchema: z.object({
      alignment_file: FilePathSchema.describe('Path to the alignment file in FASTA format'),
      tree_file: OptionalFilePathSchema.describe('Optional path to the tree file in Newick format'),
      branches: z.string().optional().describe('Branch selection specification (e.g., "All", "Internal", or specific branches)'),
      multiple_hits: z.enum(['Double', 'Double+Triple']).optional().describe('Specify handling of multiple nucleotide substitutions (default: Double)'),
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
        tree: z.string().optional(),
        branches: z.string().optional(),
        multiple_hits: z.string().optional(),
        genetic_code: z.string().optional(),
      }).optional(),
    }),
  },
  async (input) => {
    try {
      // Upload alignment file
      const alignmentUpload = await uploadFileToDatamonkeyImpl(input.alignment_file);
      if (alignmentUpload.status === 'error') {
        return {
          status: 'error',
          error: alignmentUpload.error
        };
      }
      
      // Upload tree file if provided
      let treeUpload = null;
      if (input.tree_file) {
        treeUpload = await uploadFileToDatamonkeyImpl(input.tree_file);
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
      const jobResult = await startOrMonitorMethodJobImpl('multihit', payload);
      
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
    inputSchema: z.object({
      alignment_file: FilePathSchema.describe('Path to the alignment file in FASTA format'),
      tree_file: OptionalFilePathSchema.describe('Optional path to the tree file in Newick format'),
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
        tree: z.string().optional(),
        genetic_code: z.string().optional(),
      }).optional(),
    }),
  },
  async (input) => {
    try {
      // Upload alignment file
      const alignmentUpload = await uploadFileToDatamonkeyImpl(input.alignment_file);
      if (alignmentUpload.status === 'error') {
        return {
          status: 'error',
          error: alignmentUpload.error
        };
      }
      
      // Upload tree file if provided
      let treeUpload = null;
      if (input.tree_file) {
        treeUpload = await uploadFileToDatamonkeyImpl(input.tree_file);
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
      const jobResult = await startOrMonitorMethodJobImpl('nrm', payload);
      
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
    inputSchema: z.object({
      alignment_file: FilePathSchema.describe('Path to the alignment file in FASTA format'),
      tree_file: OptionalFilePathSchema.describe('Optional path to the tree file in Newick format'),
      test_branches: z.string().optional().describe('Test branches specification'),
      reference_branches: z.string().optional().describe('Reference branches specification'),
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
        tree: z.string().optional(),
        test_branches: z.string().optional(),
        reference_branches: z.string().optional(),
        genetic_code: z.string().optional(),
      }).optional(),
    }),
  },
  async (input) => {
    try {
      // Upload alignment file
      const alignmentUpload = await uploadFileToDatamonkeyImpl(input.alignment_file);
      if (alignmentUpload.status === 'error') {
        return {
          status: 'error',
          error: alignmentUpload.error
        };
      }
      
      // Upload tree file if provided
      let treeUpload = null;
      if (input.tree_file) {
        treeUpload = await uploadFileToDatamonkeyImpl(input.tree_file);
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
      const jobResult = await startOrMonitorMethodJobImpl('relax', payload);
      
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
    inputSchema: z.object({
      alignment_file: FilePathSchema.describe('Path to the alignment file in FASTA format'),
      tree_file: OptionalFilePathSchema.describe('Optional path to the tree file in Newick format'),
      branches: z.string().optional().describe('Branch selection specification (e.g., "All", "Internal", or specific branches)'),
      pvalue: z.number().optional().describe('P-value threshold for significance (default: 0.1)'),
      samples: z.number().optional().describe('Number of samples for ancestral state reconstruction (default: 100)'),
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
        tree: z.string().optional(),
        branches: z.string().optional(),
        pvalue: z.number().optional(),
        samples: z.number().optional(),
        genetic_code: z.string().optional(),
      }).optional(),
    }),
  },
  async (input) => {
    try {
      // Upload alignment file
      const alignmentUpload = await uploadFileToDatamonkeyImpl(input.alignment_file);
      if (alignmentUpload.status === 'error') {
        return {
          status: 'error',
          error: alignmentUpload.error
        };
      }
      
      // Upload tree file if provided
      let treeUpload = null;
      if (input.tree_file) {
        treeUpload = await uploadFileToDatamonkeyImpl(input.tree_file);
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
      const jobResult = await startOrMonitorMethodJobImpl('slac', payload);
      
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
        method: 'slac',
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
    inputSchema: z.object({
      alignment_file: FilePathSchema.describe('Path to the alignment file in FASTA format'),
      tree_file: OptionalFilePathSchema.describe('Optional path to the tree file in Newick format'),
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
        tree: z.string().optional(),
        genetic_code: z.string().optional(),
      }).optional(),
    }),
  },
  async (input) => {
    try {
      // Upload alignment file
      const alignmentUpload = await uploadFileToDatamonkeyImpl(input.alignment_file);
      if (alignmentUpload.status === 'error') {
        return {
          status: 'error',
          error: alignmentUpload.error
        };
      }
      
      // Upload tree file if provided
      let treeUpload = null;
      if (input.tree_file) {
        treeUpload = await uploadFileToDatamonkeyImpl(input.tree_file);
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
      const jobResult = await startOrMonitorMethodJobImpl('slatkin', payload);
      
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
    } catch (error) {
      return {
        status: 'error',
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
);


const datamonkeyTools = [
  getAvailableMethods,
  uploadFileToDatamonkey,
  checkDatasetExists,
  startOrMonitorBustedJob,
  startOrMonitorFelJob,
  startOrMonitorMemeJob,
  startOrMonitorAbsrelJob,
  startOrMonitorBgmJob,
  startOrMonitorContrastFelJob,
  startOrMonitorFadeJob,
  startOrMonitorFubarJob,
  startOrMonitorGardJob,
  startOrMonitorMultihitJob,
  startOrMonitorNrmJob,
  startOrMonitorRelaxJob,
  startOrMonitorSlacJob,
  startOrMonitorSlatkinJob,
  fetchDatamonkeyJobResults
];

// Import types from types.ts
import { Session } from './types';

/**
 * Creates a new chat session
 * @returns The newly created session ID
 */
export async function createSession() {
  // Create a new session with a unique ID
  const sessionId = `session-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  // Initialize an empty session
  const session: Session = {
    id: sessionId,
    created: Date.now(),
    updated: Date.now(),
    messages: [],
    jobs: []
  };
  // Save it to the store
  await sessionStore.save(sessionId, session);
  return sessionId;
}

/**
 * Loads an existing chat session
 * @param sessionId The ID of the session to load
 * @returns The loaded session or undefined if not found
 */
export async function loadSession(sessionId: string) {
  return await sessionStore.load(sessionId);
}

/**
 * Lists all available chat sessions
 * @returns Array of session IDs
 */
export async function listSessions() {
  return await sessionStore.list();
}

/**
 * Deletes a chat session
 * @param sessionId The ID of the session to delete
 */
export async function deleteSession(sessionId: string) {
  await sessionStore.delete(sessionId);
}

/**
 * Defines a simple chat flow that interacts with the MCP server.
 * This flow takes a user message, potentially uses an LLM to process it,
 * and can interact with tools exposed by the configured MCP client.
 */
export const chatFlow = ai.defineFlow(
  {
    name: 'chatFlow',
    inputSchema: z.object({
      message: z.string().describe('User message for the AI'),
      sessionId: z.string().optional().describe('Optional session ID to continue a conversation'),
      fileId: z.string().optional().describe('Optional ID of a file to analyze'),
    }),
    outputSchema: z.string().describe('AI response from chat'),
  },
  async (input) => {
    // Log the incoming message for debugging
    logger.debug(`[chatFlow] Received message: ${input.message}`);

    // Load or create a session for chat history context
    // but job tracking is now independent of sessions (using global job store)
    let sessionId = input.sessionId;
    let session;
    
    if (sessionId) {
      session = await loadSession(sessionId);
      if (!session) {
        logger.warn(`Session ${sessionId} not found, creating new session`);
        sessionId = await createSession();
        session = { id: sessionId, messages: [] };
      }
    } else {
      sessionId = await createSession();
      session = { id: sessionId, messages: [] };
    }
    
    // Add the user message to the conversation history
    session.messages.push({ role: 'user', content: input.message });

    // Check if there are any uploaded files for this session
    const sessionFiles = fileManager.getSessionFiles(sessionId);
    let fileContext = '';
    
    if (sessionFiles.length > 0) {
      // Sort files by upload time (newest first)
      sessionFiles.sort((a, b) => b.uploadTime - a.uploadTime);
      
      // Include information about the most recent files (up to 5)
      const recentFiles = sessionFiles.slice(0, 5);
      fileContext = '\n\nUploaded files available for analysis:\n' + 
        recentFiles.map((file, index) => {
          return `${index + 1}. ${file.originalName} (${Math.round(file.size / 1024)} KB) - Use this path for analysis: ${file.path}`;
        }).join('\n');
      
      logger.debug(`Including ${recentFiles.length} files in context`);
    }
    
    // Generate a response using the available tools and conversation history
    // Build a prompt that includes the conversation history
    let conversationContext = '';
    
    if (session.messages.length > 1) {
      // Include up to the last 10 messages for context
      const contextMessages = session.messages.slice(-10);
      conversationContext = contextMessages
        .map(msg => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`)
        .join('\n\n');
      
      logger.debug(`Using conversation history with ${contextMessages.length} messages`);
    }
    
    const prompt = conversationContext 
      ? `${conversationContext}\n\nUser: ${input.message}${fileContext}\n\nBased on this conversation and available files, consider if you need to use any available tools from 'datamonkey' to generate a response. If the user wants to analyze a file, use the appropriate HyPhy method tool with the file path. Respond in a helpful and informative manner.`
      : `User says: "${input.message}"${fileContext}\n\nBased on this and available files, consider if you need to use any available tools from 'datamonkey' to generate a response. If the user wants to analyze a file, use the appropriate HyPhy method tool with the file path. Respond in a helpful and informative manner.`;
    
    // Instead of wrapping the tools (which creates circular references),
    // we'll modify the prompt to instruct the LLM to include the session ID
    const sessionPrompt = `${prompt}

IMPORTANT: When using any tool that accepts a session parameter, ALWAYS include the session ID: ${sessionId}`;
    
    // Generate response with the original tools
    const llmResponse = await ai.generate({
      prompt: sessionPrompt,
      tools: datamonkeyTools
    });

    const responseText = llmResponse.text;

    logger.debug(`[chatFlow] AI Response: ${responseText}`);
    
    // Add the assistant response to the conversation history
    session.messages.push({ role: 'assistant', content: responseText });
    
    // Save the updated session
    await sessionStore.save(sessionId, session);
    
    // Return just the response text to fix the [object Object] issue
    return responseText;
  },
);


// When you run `npm run dev` (which uses `genkit start -- tsx --watch src/index.ts`),
// Genkit's Developer UI will automatically discover and expose the `chatFlow`
// because it's imported and exported (or just imported if Genkit's autodiscovery is sufficient).

// Export job-related functions for server.ts to use
export const getAllJobs = () => globalJobStore.getAllJobs();
export const getJob = (jobId: string) => globalJobStore.getJob(jobId);
export const addJob = (jobInfo: any) => globalJobStore.addJob(jobInfo);
export const updateJobStatus = (jobId: string, status: string, results?: any) => globalJobStore.updateJobStatus(jobId, status, results);
export const deleteJob = (jobId: string) => globalJobStore.deleteJob(jobId);
