import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { chatFlow } from './index';
import { logger } from '@genkit-ai/core/logging';

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
    const { message } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }
    
    logger.info(`Received message: ${message}`);
    
    // Process the message using the chatFlow from index.ts
    // chatFlow returns a string directly as per its outputSchema
    const response = await chatFlow({ message });
    
    return res.json({ response });
  } catch (error) {
    logger.error('Error processing chat request:', error);
    return res.status(500).json({ error: 'Failed to process chat request' });
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
