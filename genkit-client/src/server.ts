import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { chatFlow, listSessions, getAllJobs, getJob, addJob, updateJobStatus, deleteJob } from './index';
import { logger } from '@genkit-ai/core/logging';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { fileManager } from './fileManager';
import { globalJobStore } from './globalJobStore';
import { FileSessionStore } from './sessionStore';
import { globalDatasetStore, type Dataset } from './datasetStore';
import { globalVisualizationStore, type Visualization } from './visualizationStore';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.SERVER_PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Configure multer for file uploads
const uploadsDir = path.join(__dirname, '../uploads');

// Create uploads directory if it doesn't exist
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    // Use original filename but add timestamp to avoid conflicts
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// We're using the chatFlow exported from index.ts
// No need to initialize a new model or define a new flow here

// Chat API endpoint
app.post('/api/chat', async (req, res) => {
  try {
    const { message, sessionId } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }
    
    // Log the incoming message and session ID if provided
    if (sessionId) {
      logger.info(`Received message: ${message} for session: ${sessionId}`);
    } else {
      logger.info(`Received message: ${message} (new session)`);
    }
    
    // Process the message using the chatFlow from index.ts
    // Pass the sessionId if available to maintain context
    // Only include sessionId if it's a string (not null or undefined)
    const chatFlowParams = { message };
    if (typeof sessionId === 'string') {
      logger.info(`Using existing sessionId: ${sessionId}`);
      Object.assign(chatFlowParams, { sessionId });
    }
    
    const result = await chatFlow(chatFlowParams);
    
    // Extract the response text and new sessionId
    const response = result;
    
    // Get the sessionId from the file system if this is a new session
    const responseSessionId = sessionId || await getLatestSessionId();
    
    logger.info(`Responding with sessionId: ${responseSessionId}`);
    
    // Return both the response and the sessionId
    return res.json({ 
      response,
      sessionId: responseSessionId 
    });
  } catch (error) {
    logger.error('Error processing chat request:', error);
    return res.status(500).json({ error: 'Failed to process chat request' });
  }
});

/**
 * Get the most recently created session ID
 * This is used when a new session is created but we don't have the ID yet
 */
async function getLatestSessionId(): Promise<string> {
  try {
    // Get all session IDs
    const sessions = await listSessions();
    
    if (sessions.length === 0) {
      // If no sessions exist, return a default ID
      return 'no-sessions-found';
    }
    
    // Sort sessions by creation time (assuming session IDs contain timestamps)
    // Our session IDs are in format: session-{timestamp}-{random}
    sessions.sort((a, b) => {
      const timeA = a.split('-')[1] || '0';
      const timeB = b.split('-')[1] || '0';
      return parseInt(timeB) - parseInt(timeA);
    });
    
    // Return the most recent session ID
    return sessions[0];
  } catch (error) {
    logger.error('Error getting latest session ID:', error);
    return 'error-getting-session';
  }
}

// File upload endpoint
app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { sessionId } = req.body;
    const file = req.file;
    
    logger.info(`File uploaded: ${file.originalname} (${file.size} bytes) for session: ${sessionId || 'new session'}`);
    
    // Register the file with our file manager
    fileManager.registerFile({
      filename: file.filename,
      originalName: file.originalname,
      path: file.path,
      size: file.size,
      mimetype: file.mimetype,
      sessionId: sessionId || undefined,
      uploadTime: Date.now()
    });
    
    // Return file information to the client
    return res.json({
      success: true,
      file: {
        filename: file.filename,
        originalName: file.originalname,
        path: file.path,
        size: file.size,
        mimetype: file.mimetype
      },
      message: `File ${file.originalname} uploaded successfully`
    });
  } catch (error) {
    logger.error('Error uploading file:', error);
    return res.status(500).json({ error: 'Failed to upload file' });
  }
});

// Endpoint to get files for a session
app.get('/api/files/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID is required' });
    }
    
    const files = fileManager.getSessionFiles(sessionId);
    
    return res.json({
      success: true,
      files: files.map(file => ({
        filename: file.filename,
        originalName: file.originalName,
        size: file.size,
        mimetype: file.mimetype,
        uploadTime: file.uploadTime
      }))
    });
  } catch (error) {
    logger.error('Error getting session files:', error);
    return res.status(500).json({ error: 'Failed to get session files' });
  }
});

// Global jobs API endpoints

// Get all jobs
app.get('/api/jobs', async (req, res) => {
  try {
    const jobs = await getAllJobs();
    return res.json({
      success: true,
      jobs
    });
  } catch (error) {
    logger.error('Error getting jobs:', error);
    return res.status(500).json({ error: 'Failed to get jobs' });
  }
});

// Get jobs for a specific dataset
app.get('/api/datasets/:datasetId/jobs', async (req, res) => {
  try {
    const { datasetId } = req.params;
    
    if (!datasetId) {
      return res.status(400).json({ error: 'Dataset ID is required' });
    }
    
    // Check if dataset exists
    const dataset = globalDatasetStore.getDataset(datasetId);
    if (!dataset) {
      return res.status(404).json({ error: 'Dataset not found' });
    }
    
    // Get all jobs and filter by datasetId
    const allJobs = globalJobStore.getAllJobs();
    const datasetJobs = allJobs.filter(job => job.datasetId === datasetId);
    
    return res.json({
      success: true,
      jobs: datasetJobs
    });
  } catch (error) {
    logger.error(`Error getting jobs for dataset ${req.params.datasetId}:`, error);
    return res.status(500).json({ error: 'Failed to get dataset jobs' });
  }
});

// Get a specific job
app.get('/api/jobs/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;
    
    if (!jobId) {
      return res.status(400).json({ error: 'Job ID is required' });
    }
    
    const job = globalJobStore.getJob(jobId);
    
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    return res.json({
      success: true,
      job
    });
  } catch (error) {
    logger.error('Error getting job:', error);
    return res.status(500).json({ error: 'Failed to get job' });
  }
});

// Add or update a job
app.post('/api/jobs', async (req, res) => {
  try {
    const jobInfo = req.body;
    
    if (!jobInfo || !jobInfo.jobId) {
      return res.status(400).json({ error: 'Job information with jobId is required' });
    }
    
    // Use the exported function from index.ts
    await addJob(jobInfo);
    const success = true;
    
    return res.json({
      success,
      message: success ? `Job ${jobInfo.jobId} added/updated successfully` : `Failed to add/update job ${jobInfo.jobId}`
    });
  } catch (error) {
    logger.error('Error adding/updating job:', error);
    return res.status(500).json({ error: 'Failed to add/update job' });
  }
});

// Update job status
app.patch('/api/jobs/:jobId/status', async (req, res) => {
  try {
    const { jobId } = req.params;
    const { status, results } = req.body;
    
    if (!jobId) {
      return res.status(400).json({ error: 'Job ID is required' });
    }
    
    if (!status) {
      return res.status(400).json({ error: 'Status is required' });
    }
    
    const success = globalJobStore.updateJobStatus(jobId, status, results);
    
    return res.json({
      success,
      message: success ? `Job ${jobId} status updated to ${status}` : `Failed to update job ${jobId} status`
    });
  } catch (error) {
    logger.error('Error updating job status:', error);
    return res.status(500).json({ error: 'Failed to update job status' });
  }
});

// Delete a job
app.delete('/api/jobs/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;
    
    if (!jobId) {
      return res.status(400).json({ error: 'Job ID is required' });
    }
    
    const success = globalJobStore.deleteJob(jobId);
    
    return res.json({
      success,
      message: success ? `Job ${jobId} deleted successfully` : `Failed to delete job ${jobId}`
    });
  } catch (error) {
    logger.error('Error deleting job:', error);
    return res.status(500).json({ error: 'Failed to delete job' });
  }
});

// Update a job
app.put('/api/jobs/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;
    const updates = req.body;
    
    if (!jobId) {
      return res.status(400).json({ error: 'Job ID is required' });
    }
    
    // Get the current job
    const job = globalJobStore.getJob(jobId);
    
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    // Update the job in the global job store
    // Note: addJob method handles both adding new jobs and updating existing ones
    const updatedJob = { ...job, ...updates };
    const success = globalJobStore.addJob(updatedJob);
    
    if (!success) {
      return res.status(500).json({ error: 'Failed to update job' });
    }
    
    return res.json({
      success: true,
      job: updatedJob
    });
  } catch (error) {
    logger.error('Error updating job:', error);
    return res.status(500).json({ error: 'Failed to update job' });
  }
});

// Update job status
app.put('/api/jobs/:jobId/status', async (req, res) => {
  try {
    const { jobId } = req.params;
    const { status, results } = req.body;
    
    if (!jobId) {
      return res.status(400).json({ error: 'Job ID is required' });
    }
    
    if (!status) {
      return res.status(400).json({ error: 'Status is required' });
    }
    
    // Get the current job
    const job = globalJobStore.getJob(jobId);
    
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    // Update the job status in the global job store
    const updatedJob = { 
      ...job, 
      status,
      ...(results && { results })
    };
    const success = globalJobStore.addJob(updatedJob);
    
    if (!success) {
      return res.status(500).json({ error: 'Failed to update job status' });
    }
    
    return res.json({
      success: true,
      job: updatedJob
    });
  } catch (error) {
    logger.error('Error updating job status:', error);
    return res.status(500).json({ error: 'Failed to update job status' });
  }
});

// Get job results
app.get('/api/jobs/:jobId/results', async (req, res) => {
  try {
    const { jobId } = req.params;
    
    if (!jobId) {
      return res.status(400).json({ error: 'Job ID is required' });
    }
    
    // Get the job
    const job = globalJobStore.getJob(jobId);
    
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    // Return the job results
    return res.json({
      success: true,
      results: job.results || null
    });
  } catch (error) {
    logger.error('Error getting job results:', error);
    return res.status(500).json({ error: 'Failed to get job results' });
  }
});

// Visualization API endpoints

// Get all visualizations
app.get('/api/visualizations', (req, res) => {
  try {
    const visualizations = globalVisualizationStore.getAllVisualizations();
    return res.json({
      success: true,
      visualizations
    });
  } catch (error) {
    logger.error('Error getting visualizations:', error);
    return res.status(500).json({ error: 'Failed to get visualizations' });
  }
});

// Get visualizations for a specific job
// Endpoint moved to line ~957 to avoid duplication

// Get visualizations for a specific dataset
app.get('/api/datasets/:datasetId/visualizations', (req, res) => {
  try {
    const { datasetId } = req.params;
    
    if (!datasetId) {
      return res.status(400).json({ error: 'Dataset ID is required' });
    }
    
    const visualizations = globalVisualizationStore.getDatasetVisualizations(datasetId);
    return res.json({
      success: true,
      visualizations
    });
  } catch (error) {
    logger.error('Error getting dataset visualizations:', error);
    return res.status(500).json({ error: 'Failed to get dataset visualizations' });
  }
});

// Get a specific visualization
app.get('/api/visualizations/:vizId', (req, res) => {
  try {
    const { vizId } = req.params;
    
    if (!vizId) {
      return res.status(400).json({ error: 'Visualization ID is required' });
    }
    
    const visualization = globalVisualizationStore.getVisualization(vizId);
    
    if (!visualization) {
      return res.status(404).json({ error: 'Visualization not found' });
    }
    
    return res.json({
      success: true,
      visualization
    });
  } catch (error) {
    logger.error('Error getting visualization:', error);
    return res.status(500).json({ error: 'Failed to get visualization' });
  }
});

// Add a new visualization
app.post('/api/visualizations', (req, res) => {
  try {
    const visualization = req.body;
    
    if (!visualization) {
      return res.status(400).json({ error: 'Visualization data is required' });
    }
    
    if (!visualization.jobId) {
      return res.status(400).json({ error: 'Job ID is required' });
    }
    
    if (!visualization.type) {
      return res.status(400).json({ error: 'Visualization type is required' });
    }
    
    const success = globalVisualizationStore.addVisualization(visualization);
    
    if (!success) {
      return res.status(500).json({ error: 'Failed to add visualization' });
    }
    
    return res.json({
      success: true,
      visualization
    });
  } catch (error) {
    logger.error('Error adding visualization:', error);
    return res.status(500).json({ error: 'Failed to add visualization' });
  }
});

// Update a visualization
app.put('/api/visualizations/:vizId', (req, res) => {
  try {
    const { vizId } = req.params;
    const updates = req.body;
    
    if (!vizId) {
      return res.status(400).json({ error: 'Visualization ID is required' });
    }
    
    const success = globalVisualizationStore.updateVisualization(vizId, updates);
    
    if (!success) {
      return res.status(404).json({ error: 'Visualization not found or could not be updated' });
    }
    
    const visualization = globalVisualizationStore.getVisualization(vizId);
    
    return res.json({
      success: true,
      visualization
    });
  } catch (error) {
    logger.error('Error updating visualization:', error);
    return res.status(500).json({ error: 'Failed to update visualization' });
  }
});

// Delete a visualization
app.delete('/api/visualizations/:vizId', (req, res) => {
  try {
    const { vizId } = req.params;
    
    if (!vizId) {
      return res.status(400).json({ error: 'Visualization ID is required' });
    }
    
    const success = globalVisualizationStore.deleteVisualization(vizId);
    
    if (!success) {
      return res.status(404).json({ error: 'Visualization not found or could not be deleted' });
    }
    
    return res.json({
      success: true,
      message: 'Visualization deleted successfully'
    });
  } catch (error) {
    logger.error('Error deleting visualization:', error);
    return res.status(500).json({ error: 'Failed to delete visualization' });
  }
});

// Delete all visualizations for a job
app.delete('/api/jobs/:jobId/visualizations', (req, res) => {
  try {
    const { jobId } = req.params;
    
    if (!jobId) {
      return res.status(400).json({ error: 'Job ID is required' });
    }
    
    const success = globalVisualizationStore.deleteJobVisualizations(jobId);
    
    return res.json({
      success,
      message: success ? 'Job visualizations deleted successfully' : 'Failed to delete job visualizations'
    });
  } catch (error) {
    logger.error('Error deleting job visualizations:', error);
    return res.status(500).json({ error: 'Failed to delete job visualizations' });
  }
});

// Registry API endpoints
import registryService from './services/registryService';

// Get all available HyPhy methods with their visualizations
app.get('/api/registry/methods', (req, res) => {
  try {
    const methods = registryService.getAllMethods();
    return res.json({
      success: true,
      methods
    });
  } catch (error) {
    logger.error('Error getting registry methods:', error);
    return res.status(500).json({ error: 'Failed to get registry methods' });
  }
});

// Get available visualizations for a specific HyPhy method
app.get('/api/registry/methods/:method/visualizations', (req, res) => {
  try {
    const { method } = req.params;
    
    if (!method) {
      return res.status(400).json({ error: 'Method name is required' });
    }
    
    if (!registryService.methodExists(method)) {
      return res.status(404).json({ error: `Method '${method}' not found` });
    }
    
    const visualizations = registryService.getMethodVisualizations(method);
    return res.json({
      success: true,
      visualizations
    });
  } catch (error) {
    logger.error('Error getting method visualizations:', error);
    return res.status(500).json({ error: 'Failed to get method visualizations' });
  }
});

// Get all visualization categories
app.get('/api/registry/categories', (req, res) => {
  try {
    const categories = registryService.getCategories();
    return res.json({
      success: true,
      categories
    });
  } catch (error) {
    logger.error('Error getting visualization categories:', error);
    return res.status(500).json({ error: 'Failed to get visualization categories' });
  }
});

// Sessions API endpoints

// Create a session store instance for API access
const sessionStore = new FileSessionStore('./data/sessions');

// Get all sessions
app.get('/api/sessions', async (req, res) => {
  try {
    const sessionIds = await listSessions();
    
    // Get full session info for each session
    const sessionsWithInfo = await Promise.all(
      sessionIds.map(async (id) => {
        try {
          // Load session from the session store
          const sessionData = await sessionStore.load(id);
          if (sessionData) {
            // Get session metadata or create default timestamps
            const metadata = sessionData.metadata || {};
            return {
              id,
              created: metadata.created || Date.now(),
              updated: metadata.updated || Date.now(),
              messageCount: sessionData.messages?.length || 0
            };
          }
          return null;
        } catch (err) {
          logger.warn(`Error loading session ${id}:`, err);
          return null;
        }
      })
    );
    
    // Filter out null sessions (failed to load)
    const validSessions = sessionsWithInfo.filter(Boolean);
    
    return res.json({
      success: true,
      sessions: validSessions
    });
  } catch (error) {
    logger.error('Error listing sessions:', error);
    return res.status(500).json({ error: 'Failed to list sessions' });
  }
});

// Get a specific session
app.get('/api/sessions/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    if (!sessionId) {
      return res.status(400).json({ 
        success: false, 
        error: 'Session ID is required' 
      });
    }
    
    // Load session from the session store
    const sessionData = await sessionStore.load(sessionId);
    
    if (!sessionData) {
      return res.status(404).json({ 
        success: false, 
        error: 'Session not found' 
      });
    }
    
    return res.json({
      success: true,
      session: sessionData
    });
  } catch (error) {
    logger.error('Error getting session:', error);
    return res.status(500).json({ 
      success: false, 
      error: 'Failed to get session' 
    });
  }
});

// Dataset API endpoints

// Get all datasets
app.get('/api/datasets', async (req, res) => {
  try {
    const datasets = globalDatasetStore.getAllDatasets();
    
    return res.json({
      success: true,
      datasets
    });
  } catch (error) {
    logger.error('Error getting datasets:', error);
    return res.status(500).json({ error: 'Failed to get datasets' });
  }
});

// Get a specific dataset
app.get('/api/datasets/:datasetId', async (req, res) => {
  try {
    const { datasetId } = req.params;
    
    if (!datasetId) {
      return res.status(400).json({ error: 'Dataset ID is required' });
    }
    
    const dataset = globalDatasetStore.getDataset(datasetId);
    
    if (!dataset) {
      return res.status(404).json({ error: 'Dataset not found' });
    }
    
    return res.json({
      success: true,
      dataset
    });
  } catch (error) {
    logger.error('Error getting dataset:', error);
    return res.status(500).json({ error: 'Failed to get dataset' });
  }
});

// Upload a new dataset
app.post('/api/datasets', upload.fields([
  { name: 'alignmentFile', maxCount: 1 },
  { name: 'treeFile', maxCount: 1 }
]), async (req, res) => {
  try {
    const files = req.files as { [fieldname: string]: Express.Multer.File[] };
    
    // Check if at least alignment file is uploaded
    if (!files || !files.alignmentFile) {
      return res.status(400).json({ error: 'Alignment file is required' });
    }
    
    const alignmentFile = files.alignmentFile[0];
    const treeFile = files.treeFile ? files.treeFile[0] : undefined;
    
    // Create dataset object
    const dataset: Dataset = {
      datasetId: `dataset_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      name: req.body.name || alignmentFile.originalname,
      description: req.body.description || '',
      timestamp: Date.now(),
      hasAlignment: true,
      hasTree: !!treeFile,
      fileSize: alignmentFile.size,
      filePath: alignmentFile.path,
      treePath: treeFile?.path,
      metadata: {
        originalAlignmentName: alignmentFile.originalname,
        originalTreeName: treeFile?.originalname
      }
    };
    
    // Add dataset to store
    const success = globalDatasetStore.addDataset(dataset);
    
    if (!success) {
      return res.status(500).json({ error: 'Failed to add dataset' });
    }
    
    return res.json({
      success: true,
      dataset
    });
  } catch (error) {
    logger.error('Error uploading dataset:', error);
    return res.status(500).json({ error: 'Failed to upload dataset' });
  }
});

// Update a dataset
app.put('/api/datasets/:datasetId', async (req, res) => {
  try {
    const { datasetId } = req.params;
    
    if (!datasetId) {
      return res.status(400).json({ error: 'Dataset ID is required' });
    }
    
    const updates = req.body;
    
    // Don't allow updating certain fields
    delete updates.datasetId;
    delete updates.filePath;
    delete updates.treePath;
    
    const success = globalDatasetStore.updateDataset(datasetId, updates);
    
    if (!success) {
      return res.status(404).json({ error: 'Dataset not found' });
    }
    
    return res.json({
      success: true,
      message: `Dataset ${datasetId} updated successfully`
    });
  } catch (error) {
    logger.error('Error updating dataset:', error);
    return res.status(500).json({ error: 'Failed to update dataset' });
  }
});

// Delete a dataset
app.delete('/api/datasets/:datasetId', async (req, res) => {
  try {
    const { datasetId } = req.params;
    
    if (!datasetId) {
      return res.status(400).json({ error: 'Dataset ID is required' });
    }
    
    const success = globalDatasetStore.deleteDataset(datasetId);
    
    if (!success) {
      return res.status(404).json({ error: 'Dataset not found' });
    }
    
    return res.json({
      success: true,
      message: `Dataset ${datasetId} deleted successfully`
    });
  } catch (error) {
    logger.error('Error deleting dataset:', error);
    return res.status(500).json({ error: 'Failed to delete dataset' });
  }
});

// Get jobs for a dataset
app.get('/api/datasets/:datasetId/jobs', async (req, res) => {
  try {
    const { datasetId } = req.params;
    
    if (!datasetId) {
      return res.status(400).json({ error: 'Dataset ID is required' });
    }
    
    // Get all jobs and filter by datasetId
    const allJobs = await getAllJobs();
    const datasetJobs = allJobs.filter(job => job.datasetId === datasetId);
    
    return res.json({
      success: true,
      jobs: datasetJobs
    });
  } catch (error) {
    logger.error('Error getting dataset jobs:', error);
    return res.status(500).json({ error: 'Failed to get dataset jobs' });
  }
});

// Visualization API endpoints

// Get all visualizations
app.get('/api/visualizations', async (req, res) => {
  try {
    const visualizations = globalVisualizationStore.getAllVisualizations();
    
    return res.json({
      success: true,
      visualizations
    });
  } catch (error) {
    logger.error('Error getting visualizations:', error);
    return res.status(500).json({ error: 'Failed to get visualizations' });
  }
});

// Get visualizations for a job
app.get('/api/jobs/:jobId/visualizations', async (req, res) => {
  try {
    const { jobId } = req.params;
    
    if (!jobId) {
      return res.status(400).json({ error: 'Job ID is required' });
    }
    
    const visualizations = globalVisualizationStore.getJobVisualizations(jobId);
    
    return res.json({
      success: true,
      visualizations
    });
  } catch (error) {
    logger.error('Error getting job visualizations:', error);
    return res.status(500).json({ error: 'Failed to get job visualizations' });
  }
});

// Get visualizations for a dataset
app.get('/api/datasets/:datasetId/visualizations', async (req, res) => {
  try {
    const { datasetId } = req.params;
    
    if (!datasetId) {
      return res.status(400).json({ error: 'Dataset ID is required' });
    }
    
    const visualizations = globalVisualizationStore.getDatasetVisualizations(datasetId);
    
    return res.json({
      success: true,
      visualizations
    });
  } catch (error) {
    logger.error('Error getting dataset visualizations:', error);
    return res.status(500).json({ error: 'Failed to get dataset visualizations' });
  }
});

// Get a specific visualization
app.get('/api/visualizations/:vizId', async (req, res) => {
  try {
    const { vizId } = req.params;
    
    if (!vizId) {
      return res.status(400).json({ error: 'Visualization ID is required' });
    }
    
    const visualization = globalVisualizationStore.getVisualization(vizId);
    
    if (!visualization) {
      return res.status(404).json({ error: 'Visualization not found' });
    }
    
    return res.json({
      success: true,
      visualization
    });
  } catch (error) {
    logger.error('Error getting visualization:', error);
    return res.status(500).json({ error: 'Failed to get visualization' });
  }
});

// Create a new visualization
app.post('/api/visualizations', async (req, res) => {
  try {
    const vizData = req.body;
    
    // Validate required fields
    if (!vizData.jobId || !vizData.type || !vizData.title || !vizData.data) {
      return res.status(400).json({ 
        error: 'Missing required fields: jobId, type, title, and data are required' 
      });
    }
    
    // Create visualization object
    const visualization: Visualization = {
      vizId: `viz_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      jobId: vizData.jobId,
      datasetId: vizData.datasetId,
      type: vizData.type,
      title: vizData.title,
      description: vizData.description || '',
      timestamp: Date.now(),
      data: vizData.data,
      config: vizData.config || {},
      metadata: vizData.metadata || {}
    };
    
    // Add visualization to store
    const success = globalVisualizationStore.addVisualization(visualization);
    
    if (!success) {
      return res.status(500).json({ error: 'Failed to add visualization' });
    }
    
    return res.json({
      success: true,
      visualization
    });
  } catch (error) {
    logger.error('Error creating visualization:', error);
    return res.status(500).json({ error: 'Failed to create visualization' });
  }
});

// Update a visualization
app.put('/api/visualizations/:vizId', async (req, res) => {
  try {
    const { vizId } = req.params;
    
    if (!vizId) {
      return res.status(400).json({ error: 'Visualization ID is required' });
    }
    
    const updates = req.body;
    
    // Don't allow updating certain fields
    delete updates.vizId;
    delete updates.jobId;
    
    const success = globalVisualizationStore.updateVisualization(vizId, updates);
    
    if (!success) {
      return res.status(404).json({ error: 'Visualization not found' });
    }
    
    return res.json({
      success: true,
      message: `Visualization ${vizId} updated successfully`
    });
  } catch (error) {
    logger.error('Error updating visualization:', error);
    return res.status(500).json({ error: 'Failed to update visualization' });
  }
});

// Delete a visualization
app.delete('/api/visualizations/:vizId', async (req, res) => {
  try {
    const { vizId } = req.params;
    
    if (!vizId) {
      return res.status(400).json({ error: 'Visualization ID is required' });
    }
    
    const success = globalVisualizationStore.deleteVisualization(vizId);
    
    if (!success) {
      return res.status(404).json({ error: 'Visualization not found' });
    }
    
    return res.json({
      success: true,
      message: `Visualization ${vizId} deleted successfully`
    });
  } catch (error) {
    logger.error('Error deleting visualization:', error);
    return res.status(500).json({ error: 'Failed to delete visualization' });
  }
});

// Delete all visualizations for a job
app.delete('/api/jobs/:jobId/visualizations', async (req, res) => {
  try {
    const { jobId } = req.params;
    
    if (!jobId) {
      return res.status(400).json({ error: 'Job ID is required' });
    }
    
    const success = globalVisualizationStore.deleteJobVisualizations(jobId);
    
    return res.json({
      success: true,
      message: `Visualizations for job ${jobId} deleted successfully`
    });
  } catch (error) {
    logger.error('Error deleting job visualizations:', error);
    return res.status(500).json({ error: 'Failed to delete job visualizations' });
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
