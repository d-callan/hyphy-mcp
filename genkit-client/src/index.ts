import { genkit, z } from 'genkit';
import { googleAI } from '@genkit-ai/googleai';
import { logger } from '@genkit-ai/core/logging';
import dotenv from 'dotenv';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { FileSessionStore } from './sessionStore';
import { fileManager } from './fileManager';

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

// Helper function to upload a file to Datamonkey API
async function uploadFileToDatamonkeyImpl(filePath: string) {
  try {
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      return {
        status: 'error',
        error: `File not found: ${filePath}`
      };
    }
    
    // Read file content
    const fileContent = fs.readFileSync(filePath);
    const fileName = path.basename(filePath);
    
    // Create form data
    const formData = new FormData();
    formData.append('file', new Blob([fileContent]), fileName);
    
    // Upload to Datamonkey API
    const response = await axios.post(`${getApiUrl()}/datasets`, formData);
    
    return {
      status: 'success',
      file_handle: response.data.id,
      file_name: fileName,
      file_size: fs.statSync(filePath).size
    };
  } catch (error) {
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

// Start BUSTED job tool
export const startBustedJob = ai.defineTool(
  {
    name: 'start_busted_job',
    description: 'Start a BUSTED analysis job on the Datamonkey API',
    inputSchema: z.object({
      alignment_file: FilePathSchema.describe('Path to the alignment file in FASTA format'),
      tree_file: OptionalFilePathSchema.describe('Optional path to the tree file in Newick format'),
      branches: z.string().optional().describe('Branch selection specification (e.g., "All", "Internal", or specific branches)'),
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
      
      // Prepare payload for BUSTED analysis
      const payload = {
        method: 'busted',
        datamonkey_id: alignmentUpload.file_handle,
        tree_id: treeUpload?.file_handle,
        branches: input.branches || 'All',
      };
      
      // Start the job
      const response = await axios.post(`${getApiUrl()}/jobs`, payload);
      const jobId = response.data.id;
      
      return {
        status: 'success',
        job_id: jobId,
        message: 'BUSTED analysis started on Datamonkey API. Use check_datamonkey_job_status to monitor progress.',
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

// Check job status tool
export const checkDatamonkeyJobStatus = ai.defineTool(
  {
    name: 'check_datamonkey_job_status',
    description: 'Check the status of a job on the Datamonkey API',
    inputSchema: z.object({
      job_id: z.string().describe('The ID of the job to check'),
    }),
    outputSchema: z.object({
      status: z.string(),
      job_status: z.string().optional(),
      progress: z.number().optional(),
      results: z.any().optional(),
      error: z.string().optional(),
    }),
  },
  async (input) => {
    try {
      const response = await axios.get(`${getApiUrl()}/jobs/${input.job_id}`);
      const jobData = response.data;
      
      return {
        status: 'success',
        job_status: jobData.status,
        progress: jobData.progress || 0,
        results: jobData.results || null,
      };
    } catch (error) {
      return {
        status: 'error',
        error: error instanceof Error ? error.message : String(error)
      };
    }
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

// Start FEL job tool
export const startFelJob = ai.defineTool(
  {
    name: 'start_fel_job',
    description: 'Start a FEL (Fixed Effects Likelihood) analysis job on the Datamonkey API',
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
      
      // Prepare payload for FEL analysis
      const payload = {
        method: 'fel',
        datamonkey_id: alignmentUpload.file_handle,
        tree_id: treeUpload?.file_handle,
        branches: input.branches || 'All',
        pvalue: input.pvalue || 0.1,
        ci: input.ci || 'No',
        srv: input.srv || 'Yes',
        resample: input.resample || 0,
        multiple_hits: input.multiple_hits || 'None',
        site_multihit: input.site_multihit || 'Estimate',
        genetic_code: input.genetic_code || 'Universal',
      };
      
      // Start the job
      const response = await axios.post(`${getApiUrl()}/jobs`, payload);
      const jobId = response.data.id;
      
      return {
        status: 'success',
        job_id: jobId,
        message: 'FEL analysis started on Datamonkey API. Use check_datamonkey_job_status to monitor progress.',
        input: {
          alignment: input.alignment_file,
          tree: input.tree_file,
          branches: input.branches || 'All',
          pvalue: input.pvalue || 0.1,
          ci: input.ci || 'No',
          srv: input.srv || 'Yes',
          resample: input.resample || 0,
          multiple_hits: input.multiple_hits || 'None',
          site_multihit: input.site_multihit || 'Estimate',
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

// Start MEME job tool
export const startMemeJob = ai.defineTool(
  {
    name: 'start_meme_job',
    description: 'Start a MEME (Mixed Effects Model of Evolution) analysis job on the Datamonkey API',
    inputSchema: z.object({
      alignment_file: FilePathSchema.describe('Path to the alignment file in FASTA format'),
      tree_file: OptionalFilePathSchema.describe('Optional path to the tree file in Newick format'),
      branches: z.string().optional().describe('Branch selection specification (e.g., "All", "Internal", or specific branches)'),
      pvalue: z.number().optional().describe('P-value threshold for significance (default: 0.1)'),
      genetic_code: z.string().optional().describe('Genetic code to use (default: Universal)'),
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
        method: 'meme',
        datamonkey_id: alignmentUpload.file_handle,
        tree_id: treeUpload?.file_handle,
        branches: input.branches || 'All',
        pvalue: input.pvalue || 0.1,
        genetic_code: input.genetic_code || 'Universal',
      };
      
      // Start the job
      const response = await axios.post(`${getApiUrl()}/jobs`, payload);
      const jobId = response.data.id;
      
      return {
        status: 'success',
        job_id: jobId,
        message: 'MEME analysis started on Datamonkey API. Use check_datamonkey_job_status to monitor progress.',
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

// Start ABSREL job tool
export const startAbsrelJob = ai.defineTool(
  {
    name: 'start_absrel_job',
    description: 'Start an ABSREL (Adaptive Branch-Site Random Effects Likelihood) analysis job on the Datamonkey API',
    inputSchema: z.object({
      alignment_file: FilePathSchema.describe('Path to the alignment file in FASTA format'),
      tree_file: OptionalFilePathSchema.describe('Optional path to the tree file in Newick format'),
      branches: z.string().optional().describe('Branch selection specification (e.g., "All", "Internal", or specific branches)'),
      pvalue: z.number().optional().describe('P-value threshold for significance (default: 0.1)'),
      genetic_code: z.string().optional().describe('Genetic code to use (default: Universal)'),
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
        method: 'absrel',
        datamonkey_id: alignmentUpload.file_handle,
        tree_id: treeUpload?.file_handle,
        branches: input.branches || 'All',
        pvalue: input.pvalue || 0.1,
        genetic_code: input.genetic_code || 'Universal',
      };
      
      // Start the job
      const response = await axios.post(`${getApiUrl()}/jobs`, payload);
      const jobId = response.data.id;
      
      return {
        status: 'success',
        job_id: jobId,
        message: 'ABSREL analysis started on Datamonkey API. Use check_datamonkey_job_status to monitor progress.',
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

// Fetch job results tool
export const fetchDatamonkeyJobResults = ai.defineTool(
  {
    name: 'fetch_datamonkey_job_results',
    description: 'Fetch the results of a completed job from the Datamonkey API',
    inputSchema: z.object({
      job_id: z.string().describe('The ID of the job to fetch results for'),
      save_to: z.string().optional().describe('Optional path to save the results to a JSON file'),
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
      // Check job status first
      const statusResponse = await axios.get(`${getApiUrl()}/jobs/${input.job_id}`);
      const jobData = statusResponse.data;
      
      if (jobData.status !== 'completed') {
        return {
          status: 'error',
          error: `Job is not completed yet. Current status: ${jobData.status}`
        };
      }
      
      // Fetch results
      const resultsResponse = await axios.get(`${getApiUrl()}/jobs/${input.job_id}/results`);
      const results = resultsResponse.data;
      
      // Save to file if requested
      if (input.save_to) {
        fs.writeFileSync(input.save_to, JSON.stringify(results, null, 2));
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
      return {
        status: 'error',
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
);

// Start BGM job tool
export const startBgmJob = ai.defineTool(
  {
    name: 'start_bgm_job',
    description: 'Start a BGM (Bayesian Graphical Model) analysis job on the Datamonkey API',
    inputSchema: z.object({
      alignment_file: FilePathSchema.describe('Path to the alignment file in FASTA format'),
      genetic_code: z.string().optional().describe('Genetic code to use (default: Universal)'),
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
        method: 'bgm',
        datamonkey_id: alignmentUpload.file_handle,
        genetic_code: input.genetic_code || 'Universal',
      };
      
      // Start the job
      const response = await axios.post(`${getApiUrl()}/jobs`, payload);
      const jobId = response.data.id;
      
      return {
        status: 'success',
        job_id: jobId,
        message: 'BGM analysis started on Datamonkey API. Use check_datamonkey_job_status to monitor progress.',
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

// Start Contrast-FEL job tool
export const startContrastFelJob = ai.defineTool(
  {
    name: 'start_contrast_fel_job',
    description: 'Start a Contrast-FEL analysis job on the Datamonkey API',
    inputSchema: z.object({
      alignment_file: FilePathSchema.describe('Path to the alignment file in FASTA format'),
      tree_file: OptionalFilePathSchema.describe('Optional path to the tree file in Newick format'),
      branches: z.string().optional().describe('Branch selection specification (e.g., "All", "Internal", or specific branches)'),
      pvalue: z.number().optional().describe('P-value threshold for significance (default: 0.1)'),
      genetic_code: z.string().optional().describe('Genetic code to use (default: Universal)'),
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
        method: 'contrast-fel',
        datamonkey_id: alignmentUpload.file_handle,
        tree_id: treeUpload?.file_handle,
        branches: input.branches || 'All',
        pvalue: input.pvalue || 0.1,
        genetic_code: input.genetic_code || 'Universal',
      };
      
      // Start the job
      const response = await axios.post(`${getApiUrl()}/jobs`, payload);
      const jobId = response.data.id;
      
      return {
        status: 'success',
        job_id: jobId,
        message: 'Contrast-FEL analysis started on Datamonkey API. Use check_datamonkey_job_status to monitor progress.',
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

// Start FADE job tool
export const startFadeJob = ai.defineTool(
  {
    name: 'start_fade_job',
    description: 'Start a FADE (FUBAR Approach to Directional Evolution) analysis job on the Datamonkey API',
    inputSchema: z.object({
      alignment_file: FilePathSchema.describe('Path to the alignment file in FASTA format'),
      tree_file: OptionalFilePathSchema.describe('Optional path to the tree file in Newick format'),
      branches: z.string().optional().describe('Branch selection specification (e.g., "All", "Internal", or specific branches)'),
      genetic_code: z.string().optional().describe('Genetic code to use (default: Universal)'),
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
        method: 'fade',
        datamonkey_id: alignmentUpload.file_handle,
        tree_id: treeUpload?.file_handle,
        branches: input.branches || 'All',
        genetic_code: input.genetic_code || 'Universal',
      };
      
      // Start the job
      const response = await axios.post(`${getApiUrl()}/jobs`, payload);
      const jobId = response.data.id;
      
      return {
        status: 'success',
        job_id: jobId,
        message: 'FADE analysis started on Datamonkey API. Use check_datamonkey_job_status to monitor progress.',
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

// Start FUBAR job tool
export const startFubarJob = ai.defineTool(
  {
    name: 'start_fubar_job',
    description: 'Start a FUBAR (Fast Unconstrained Bayesian AppRoximation) analysis job on the Datamonkey API',
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
        method: 'fubar',
        datamonkey_id: alignmentUpload.file_handle,
        tree_id: treeUpload?.file_handle,
        branches: input.branches || 'All',
        posterior: input.posterior || 0.9,
        grid_points: input.grid_points || 20,
        chains: input.chains || 5,
        chain_length: input.chain_length || 2000000,
        burn_in: input.burn_in || 1000000,
        samples: input.samples || 100,
        genetic_code: input.genetic_code || 'Universal',
      };
      
      // Start the job
      const response = await axios.post(`${getApiUrl()}/jobs`, payload);
      const jobId = response.data.id;
      
      return {
        status: 'success',
        job_id: jobId,
        message: 'FUBAR analysis started on Datamonkey API. Use check_datamonkey_job_status to monitor progress.',
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

// Start GARD job tool
export const startGardJob = ai.defineTool(
  {
    name: 'start_gard_job',
    description: 'Start a GARD (Genetic Algorithm for Recombination Detection) analysis job on the Datamonkey API',
    inputSchema: z.object({
      alignment_file: FilePathSchema.describe('Path to the alignment file in FASTA format'),
      rate_classes: z.number().optional().describe('Number of rate classes (default: 2)'),
      site_rate_variation: z.enum(['Yes', 'No']).optional().describe('Include site-to-site rate variation (default: Yes)'),
      genetic_code: z.string().optional().describe('Genetic code to use (default: Universal)'),
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
        method: 'gard',
        datamonkey_id: alignmentUpload.file_handle,
        rate_classes: input.rate_classes || 2,
        site_rate_variation: input.site_rate_variation || 'Yes',
        genetic_code: input.genetic_code || 'Universal',
      };
      
      // Start the job
      const response = await axios.post(`${getApiUrl()}/jobs`, payload);
      const jobId = response.data.id;
      
      return {
        status: 'success',
        job_id: jobId,
        message: 'GARD analysis started on Datamonkey API. Use check_datamonkey_job_status to monitor progress.',
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

// Start MultiHit job tool
export const startMultihitJob = ai.defineTool(
  {
    name: 'start_multihit_job',
    description: 'Start a MultiHit analysis job on the Datamonkey API',
    inputSchema: z.object({
      alignment_file: FilePathSchema.describe('Path to the alignment file in FASTA format'),
      tree_file: OptionalFilePathSchema.describe('Optional path to the tree file in Newick format'),
      branches: z.string().optional().describe('Branch selection specification (e.g., "All", "Internal", or specific branches)'),
      multiple_hits: z.enum(['Double', 'Double+Triple']).optional().describe('Specify handling of multiple nucleotide substitutions (default: Double)'),
      genetic_code: z.string().optional().describe('Genetic code to use (default: Universal)'),
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
        method: 'multihit',
        datamonkey_id: alignmentUpload.file_handle,
        tree_id: treeUpload?.file_handle,
        branches: input.branches || 'All',
        multiple_hits: input.multiple_hits || 'Double',
        genetic_code: input.genetic_code || 'Universal',
      };
      
      // Start the job
      const response = await axios.post(`${getApiUrl()}/jobs`, payload);
      const jobId = response.data.id;
      
      return {
        status: 'success',
        job_id: jobId,
        message: 'MultiHit analysis started on Datamonkey API. Use check_datamonkey_job_status to monitor progress.',
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

// Start NRM job tool
export const startNrmJob = ai.defineTool(
  {
    name: 'start_nrm_job',
    description: 'Start an NRM (Nucleotide Rate Matrix) analysis job on the Datamonkey API',
    inputSchema: z.object({
      alignment_file: FilePathSchema.describe('Path to the alignment file in FASTA format'),
      tree_file: OptionalFilePathSchema.describe('Optional path to the tree file in Newick format'),
      genetic_code: z.string().optional().describe('Genetic code to use (default: Universal)'),
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
        method: 'nrm',
        datamonkey_id: alignmentUpload.file_handle,
        tree_id: treeUpload?.file_handle,
        genetic_code: input.genetic_code || 'Universal',
      };
      
      // Start the job
      const response = await axios.post(`${getApiUrl()}/jobs`, payload);
      const jobId = response.data.id;
      
      return {
        status: 'success',
        job_id: jobId,
        message: 'NRM analysis started on Datamonkey API. Use check_datamonkey_job_status to monitor progress.',
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

// Start RELAX job tool
export const startRelaxJob = ai.defineTool(
  {
    name: 'start_relax_job',
    description: 'Start a RELAX (Relaxation of Selection) analysis job on the Datamonkey API',
    inputSchema: z.object({
      alignment_file: FilePathSchema.describe('Path to the alignment file in FASTA format'),
      tree_file: OptionalFilePathSchema.describe('Optional path to the tree file in Newick format'),
      test_branches: z.string().optional().describe('Test branches specification'),
      reference_branches: z.string().optional().describe('Reference branches specification'),
      genetic_code: z.string().optional().describe('Genetic code to use (default: Universal)'),
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
        method: 'relax',
        datamonkey_id: alignmentUpload.file_handle,
        tree_id: treeUpload?.file_handle,
        test_branches: input.test_branches || '',
        reference_branches: input.reference_branches || '',
        genetic_code: input.genetic_code || 'Universal',
      };
      
      // Start the job
      const response = await axios.post(`${getApiUrl()}/jobs`, payload);
      const jobId = response.data.id;
      
      return {
        status: 'success',
        job_id: jobId,
        message: 'RELAX analysis started on Datamonkey API. Use check_datamonkey_job_status to monitor progress.',
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

// Start SLAC job tool
export const startSlacJob = ai.defineTool(
  {
    name: 'start_slac_job',
    description: 'Start a SLAC (Single-Likelihood Ancestor Counting) analysis job on the Datamonkey API',
    inputSchema: z.object({
      alignment_file: FilePathSchema.describe('Path to the alignment file in FASTA format'),
      tree_file: OptionalFilePathSchema.describe('Optional path to the tree file in Newick format'),
      branches: z.string().optional().describe('Branch selection specification (e.g., "All", "Internal", or specific branches)'),
      pvalue: z.number().optional().describe('P-value threshold for significance (default: 0.1)'),
      samples: z.number().optional().describe('Number of samples for ancestral state reconstruction (default: 100)'),
      genetic_code: z.string().optional().describe('Genetic code to use (default: Universal)'),
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
        method: 'slac',
        datamonkey_id: alignmentUpload.file_handle,
        tree_id: treeUpload?.file_handle,
        branches: input.branches || 'All',
        pvalue: input.pvalue || 0.1,
        samples: input.samples || 100,
        genetic_code: input.genetic_code || 'Universal',
      };
      
      // Start the job
      const response = await axios.post(`${getApiUrl()}/jobs`, payload);
      const jobId = response.data.id;
      
      return {
        status: 'success',
        job_id: jobId,
        message: 'SLAC analysis started on Datamonkey API. Use check_datamonkey_job_status to monitor progress.',
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

// Start Slatkin job tool
export const startSlatkinJob = ai.defineTool(
  {
    name: 'start_slatkin_job',
    description: 'Start a Slatkin-Maddison test for phylogeny-trait association on the Datamonkey API',
    inputSchema: z.object({
      alignment_file: FilePathSchema.describe('Path to the alignment file in FASTA format'),
      tree_file: OptionalFilePathSchema.describe('Optional path to the tree file in Newick format'),
      genetic_code: z.string().optional().describe('Genetic code to use (default: Universal)'),
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
        method: 'slatkin',
        datamonkey_id: alignmentUpload.file_handle,
        tree_id: treeUpload?.file_handle,
        genetic_code: input.genetic_code || 'Universal',
      };
      
      // Start the job
      const response = await axios.post(`${getApiUrl()}/jobs`, payload);
      const jobId = response.data.id;
      
      return {
        status: 'success',
        job_id: jobId,
        message: 'Slatkin-Maddison test started on Datamonkey API. Use check_datamonkey_job_status to monitor progress.',
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
  startBustedJob,
  startFelJob,
  startMemeJob,
  startAbsrelJob,
  startBgmJob,
  startContrastFelJob,
  startFadeJob,
  startFubarJob,
  startGardJob,
  startMultihitJob,
  startNrmJob,
  startRelaxJob,
  startSlacJob,
  startSlatkinJob,
  checkDatamonkeyJobStatus,
  fetchDatamonkeyJobResults,
];

// Initialize the session store
export const sessionStore = new FileSessionStore('./sessions');

/**
 * Creates a new chat session
 * @returns The newly created session ID
 */
export async function createSession() {
  // Create a new session with a unique ID
  const sessionId = `session-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  // Initialize an empty session
  const session = {
    id: sessionId,
    messages: []
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

    // Load or create a session
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
    
    const llmResponse = await ai.generate({
      prompt,
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
