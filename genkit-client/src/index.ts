import { genkit, z } from 'genkit';
import { googleAI } from '@genkit-ai/googleai';
import { mcpClient } from 'genkitx-mcp';
import { logger } from '@genkit-ai/core/logging';
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

// Imports for other providers based on installed packages
import { anthropic, claude35Sonnet, claude35Haiku, claude37Sonnet, claude3Haiku, claude3Opus, claude3Sonnet, claude4Opus, claude4Sonnet } from 'genkitx-anthropic';
import { ollama } from 'genkitx-ollama';
import { openAI } from '@genkit-ai/compat-oai/openai';
import { deepSeek } from '@genkit-ai/compat-oai/deepseek';


// Helper function to configure the model based on environment variables
export function configureModel() {
  const provider = process.env.MODEL_PROVIDER || 'google';
  const modelName = process.env.MODEL_NAME || 'gemini-2.5-flash';
  const temperature = parseFloat(process.env.MODEL_TEMPERATURE || '0.7');
  
  switch(provider.toLowerCase()) {
    case 'google':
      // Configure Google AI with API key if provided
      if (process.env.GOOGLE_API_KEY) {
        return googleAI.model(modelName, {
          temperature,
          apiKey: process.env.GOOGLE_API_KEY,
        });
      } else {
        return googleAI.model(modelName, { temperature });
      }
    
    case 'openai':
      if (!process.env.OPENAI_API_KEY) {
        throw new Error('OPENAI_API_KEY is required when using OpenAI provider');
      }
      return openAI.model(modelName, {
        temperature,
        apiKey: process.env.OPENAI_API_KEY,
      });
    
    case 'anthropic':
      if (!process.env.ANTHROPIC_API_KEY) {
        throw new Error('ANTHROPIC_API_KEY is required when using Anthropic provider');
      }
      // Anthropic requires using specific model references directly
      // Apply temperature through Genkit's model options
      const modelOptions = { temperature };
      
      switch(modelName) {
        case 'claude-3-5-sonnet':
          return claude35Sonnet;
        case 'claude-3-5-haiku':
          return claude35Haiku;
        case 'claude-3-7-sonnet':
          return claude37Sonnet;
        case 'claude-3-haiku':
          return claude3Haiku;
        case 'claude-3-opus':
          return claude3Opus;
        case 'claude-3-sonnet':
          return claude3Sonnet;
        case 'claude-4-opus':
          return claude4Opus;
        case 'claude-4-sonnet':
          return claude4Sonnet;
        default:
          logger.warn(`Unknown Anthropic model '${modelName}', falling back to claude-3-5-sonnet`);
          return claude35Sonnet;
      }
    
    case 'ollama':
      const ollamaUrl = process.env.OLLAMA_URL || 'http://localhost:11434';
      return ollama.model(modelName, {
        temperature,
        baseURL: ollamaUrl,
      });

    case 'deepseek':
      if (!process.env.DEEPSEEK_API_KEY) {
        throw new Error('DEEPSEEK_API_KEY is required when using DeepSeek provider');
      }
      return deepSeek.model(modelName, {
        temperature,
        apiKey: process.env.DEEPSEEK_API_KEY,
      });
    
    default:
      logger.warn(`Unknown provider '${provider}', falling back to Google AI`);
      return googleAI.model(modelName, { temperature });
  }
}

// Helper function to configure model provider plugins
function configureProviderPlugins() {
  const provider = process.env.MODEL_PROVIDER || 'google';
  
  switch(provider.toLowerCase()) {
    case 'google':
      return googleAI(process.env.GOOGLE_API_KEY ? { apiKey: process.env.GOOGLE_API_KEY } : undefined);
    
    case 'openai':
      if (!process.env.OPENAI_API_KEY) {
        throw new Error('OPENAI_API_KEY is required when using OpenAI provider');
      }
      return openAI({ apiKey: process.env.OPENAI_API_KEY });
    
    case 'anthropic':
      if (!process.env.ANTHROPIC_API_KEY) {
        throw new Error('ANTHROPIC_API_KEY is required when using Anthropic provider');
      }
      return anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    
    case 'ollama':
      const ollamaUrl = process.env.OLLAMA_URL || 'http://localhost:11434';
      return ollama({ serverAddress: ollamaUrl });
    
    case 'deepseek':
      if (!process.env.DEEPSEEK_API_KEY) {
        throw new Error('DEEPSEEK_API_KEY is required when using DeepSeek provider');
      }
      return deepSeek({ apiKey: process.env.DEEPSEEK_API_KEY });
    
    default:
      logger.warn(`Unknown provider '${provider}', falling back to Google AI`);
      return googleAI();
  }
}

// Get model configuration
const modelConfig = (() => {
  try {
    return configureModel();
  } catch (error: any) { // Type assertion for error
    logger.error(`Error configuring model: ${error?.message || 'Unknown error'}`);
    logger.warn('Falling back to default Google AI model');
    return googleAI.model('gemini-2.5-flash', { temperature: 0.7 });
  }
})();

// Configure Genkit and plugins centrally
const ai = genkit({
  plugins: [
    // Configure your model provider based on environment variables
    configureProviderPlugins(),
    // Configure the MCP client to connect to your Python server
    mcpClient({
      name: 'datamonkey',
      serverProcess: {
        command: 'bash',
        args: [
          '-c', 'source ../python-mcp-server/.venv/bin/activate && python -m hyphy_mcp',
        ],
      },
    }),
  ],
  model: modelConfig,
  // You can register your flows here, but importing them and ensuring they
  // are defined is often enough, especially for simpler setups.
  // resources: {
  //   flows: { chatFlow },
  // },
});

// Set logging level (optional, useful for debugging)
logger.setLogLevel('debug');

const datamonkeyTools = ["get_available_methods",
    "upload_file_to_datamonkey",
    "start_busted_job",
    "start_fel_job",
    "start_meme_job",
    "start_absrel_job",
    "start_bgm_job",
    "start_contrast_fel_job",
    "start_fade_job",
    "start_fubar_job",
    "start_gard_job",
    "start_multihit_job",
    "start_nrm_job",
    "start_relax_job",
    "start_slac_job",
    "start_slatkin_job",
    "check_datamonkey_job_status",
    "fetch_datamonkey_job_results"
]

/**
 * Defines a simple chat flow that interacts with the MCP server.
 * This flow takes a user message, potentially uses an LLM to process it,
 * and can interact with tools exposed by the configured MCP client.
 */
export const chatFlow = ai.defineFlow(
  {
    name: 'chatFlow',
    inputSchema: z.object({
      message: z.string().describe('User message for the AI'), // Input schema using Zod
    }),
    outputSchema: z.string().describe('AI response from chat'), // Output schema
  },
  async (input) => {
    // Log the incoming message for debugging
    logger.debug(`[chatFlow] Received message: ${input.message}`);

    // Access the 'genkit' instance configured in index.ts.
    // This allows using models and tools defined in the main configuration.

    // Example: Use a model (like Gemini) to process the message and potentially
    // decide which MCP tool to call.
    // It's important that 'myLocalMcpServer' and 'gemini-2.0-flash' are configured
    // in the main genkit({...}) call in index.ts for these to be available.
    const llmResponse = await ai.generate({
      prompt: `User says: "${input.message}". Based on this, consider if you need to use any available tools from 'datamonkey' to generate a response. Respond in a helpful and informative manner.`,
      // You can specify which tools are available for the LLM to suggest using
      tools: datamonkeyTools
    });

    const responseText = llmResponse.text;

    logger.debug(`[chatFlow] AI Response: ${responseText}`);
    return responseText;
  },
);


// When you run `npm run dev` (which uses `genkit start -- tsx --watch src/index.ts`),
// Genkit's Developer UI will automatically discover and expose the `chatFlow`
// because it's imported and exported (or just imported if Genkit's autodiscovery is sufficient).
