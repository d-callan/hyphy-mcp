import { writable } from 'svelte/store';

// Define DatasetInfo interface
export interface DatasetInfo {
  datasetId: string;
  name: string;
  description?: string;
  timestamp: number;
  hasAlignment: boolean;
  hasTree: boolean;
  fileSize?: number;
  sequenceCount?: number;
  metadata?: Record<string, any>;
}

// API endpoints
const API_BASE = 'http://localhost:3000';
const ENDPOINTS = {
  DATASETS: `${API_BASE}/api/datasets`,
  DATASET: (id: string) => `${API_BASE}/api/datasets/${id}`,
  DATASET_JOBS: (datasetId: string) => `${API_BASE}/api/datasets/${datasetId}/jobs`
};

// Create a writable store for datasets
const createDatasetStore = () => {
  const { subscribe, set, update } = writable<DatasetInfo[]>([]);
  
  // Load datasets from localStorage on initialization
  const loadFromLocalStorage = (): DatasetInfo[] => {
    if (typeof localStorage !== 'undefined') {
      const storedDatasets = localStorage.getItem('hyphy_datasets');
      return storedDatasets ? JSON.parse(storedDatasets) : [];
    }
    return [];
  };
  
  // Save datasets to localStorage
  const saveToLocalStorage = (datasets: DatasetInfo[]): void => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('hyphy_datasets', JSON.stringify(datasets));
    }
  };
  
  // Initialize store with datasets from localStorage
  const init = () => {
    const localDatasets = loadFromLocalStorage();
    set(localDatasets);
    
    // We'll implement backend fetching when the API is ready
    // For now, just use localStorage
  };
  
  // Fetch all datasets
  const fetchDatasets = async (): Promise<DatasetInfo[]> => {
    try {
      // This endpoint will be implemented in the future
      // For now, return mock data or localStorage data
      return loadFromLocalStorage();
      
      /* Uncomment when API is ready
      const response = await fetch(ENDPOINTS.DATASETS);
      if (!response.ok) {
        throw new Error(`Failed to fetch datasets: ${response.statusText}`);
      }
      
      const data = await response.json();
      const datasets: DatasetInfo[] = data.datasets || [];
      
      // Update store and localStorage
      set(datasets);
      saveToLocalStorage(datasets);
      
      return datasets;
      */
    } catch (error) {
      console.error('Error fetching datasets:', error);
      return loadFromLocalStorage(); // Fallback to local cache
    }
  };
  
  // Fetch a specific dataset
  const fetchDataset = async (datasetId: string): Promise<DatasetInfo | null> => {
    try {
      // This endpoint will be implemented in the future
      // For now, find in local data
      const allDatasets = loadFromLocalStorage();
      return allDatasets.find(dataset => dataset.datasetId === datasetId) || null;
      
      /* Uncomment when API is ready
      const response = await fetch(ENDPOINTS.DATASET(datasetId));
      if (!response.ok) {
        throw new Error(`Failed to fetch dataset: ${response.statusText}`);
      }
      
      const data = await response.json();
      return data.dataset || null;
      */
    } catch (error) {
      console.error(`Error fetching dataset ${datasetId}:`, error);
      // Return from local data as fallback
      const allDatasets = loadFromLocalStorage();
      return allDatasets.find(dataset => dataset.datasetId === datasetId) || null;
    }
  };
  
  // Upload a new dataset
  const uploadDataset = async (file: File, hasTree: boolean = false): Promise<DatasetInfo | null> => {
    try {
      const formData = new FormData();
      formData.append('alignmentFile', file);
      
      // If we have a tree file, we would append it here
      // formData.append('treeFile', treeFile);
      
      console.log('Uploading file to backend:', file.name);
      
      const response = await fetch(ENDPOINTS.DATASETS, {
        method: 'POST',
        body: formData
      });
      
      if (!response.ok) {
        throw new Error(`Failed to upload dataset: ${response.statusText}`);
      }
      
      const data = await response.json();
      if (!data.success) {
        throw new Error(`API returned error: ${data.error || 'Unknown error'}`);
      }
      
      const newDataset: DatasetInfo = {
        datasetId: data.dataset.datasetId,
        name: data.dataset.name,
        description: data.dataset.description,
        timestamp: data.dataset.timestamp,
        hasAlignment: data.dataset.hasAlignment,
        hasTree: data.dataset.hasTree,
        fileSize: data.dataset.fileSize,
        sequenceCount: data.dataset.sequenceCount || 0
      };
      
      // Update local store
      update(datasets => {
        const updatedDatasets = [...datasets, newDataset];
        saveToLocalStorage(updatedDatasets);
        return updatedDatasets;
      });
      
      return newDataset;
    } catch (error) {
      console.error('Error uploading dataset:', error);
      return null;
    }
  };
  
  // Delete a dataset
  const deleteDataset = async (datasetId: string): Promise<boolean> => {
    try {
      console.log('Deleting dataset from backend:', datasetId);
      
      const response = await fetch(ENDPOINTS.DATASET(datasetId), {
        method: 'DELETE'
      });
      
      if (!response.ok) {
        throw new Error(`Failed to delete dataset: ${response.statusText}`);
      }
      
      // Update local store
      update(datasets => {
        const updatedDatasets = datasets.filter(dataset => dataset.datasetId !== datasetId);
        saveToLocalStorage(updatedDatasets);
        return updatedDatasets;
      });
      
      return true;
    } catch (error) {
      console.error('Error deleting dataset:', error);
      return false;
    }
  };
  
  // Initialize the store
  init();
  
  return {
    subscribe,
    fetchDatasets,
    fetchDataset,
    uploadDataset,
    deleteDataset
  };
};

// Export the store
export const datasetStore = createDatasetStore();
