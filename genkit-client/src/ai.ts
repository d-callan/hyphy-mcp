import { genkit } from 'genkit';
import { googleAI } from '@genkit-ai/googleai';
import { logger } from '@genkit-ai/core/logging';

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
  ],
  model: modelConfig,
});

// Set logging level (optional, useful for debugging)
logger.setLogLevel('debug');

// Export the configured AI instance
export default ai;
