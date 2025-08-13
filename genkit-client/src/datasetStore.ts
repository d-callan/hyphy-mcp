import fs from 'fs';
import path from 'path';
import { logger } from '@genkit-ai/core/logging';

// Define the Dataset interface
export interface Dataset {
  datasetId: string;
  name: string;
  description?: string;
  timestamp: number;
  hasAlignment: boolean;
  hasTree: boolean;
  fileSize?: number;
  sequenceCount?: number;
  filePath: string;
  treePath?: string;
  metadata?: Record<string, any>;
}

/**
 * Global dataset store for managing datasets
 */
class DatasetStore {
  private datasets: Map<string, Dataset>;
  private dataFile: string;

  constructor(dataDir: string) {
    this.datasets = new Map<string, Dataset>();
    
    // Create data directory if it doesn't exist
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    
    this.dataFile = path.join(dataDir, 'datasets.json');
    
    // Load datasets from file if it exists
    this.loadFromFile();
  }

  /**
   * Load datasets from file
   */
  private loadFromFile(): void {
    try {
      if (fs.existsSync(this.dataFile)) {
        const data = fs.readFileSync(this.dataFile, 'utf8');
        const datasets = JSON.parse(data);
        
        // Convert array to Map
        this.datasets = new Map(datasets.map((dataset: Dataset) => [dataset.datasetId, dataset]));
        
        logger.info(`Loaded ${this.datasets.size} datasets from file`);
      } else {
        logger.info('No datasets file found, starting with empty dataset store');
      }
    } catch (error) {
      logger.error('Error loading datasets from file:', error);
    }
  }

  /**
   * Save datasets to file
   */
  private saveToFile(): void {
    try {
      // Convert Map to array for JSON serialization
      const datasets = Array.from(this.datasets.values());
      fs.writeFileSync(this.dataFile, JSON.stringify(datasets, null, 2));
      logger.info(`Saved ${datasets.length} datasets to file`);
    } catch (error) {
      logger.error('Error saving datasets to file:', error);
    }
  }

  /**
   * Get all datasets
   */
  getAllDatasets(): Dataset[] {
    return Array.from(this.datasets.values());
  }

  /**
   * Get a specific dataset by ID
   */
  getDataset(datasetId: string): Dataset | undefined {
    return this.datasets.get(datasetId);
  }

  /**
   * Add a new dataset
   */
  addDataset(dataset: Dataset): boolean {
    try {
      // Ensure dataset has an ID
      if (!dataset.datasetId) {
        dataset.datasetId = `dataset_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
      }
      
      // Add timestamp if not provided
      if (!dataset.timestamp) {
        dataset.timestamp = Date.now();
      }
      
      // Add to Map
      this.datasets.set(dataset.datasetId, dataset);
      
      // Save to file
      this.saveToFile();
      
      logger.info(`Added dataset ${dataset.datasetId}`);
      return true;
    } catch (error) {
      logger.error(`Error adding dataset:`, error);
      return false;
    }
  }

  /**
   * Update an existing dataset
   */
  updateDataset(datasetId: string, updates: Partial<Dataset>): boolean {
    try {
      const dataset = this.datasets.get(datasetId);
      
      if (!dataset) {
        logger.warn(`Dataset ${datasetId} not found for update`);
        return false;
      }
      
      // Update dataset
      Object.assign(dataset, updates);
      
      // Save to file
      this.saveToFile();
      
      logger.info(`Updated dataset ${datasetId}`);
      return true;
    } catch (error) {
      logger.error(`Error updating dataset ${datasetId}:`, error);
      return false;
    }
  }

  /**
   * Delete a dataset
   */
  deleteDataset(datasetId: string): boolean {
    try {
      const dataset = this.datasets.get(datasetId);
      
      if (!dataset) {
        logger.warn(`Dataset ${datasetId} not found for deletion`);
        return false;
      }
      
      // Delete associated files
      if (dataset.filePath && fs.existsSync(dataset.filePath)) {
        fs.unlinkSync(dataset.filePath);
      }
      
      if (dataset.treePath && fs.existsSync(dataset.treePath)) {
        fs.unlinkSync(dataset.treePath);
      }
      
      // Remove from Map
      this.datasets.delete(datasetId);
      
      // Save to file
      this.saveToFile();
      
      logger.info(`Deleted dataset ${datasetId}`);
      return true;
    } catch (error) {
      logger.error(`Error deleting dataset ${datasetId}:`, error);
      return false;
    }
  }

  /**
   * Get jobs associated with a dataset
   */
  getDatasetJobs(datasetId: string): string[] {
    // This will be implemented in the server.ts file
    // by querying the globalJobStore for jobs with this datasetId
    return [];
  }
}

// Create and export a singleton instance
export const globalDatasetStore = new DatasetStore('./data/datasets');
