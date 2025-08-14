import { writable } from 'svelte/store';

// Define VisualizationInfo interface
export interface VisualizationInfo {
  vizId: string;
  jobId: string;
  type: string;
  title: string;
  description?: string;
  timestamp: number;
  data?: Record<string, any>;
}

// API endpoints
const API_BASE = 'http://localhost:3000'; // Same base as jobStore
const ENDPOINTS = {
  VISUALIZATIONS: `${API_BASE}/api/visualizations`,
  VISUALIZATION: (id: string) => `${API_BASE}/api/visualizations/${id}`,
  JOB_VISUALIZATIONS: (jobId: string) => `${API_BASE}/api/jobs/${jobId}/visualizations`
};

// Create a writable store for visualizations
const createVisualizationStore = () => {
  const { subscribe, set, update } = writable<VisualizationInfo[]>([]);
  
  // Load visualizations from localStorage on initialization
  const loadFromLocalStorage = (): VisualizationInfo[] => {
    if (typeof localStorage !== 'undefined') {
      const storedVisualizations = localStorage.getItem('hyphy_visualizations');
      return storedVisualizations ? JSON.parse(storedVisualizations) : [];
    }
    return [];
  };
  
  // Save visualizations to localStorage
  const saveToLocalStorage = (visualizations: VisualizationInfo[]): void => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('hyphy_visualizations', JSON.stringify(visualizations));
    }
  };
  
  // Initialize store with visualizations from localStorage
  const init = () => {
    const localVisualizations = loadFromLocalStorage();
    set(localVisualizations);
    
    // We'll implement backend fetching when the API is ready
    // For now, just use localStorage
  };
  
  // Fetch all visualizations
  const fetchVisualizations = async (): Promise<VisualizationInfo[]> => {
    try {
      const response = await fetch(ENDPOINTS.VISUALIZATIONS);
      if (!response.ok) {
        throw new Error(`Failed to fetch visualizations: ${response.statusText}`);
      }
      
      const data = await response.json();
      const visualizations: VisualizationInfo[] = data.visualizations || [];
      
      // Update store and localStorage
      set(visualizations);
      saveToLocalStorage(visualizations); // Keep local cache for offline fallback
      
      return visualizations;
    } catch (error) {
      console.error('Error fetching visualizations:', error);
      return loadFromLocalStorage(); // Fallback to local cache
    }
  };
  
  // Fetch visualizations for a specific job
  const fetchJobVisualizations = async (jobId: string): Promise<VisualizationInfo[]> => {
    try {
      const response = await fetch(ENDPOINTS.JOB_VISUALIZATIONS(jobId));
      if (!response.ok) {
        throw new Error(`Failed to fetch job visualizations: ${response.statusText}`);
      }
      
      const data = await response.json();
      const jobVisualizations: VisualizationInfo[] = data.visualizations || [];
      
      return jobVisualizations;
    } catch (error) {
      console.error(`Error fetching visualizations for job ${jobId}:`, error);
      // Return filtered local data as fallback
      const allVisualizations = loadFromLocalStorage();
      return allVisualizations.filter(viz => viz.jobId === jobId);
    }
  };
  
  // Add or update a visualization
  const addOrUpdateVisualization = async (vizInfo: VisualizationInfo): Promise<boolean> => {
    try {
      // Check if this is an update or a new visualization
      const isUpdate = !!vizInfo.vizId;
      
      let response;
      if (isUpdate) {
        // Update existing visualization
        response = await fetch(ENDPOINTS.VISUALIZATION(vizInfo.vizId), {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(vizInfo)
        });
      } else {
        // Add new visualization
        response = await fetch(ENDPOINTS.VISUALIZATIONS, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(vizInfo)
        });
      }
      
      if (!response.ok) {
        throw new Error(`Failed to ${isUpdate ? 'update' : 'add'} visualization: ${response.statusText}`);
      }
      
      // Get the updated data from the response
      const data = await response.json();
      const updatedViz = data.visualization;
      
      // Update local store
      update(visualizations => {
        const index = visualizations.findIndex(viz => viz.vizId === vizInfo.vizId);
        
        if (index >= 0) {
          // Update existing visualization
          const updatedVisualizations = [...visualizations];
          updatedVisualizations[index] = updatedViz || { ...updatedVisualizations[index], ...vizInfo };
          saveToLocalStorage(updatedVisualizations);
          return updatedVisualizations;
        } else {
          // Add new visualization
          const updatedVisualizations = [...visualizations, updatedViz || vizInfo];
          saveToLocalStorage(updatedVisualizations);
          return updatedVisualizations;
        }
      });
      
      return true;
    } catch (error) {
      console.error('Error adding/updating visualization:', error);
      
      // Fallback to local storage only if API fails
      try {
        update(visualizations => {
          const index = visualizations.findIndex(viz => viz.vizId === vizInfo.vizId);
          
          if (index >= 0) {
            // Update existing visualization
            const updatedVisualizations = [...visualizations];
            updatedVisualizations[index] = { ...updatedVisualizations[index], ...vizInfo };
            saveToLocalStorage(updatedVisualizations);
            return updatedVisualizations;
          } else {
            // Add new visualization
            const updatedVisualizations = [...visualizations, vizInfo];
            saveToLocalStorage(updatedVisualizations);
            return updatedVisualizations;
          }
        });
        return true;
      } catch (localError) {
        console.error('Error updating local visualization store:', localError);
        return false;
      }
    }
  };
  
  // Delete a visualization
  const deleteVisualization = async (vizId: string): Promise<boolean> => {
    try {
      const response = await fetch(ENDPOINTS.VISUALIZATION(vizId), {
        method: 'DELETE'
      });
      
      if (!response.ok) {
        throw new Error(`Failed to delete visualization: ${response.statusText}`);
      }
      
      // Update local store
      update(visualizations => {
        const updatedVisualizations = visualizations.filter(viz => viz.vizId !== vizId);
        saveToLocalStorage(updatedVisualizations);
        return updatedVisualizations;
      });
      
      return true;
    } catch (error) {
      console.error('Error deleting visualization:', error);
      
      // Fallback to local storage only if API fails
      try {
        update(visualizations => {
          const updatedVisualizations = visualizations.filter(viz => viz.vizId !== vizId);
          saveToLocalStorage(updatedVisualizations);
          return updatedVisualizations;
        });
        return true;
      } catch (localError) {
        console.error('Error updating local visualization store:', localError);
        return false;
      }
    }
  };
  
  // Delete all visualizations for a job
  const deleteJobVisualizations = async (jobId: string): Promise<boolean> => {
    try {
      const response = await fetch(ENDPOINTS.JOB_VISUALIZATIONS(jobId), {
        method: 'DELETE'
      });
      
      if (!response.ok) {
        throw new Error(`Failed to delete job visualizations: ${response.statusText}`);
      }
      
      // Update local store
      update(visualizations => {
        const updatedVisualizations = visualizations.filter(viz => viz.jobId !== jobId);
        saveToLocalStorage(updatedVisualizations);
        return updatedVisualizations;
      });
      
      return true;
    } catch (error) {
      console.error(`Error deleting visualizations for job ${jobId}:`, error);
      
      // Fallback to local storage only if API fails
      try {
        update(visualizations => {
          const updatedVisualizations = visualizations.filter(viz => viz.jobId !== jobId);
          saveToLocalStorage(updatedVisualizations);
          return updatedVisualizations;
        });
        return true;
      } catch (localError) {
        console.error('Error updating local visualization store:', localError);
        return false;
      }
    }
  };
  
  // Initialize the store
  init();
  
  return {
    subscribe,
    fetchVisualizations,
    fetchJobVisualizations,
    addOrUpdateVisualization,
    deleteVisualization,
    deleteJobVisualizations
  };
};

// Export the store
export const visualizationStore = createVisualizationStore();
