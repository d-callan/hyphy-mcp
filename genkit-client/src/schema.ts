import { z } from "genkit";

  
  // Define schemas for common inputs
  export const FilePathSchema = z.string().describe('Path to a file');
  export const OptionalFilePathSchema = z.string().optional().describe('Optional path to a file');
  export const DatasetIdSchema = z.string().describe('Datamonkey dataset ID');
  export const JobIdSchema = z.string().describe('Job ID');
  export const VisualizationIdSchema = z.string().describe('Visualization ID');

  // Upload file tool
export const uploadFileSchema = z.object({
  file_path: FilePathSchema.describe('Path to the file to upload'),
});

// Schema for getJobResults tool input
export const getJobResultsSchema = z.object({
  job_id: JobIdSchema,
});

// Schema for getDatasetDetails tool input
export const getDatasetDetailsSchema = z.object({
  dataset_id: DatasetIdSchema,
});

// Schema for getVisualizationDetails tool input
export const getVisualizationDetailsSchema = z.object({
  viz_id: VisualizationIdSchema,
});

// Start or monitor BUSTED job tool
export const startOrMonitorBustedJobSchema = z.object({
  alignment_file: FilePathSchema.describe('Path to the alignment file in FASTA format'),
  tree_file: OptionalFilePathSchema.describe('Optional path to the tree file in Newick format'),
  branches: z.string().optional().describe('Branch selection specification (e.g., "All", "Internal", or specific branches)'),
  session: z.object({
    id: z.string()
  }).optional().describe('Session information for tracking jobs'),
});

// Check if dataset exists tool
export const checkDatasetExistsSchema = z.object({
  dataset_id: DatasetIdSchema,
});

// Get available methods tool
export const getAvailableMethodsSchema = z.object({});

// Start or monitor FEL job tool
export const startOrMonitorFelJobSchema = z.object({
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
  job_id: JobIdSchema.optional().describe('Optional job ID to check status of an existing job')
});

// Schema for MEME job tool input
export const startOrMonitorMemeJobSchema = z.object({
  alignment_file: FilePathSchema.describe('Path to the alignment file in FASTA format'),
  tree_file: OptionalFilePathSchema.describe('Optional path to the tree file in Newick format'),
  branches: z.string().optional().describe('Branch selection specification (e.g., "All", "Internal", or specific branches)'),
  pvalue: z.number().optional().describe('P-value threshold for significance (default: 0.1)'),
  genetic_code: z.string().optional().describe('Genetic code to use (default: Universal)'),
  session: z.object({
    id: z.string()
  }).optional().describe('Session information for tracking jobs'),
  job_id: z.string().optional().describe('ID of an existing job to monitor')
});

// Start or monitor ABSREL job tool
// Schema for ABSREL job tool input
export const startOrMonitorAbsrelJobSchema = z.object({
  alignment_file: FilePathSchema.describe('Path to the alignment file in FASTA format'),
  tree_file: OptionalFilePathSchema.describe('Optional path to the tree file in Newick format'),
  branches: z.string().optional().describe('Branch selection specification (e.g., "All", "Internal", or specific branches)'),
  pvalue: z.number().optional().describe('P-value threshold for significance (default: 0.1)'),
  genetic_code: z.string().optional().describe('Genetic code to use (default: Universal)'),
  session: z.object({
    id: z.string()
  }).optional().describe('Session information for tracking jobs'),
  job_id: z.string().optional().describe('ID of an existing job to monitor')
});

// Schema for fetch datamonkey job results tool input
export const fetchDatamonkeyJobResultsSchema = z.object({
  job_id: z.string().describe('The ID of the job to fetch results for'),
  save_to: z.string().optional().describe('Optional path to save the results to a JSON file'),
  session: z.object({
    id: z.string()
  }).optional().describe('Session information for retrieving job payload'),
});


// Start or monitor Contrast-FEL job tool
// Schema for Contrast-FEL job tool input
export const startOrMonitorContrastFelJobSchema = z.object({
  alignment_file: FilePathSchema.describe('Path to the alignment file in FASTA format'),
  tree_file: OptionalFilePathSchema.describe('Optional path to the tree file in Newick format'),
  branches: z.string().optional().describe('Branch selection specification (e.g., "All", "Internal", or specific branches)'),
  pvalue: z.number().optional().describe('P-value threshold for significance (default: 0.1)'),
  genetic_code: z.string().optional().describe('Genetic code to use (default: Universal)'),
  session: z.object({
    id: z.string()
  }).optional().describe('Session information for tracking jobs'),
  job_id: z.string().optional().describe('ID of an existing job to monitor')
});

// Schema for FADE job tool input
export const startOrMonitorFadeJobSchema = z.object({
  alignment_file: FilePathSchema.describe('Path to the alignment file in FASTA format'),
  tree_file: OptionalFilePathSchema.describe('Optional path to the tree file in Newick format'),
  branches: z.string().optional().describe('Branch selection specification (e.g., "All", "Internal", or specific branches)'),
  genetic_code: z.string().optional().describe('Genetic code to use (default: Universal)'),
  session: z.object({
    id: z.string()
  }).optional().describe('Session information for tracking jobs'),
  job_id: z.string().optional().describe('ID of an existing job to monitor')
});

// Schema for FUBAR job tool input
export const startOrMonitorFubarJobSchema = z.object({
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
  job_id: z.string().optional().describe('ID of an existing job to monitor')
});

// Schema for GARD job tool input
export const startOrMonitorGardJobSchema = z.object({
  alignment_file: FilePathSchema.describe('Path to the alignment file in FASTA format'),
  rate_classes: z.number().optional().describe('Number of rate classes (default: 2)'),
  site_rate_variation: z.enum(['Yes', 'No']).optional().describe('Include site-to-site rate variation (default: Yes)'),
  genetic_code: z.string().optional().describe('Genetic code to use (default: Universal)'),
  session: z.object({
    id: z.string()
  }).optional().describe('Session information for tracking jobs'),
  job_id: z.string().optional().describe('ID of an existing job to monitor')
});

// Schema for MultiHit job tool input
export const startOrMonitorMultihitJobSchema = z.object({
  alignment_file: FilePathSchema.describe('Path to the alignment file in FASTA format'),
  tree_file: OptionalFilePathSchema.describe('Optional path to the tree file in Newick format'),
  branches: z.string().optional().describe('Branch selection specification (e.g., "All", "Internal", or specific branches)'),
  multiple_hits: z.enum(['Double', 'Double+Triple']).optional().describe('Specify handling of multiple nucleotide substitutions (default: Double)'),
  genetic_code: z.string().optional().describe('Genetic code to use (default: Universal)'),
  session: z.object({
    id: z.string()
  }).optional().describe('Session information for tracking jobs'),
  job_id: z.string().optional().describe('ID of an existing job to monitor')
});

// Schema for NRM job tool input
export const startOrMonitorNrmJobSchema = z.object({
  alignment_file: FilePathSchema.describe('Path to the alignment file in FASTA format'),
  tree_file: OptionalFilePathSchema.describe('Optional path to the tree file in Newick format'),
  genetic_code: z.string().optional().describe('Genetic code to use (default: Universal)'),
  session: z.object({
    id: z.string()
  }).optional().describe('Session information for tracking jobs'),
  job_id: z.string().optional().describe('ID of an existing job to monitor')
});

// Schema for RELAX job tool input
export const startOrMonitorRelaxJobSchema = z.object({
  alignment_file: FilePathSchema.describe('Path to the alignment file in FASTA format'),
  tree_file: OptionalFilePathSchema.describe('Optional path to the tree file in Newick format'),
  test_branches: z.string().optional().describe('Test branches specification'),
  reference_branches: z.string().optional().describe('Reference branches specification'),
  genetic_code: z.string().optional().describe('Genetic code to use (default: Universal)'),
  session: z.object({
    id: z.string()
  }).optional().describe('Session information for tracking jobs'),
  job_id: z.string().optional().describe('ID of an existing job to monitor')
});

// Schema for SLAC job tool input
export const startOrMonitorSlacJobSchema = z.object({
  alignment_file: FilePathSchema.describe('Path to the alignment file in FASTA format'),
  tree_file: OptionalFilePathSchema.describe('Optional path to the tree file in Newick format'),
  branches: z.string().optional().describe('Branch selection specification (e.g., "All", "Internal", or specific branches)'),
  pvalue: z.number().optional().describe('P-value threshold for significance (default: 0.1)'),
  samples: z.number().optional().describe('Number of samples for ancestral state reconstruction (default: 100)'),
  genetic_code: z.string().optional().describe('Genetic code to use (default: Universal)'),
  session: z.object({
    id: z.string()
  }).optional().describe('Session information for tracking jobs'),
  job_id: z.string().optional().describe('ID of an existing job to monitor')
});

// Schema for Slatkin job tool input
export const startOrMonitorSlatkinJobSchema = z.object({
  alignment_file: FilePathSchema.describe('Path to the alignment file in FASTA format'),
  tree_file: OptionalFilePathSchema.describe('Optional path to the tree file in Newick format'),
  genetic_code: z.string().optional().describe('Genetic code to use (default: Universal)'),
  session: z.object({
    id: z.string()
  }).optional().describe('Session information for tracking jobs'),
  job_id: z.string().optional().describe('ID of an existing job to monitor')
});