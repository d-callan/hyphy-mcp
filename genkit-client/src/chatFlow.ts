import { z } from 'genkit';
import { logger } from '@genkit-ai/core/logging';
import ai from './ai';
import dotenv from 'dotenv';
import { FileSessionStore } from './sessionStore';
import { fileManager } from './fileManager';
import { globalJobStore } from './globalJobStore';
import { globalDatasetStore, type Dataset } from './datasetStore';
import { globalVisualizationStore, type Visualization } from './visualizationStore';
import orchestratorAgent, { hyphyAgent, visualizationAgent, housekeepingAgent } from './agents';

// Simple in-memory cache for chatFlow data
const chatFlowCache: {
  [key: string]: {
    timestamp: number;
    datasets: any[];
    jobs: any[];
    visualizations: any[];
  };
} = {};

// Initialize session store for chat message history
const sessionStore = new FileSessionStore('./data/sessions');

// Load environment variables from .env file
dotenv.config();

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

// Schema for chat flow input
export const chatFlowInputSchema = z.object({
  message: z.string().describe('User message for the AI'),
  sessionId: z.string().optional().describe('Optional session ID to continue a conversation'),
  fileId: z.string().optional().describe('Optional ID of a file to analyze'),
});
/**
 * Defines a simple chat flow that interacts with the MCP server.
 * This flow takes a user message, potentially uses an LLM to process it,
 * and can interact with tools exposed by the configured MCP client.
 */
export const chatFlow = ai.defineFlow(
  {
    name: 'chatFlow',
    inputSchema: chatFlowInputSchema,
    outputSchema: z.string().describe('AI response from chat'),
  },
  async (input: z.infer<typeof chatFlowInputSchema>) => {
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
    
    // Get dataset and job information for context with caching
    // Use a simple in-memory cache with a 5-second TTL
    const cacheKey = 'chatflow_context_data';
    const cacheTTL = 5000; // 5 seconds
    
    let datasets: any[] = [];
    let jobs: any[] = [];
    let visualizations: any[] = [];
    
    // Check if we have cached data and it's still valid
    const now = Date.now();
    if (chatFlowCache[cacheKey] && (now - chatFlowCache[cacheKey].timestamp) < cacheTTL) {
      logger.debug('Using cached context data');
      datasets = chatFlowCache[cacheKey].datasets;
      jobs = chatFlowCache[cacheKey].jobs;
      visualizations = chatFlowCache[cacheKey].visualizations;
    } else {
      // Cache miss or expired, fetch fresh data
      logger.debug('Fetching fresh context data');
      datasets = globalDatasetStore.getAllDatasets();
      jobs = globalJobStore.getAllJobs();
      visualizations = globalVisualizationStore.getAllVisualizations();
      
      // Update the cache
      chatFlowCache[cacheKey] = {
        timestamp: now,
        datasets,
        jobs,
        visualizations
      };
    }
    
    let datasetContext = '';
    if (datasets.length > 0) {
      datasetContext = `\n\nAvailable datasets (${datasets.length}):\n` + 
        datasets.slice(0, 5).map((dataset, index) => {
          return `${index + 1}. ${dataset.name} (ID: ${dataset.datasetId}) - ${dataset.hasAlignment ? 'Has alignment' : 'No alignment'}${dataset.hasTree ? ', Has tree' : ''}`;
        }).join('\n');
      
      if (datasets.length > 5) {
        datasetContext += `\n...and ${datasets.length - 5} more datasets. Use the 'list_datasets' tool to see all.`;
      }
    }
    
    let jobContext = '';
    if (jobs.length > 0) {
      jobContext = `\n\nRecent jobs (${jobs.length}):\n` + 
        jobs.slice(0, 5).map((job, index) => {
          return `${index + 1}. ${job.method} job (ID: ${job.jobId}) - Status: ${job.status}${job.datasetId ? `, Dataset: ${job.datasetId}` : ''}`;
        }).join('\n');
      
      if (jobs.length > 5) {
        jobContext += `\n...and ${jobs.length - 5} more jobs. Use the 'list_jobs' tool to see all.`;
      }
    }
    
    let vizContext = '';
    if (visualizations.length > 0) {
      vizContext = `\n\nAvailable visualizations (${visualizations.length}):\n` + 
        visualizations.slice(0, 5).map((viz, index) => {
          return `${index + 1}. ${viz.title} (ID: ${viz.vizId}) - Type: ${viz.type}, Job: ${viz.jobId}`;
        }).join('\n');
      
      if (visualizations.length > 5) {
        vizContext += `\n...and ${visualizations.length - 5} more visualizations. Use the 'list_visualizations' tool to see all.`;
      }
    }
    
    const dataContext = datasetContext + jobContext + vizContext;
    
    const prompt = conversationContext 
      ? `${conversationContext}\n\nUser: ${input.message}${fileContext}${dataContext}\n\n
      Based on this conversation, available files, datasets, jobs, and visualizations, consider if you need to use any 
      available tools to generate a response. The Orchestrator Agent will help you with this and has access to 
      tools from three specialized domains:\n\n1. HyPhy Tools: For running phylogenetic analyses using HyPhy methods 
      and interpreting results\n2. Visualization Tools: For creating and managing visualizations of HyPhy results\n
      3. Housekeeping Tools: For managing datasets, jobs, and general organization\n\nRespond in a helpful and
      informative manner.`      : `User says: "${input.message}"${fileContext}${dataContext}\n\n
      Based on this and available files, datasets, jobs, and visualizations, consider if you need to use any 
      available tools to generate a response. The Orchestrator Agent will help you with this and has access to 
      tools from three specialized domains:\n\n1. HyPhy Tools: For running phylogenetic analyses using HyPhy methods 
      and interpreting results\n2. Visualization Tools: For creating and managing visualizations of HyPhy results\n
      3. Housekeeping Tools: For managing datasets, jobs, and general organization\n\nRespond in a helpful and
      informative manner.`;
    
    // Instead of wrapping the tools (which creates circular references),
    // we'll modify the prompt to instruct the LLM to include the session ID
    const sessionPrompt = `${prompt}\n\nIMPORTANT: When using any tool that accepts a session parameter, ALWAYS include the session ID: ${sessionId}`;
    
    // Generate response using the orchestrator agent
    const llmResponse = await ai.generate({
      prompt: sessionPrompt,
      tools: [orchestratorAgent]
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

// Export dataset-related functions for server.ts to use
export const getAllDatasets = () => globalDatasetStore.getAllDatasets();
export const getDataset = (datasetId: string) => globalDatasetStore.getDataset(datasetId);
export const addDataset = (dataset: Dataset) => globalDatasetStore.addDataset(dataset);
export const updateDataset = (datasetId: string, updates: Partial<Dataset>) => globalDatasetStore.updateDataset(datasetId, updates);
export const deleteDataset = (datasetId: string) => globalDatasetStore.deleteDataset(datasetId);

// Export visualization-related functions for server.ts to use
export const getAllVisualizations = () => globalVisualizationStore.getAllVisualizations();
export const getVisualization = (vizId: string) => globalVisualizationStore.getVisualization(vizId);
export const getJobVisualizations = (jobId: string) => globalVisualizationStore.getJobVisualizations(jobId);
export const getDatasetVisualizations = (datasetId: string) => globalVisualizationStore.getDatasetVisualizations(datasetId);
export const addVisualization = (visualization: Visualization) => globalVisualizationStore.addVisualization(visualization);
export const updateVisualization = (vizId: string, updates: Partial<Visualization>) => globalVisualizationStore.updateVisualization(vizId, updates);
export const deleteVisualization = (vizId: string) => globalVisualizationStore.deleteVisualization(vizId);
export const deleteJobVisualizations = (jobId: string) => globalVisualizationStore.deleteJobVisualizations(jobId);
