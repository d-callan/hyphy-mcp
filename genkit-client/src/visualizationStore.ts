import fs from 'fs';
import path from 'path';
import { logger } from '@genkit-ai/core/logging';

// Define the Visualization interface
export interface Visualization {
  vizId: string;
  jobId: string;
  datasetId?: string;
  type: string;
  title: string;
  description?: string;
  component?: string;  // Added component property for visualization rendering
  timestamp: number;
  data: any;
  config?: Record<string, any>;
  metadata?: Record<string, any>;
}

/**
 * Global visualization store for managing visualizations
 */
class VisualizationStore {
  private visualizations: Map<string, Visualization>;
  private dataFile: string;

  constructor(dataDir: string) {
    this.visualizations = new Map<string, Visualization>();
    
    // Create data directory if it doesn't exist
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    
    this.dataFile = path.join(dataDir, 'visualizations.json');
    
    // Load visualizations from file if it exists
    this.loadFromFile();
  }

  /**
   * Load visualizations from file
   */
  private loadFromFile(): void {
    try {
      if (fs.existsSync(this.dataFile)) {
        const data = fs.readFileSync(this.dataFile, 'utf8');
        const visualizations = JSON.parse(data);
        
        // Convert array to Map
        this.visualizations = new Map(visualizations.map((viz: Visualization) => [viz.vizId, viz]));
        
        logger.info(`Loaded ${this.visualizations.size} visualizations from file`);
      } else {
        logger.info('No visualizations file found, starting with empty visualization store');
      }
    } catch (error) {
      logger.error('Error loading visualizations from file:', error);
    }
  }

  /**
   * Save visualizations to file
   */
  private saveToFile(): void {
    try {
      // Convert Map to array for JSON serialization
      const visualizations = Array.from(this.visualizations.values());
      fs.writeFileSync(this.dataFile, JSON.stringify(visualizations, null, 2));
      logger.info(`Saved ${visualizations.length} visualizations to file`);
    } catch (error) {
      logger.error('Error saving visualizations to file:', error);
    }
  }

  /**
   * Get all visualizations
   */
  getAllVisualizations(): Visualization[] {
    return Array.from(this.visualizations.values());
  }

  /**
   * Get visualizations for a specific job
   */
  getJobVisualizations(jobId: string): Visualization[] {
    return Array.from(this.visualizations.values())
      .filter(viz => viz.jobId === jobId);
  }

  /**
   * Get visualizations for a specific dataset
   */
  getDatasetVisualizations(datasetId: string): Visualization[] {
    return Array.from(this.visualizations.values())
      .filter(viz => viz.datasetId === datasetId);
  }

  /**
   * Get a specific visualization by ID
   */
  getVisualization(vizId: string): Visualization | undefined {
    return this.visualizations.get(vizId);
  }

  /**
   * Add a new visualization
   */
  addVisualization(visualization: Visualization): boolean {
    try {
      // Ensure visualization has an ID
      if (!visualization.vizId) {
        visualization.vizId = `viz_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
      }
      
      // Add timestamp if not provided
      if (!visualization.timestamp) {
        visualization.timestamp = Date.now();
      }
      
      // Add to Map
      this.visualizations.set(visualization.vizId, visualization);
      
      // Save to file
      this.saveToFile();
      
      logger.info(`Added visualization ${visualization.vizId} for job ${visualization.jobId}`);
      return true;
    } catch (error) {
      logger.error(`Error adding visualization:`, error);
      return false;
    }
  }

  /**
   * Update an existing visualization
   */
  updateVisualization(vizId: string, updates: Partial<Visualization>): boolean {
    try {
      const visualization = this.visualizations.get(vizId);
      
      if (!visualization) {
        logger.warn(`Visualization ${vizId} not found for update`);
        return false;
      }
      
      // Update visualization
      Object.assign(visualization, updates);
      
      // Save to file
      this.saveToFile();
      
      logger.info(`Updated visualization ${vizId}`);
      return true;
    } catch (error) {
      logger.error(`Error updating visualization ${vizId}:`, error);
      return false;
    }
  }

  /**
   * Delete a visualization
   */
  deleteVisualization(vizId: string): boolean {
    try {
      const visualization = this.visualizations.get(vizId);
      
      if (!visualization) {
        logger.warn(`Visualization ${vizId} not found for deletion`);
        return false;
      }
      
      // Remove from Map
      this.visualizations.delete(vizId);
      
      // Save to file
      this.saveToFile();
      
      logger.info(`Deleted visualization ${vizId}`);
      return true;
    } catch (error) {
      logger.error(`Error deleting visualization ${vizId}:`, error);
      return false;
    }
  }

  /**
   * Delete all visualizations for a job
   */
  deleteJobVisualizations(jobId: string): boolean {
    try {
      // Find all visualizations for this job
      const jobVizIds = Array.from(this.visualizations.values())
        .filter(viz => viz.jobId === jobId)
        .map(viz => viz.vizId);
      
      // Delete each visualization
      let success = true;
      for (const vizId of jobVizIds) {
        if (!this.deleteVisualization(vizId)) {
          success = false;
        }
      }
      
      logger.info(`Deleted ${jobVizIds.length} visualizations for job ${jobId}`);
      return success;
    } catch (error) {
      logger.error(`Error deleting visualizations for job ${jobId}:`, error);
      return false;
    }
  }
}

// Create and export a singleton instance
export const globalVisualizationStore = new VisualizationStore('./data/visualizations');
