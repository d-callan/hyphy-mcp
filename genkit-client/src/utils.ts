import { globalDatasetStore } from './datasetStore';
import { logger } from '@genkit-ai/core/logging';
import axios from 'axios';
import fs from 'fs';
import path from 'path';

// Configuration
export const datamonkeyConfig = {
    apiUrl: process.env.DATAMONKEY_API_URL || 'http://localhost',
    apiPort: parseInt(process.env.DATAMONKEY_API_PORT || '9300'),
  };
  
  // Helper function to get full API URL
  export const getApiUrl = () => `${datamonkeyConfig.apiUrl}:${datamonkeyConfig.apiPort}/api/v1`;
  
  /**
   * Helper function to resolve a potential dataset ID to a file path
   * If the input is a dataset ID, returns the file path from the dataset store
   * If the input is a file path, returns it as is
   * @param filePathOrDatasetId The file path or dataset ID to resolve
   * @returns The resolved file path or the original input if not found
   */
export function resolveDatasetPath(filePathOrDatasetId: string): string {
    // If the input looks like a dataset ID, resolve it to a file path
    if (filePathOrDatasetId.startsWith('dataset_')) {
      const dataset = globalDatasetStore.getDataset(filePathOrDatasetId);
      if (dataset) {
        // Return the full file path from the dataset
        if (dataset.filePath) {
          logger.info(`Resolved dataset ID ${filePathOrDatasetId} to file path ${dataset.filePath}`);
          return dataset.filePath;
        } else if (dataset.treePath) {
          logger.info(`Resolved dataset ID ${filePathOrDatasetId} to tree path ${dataset.treePath}`);
          return dataset.treePath;
        }
      }
    }
    // If not a dataset ID or dataset not found, return the input as is
    return filePathOrDatasetId;
  }
  
  // Helper function to extract dataset ID from file paths
export function extractDatasetId(alignmentFile?: string, treeFile?: string): string | undefined {
    // Check if alignment file is a dataset ID
    if (alignmentFile && alignmentFile.startsWith('dataset_')) {
      return alignmentFile;
    }
    // Check if tree file is a dataset ID
    if (treeFile && treeFile.startsWith('dataset_')) {
      return treeFile;
    }
    // No dataset ID found
    return undefined;
  }

  
  // Helper function to check if a dataset exists on the Datamonkey API
export async function checkDatasetExistsImpl(datasetId: string): Promise<boolean> {
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
export async function uploadFileToDatamonkeyImpl(filePath: string, skipExistenceCheck: boolean = false) {
    // Resolve dataset ID to file path if needed
    const resolvedPath = resolveDatasetPath(filePath);
    if (resolvedPath !== filePath) {
      logger.info(`Resolved dataset path: ${filePath} -> ${resolvedPath}`);
      filePath = resolvedPath;
    }
    try {
      // Log the current working directory and absolute file path for debugging
      logger.info(`Current working directory: ${process.cwd()}`);
      logger.info(`Attempting to access file at: ${filePath}`);
      logger.info(`Absolute path: ${path.resolve(filePath)}`);
      
      // List files in the directory to help debug
      try {
        const dir = path.dirname(filePath);
        logger.info(`Listing files in directory: ${dir}`);
        const files = fs.readdirSync(dir);
        logger.info(`Files in directory: ${JSON.stringify(files)}`);
      } catch (dirErr) {
        logger.error(`Error listing directory: ${dirErr instanceof Error ? dirErr.message : String(dirErr)}`);
      }
      
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


/**
 * Helper function to fetch results for a specific method from the Datamonkey API
 * @param method The HyPhy method name (e.g., 'fel', 'meme', etc.)
 * @param jobId The ID of the job to fetch results for
 * @param payload The original payload used to submit the job
 * @returns Object containing the results or error information
 */
export async function fetchMethodResultsImpl(method: string, jobId: string, payload: any) {
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
export async function startOrMonitorMethodJobImpl(method: string, payload: any) {
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
