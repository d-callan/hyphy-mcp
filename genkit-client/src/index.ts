import { genkit, z } from 'genkit';
import { googleAI } from '@genkit-ai/googleai';
import { mcpClient } from 'genkitx-mcp';
import { logger } from '@genkit-ai/core/logging';


// Configure Genkit and plugins centrally
const ai = genkit({
  plugins: [
    // Configure your model provider
    googleAI(),
    // Configure the MCP client to connect to your Python server
    mcpClient({
      name: 'datamonkey',
      serverProcess: {
        command: 'bash',
        args: [
          'source ./python-mcp-server/venv/bin/activate && hyphy-mcp',
        ],
      },
    }),
  ],
  model: googleAI.model('gemini-2.5-flash', {
    temperature: 0.7,
  }),
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
      prompt: `User says: "${input.message}". Based on this, consider if you need to use any available tools from 'myLocalMcpServer' to generate a response. Respond in a helpful and informative manner.`,
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
