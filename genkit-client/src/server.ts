import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { chatFlow, listSessions } from './index';
import { logger } from '@genkit-ai/core/logging';
import fs from 'fs';
import path from 'path';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.SERVER_PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

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

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
