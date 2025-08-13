import ai from './ai';
import { z } from 'genkit';
import { logger } from '@genkit-ai/core/logging';
import { globalVisualizationStore } from './visualizationStore';

// Define the Vega-Lite spec schema
const VegaSpecSchema = z.object({
  $schema: z.string(),
  description: z.string().optional(),
  data: z.any(),
  mark: z.any(),
  encoding: z.any(),
  // Additional optional Vega-Lite properties
  width: z.number().optional(),
  height: z.number().optional(),
  title: z.union([z.string(), z.object({}).passthrough()]).optional(),
  transform: z.array(z.object({}).passthrough()).optional(),
  config: z.object({}).passthrough().optional(),
  layer: z.array(z.object({}).passthrough()).optional(),
  facet: z.object({}).passthrough().optional(),
  repeat: z.object({}).passthrough().optional(),
  concat: z.array(z.object({}).passthrough()).optional(),
  hconcat: z.array(z.object({}).passthrough()).optional(),
  vconcat: z.array(z.object({}).passthrough()).optional(),
  resolve: z.object({}).passthrough().optional(),
  selection: z.object({}).passthrough().optional(),
  usermeta: z.object({}).passthrough().optional(),
});

// Input schema for the makeVegaSpec tool
const makeVegaSpecSchema = z.object({
  prompt: z.string().describe('Description of the plot to generate'),
  data: z.any().describe('Data to be visualized'),
  jobId: z.string().describe('Job ID to associate the visualization with'),
  title: z.string().optional().describe('Title for the visualization (defaults to prompt if not provided)'),
  description: z.string().optional().describe('Description for the visualization (defaults to prompt if not provided)'),
  datasetId: z.string().optional().describe('Dataset ID to associate the visualization with'),
  session: z.string().optional().describe('Session ID for tracking'),
});

// Define the makeVegaSpec tool
export const makeVegaSpec = ai.defineTool(
  {
    name: 'make_vega_spec',
    description: 'Generate a custom Vega-Lite JSON specification for data visualization based on a description',
    inputSchema: makeVegaSpecSchema,
    outputSchema: z.object({
      success: z.boolean(),
      library: z.string().optional(),
      spec: z.any().optional(),
      error: z.string().optional(),
    }),
  },
  async (input: z.infer<typeof makeVegaSpecSchema>) => {
    try {
      logger.info(`Generating Vega-Lite spec for prompt: ${input.prompt}`);
      
      // Generate the Vega-Lite spec using AI
      const response = await ai.generate({
        prompt: `
You are a Vega-Lite visualization expert.

The user asked for the following visualization: "${input.prompt}"

The dataset is:
${JSON.stringify(input.data, null, 2)}

Produce ONLY a VALID Vega-Lite JSON spec. Do not include explanations or markdown. 
Use "data": { "values": ... } inline to include the data directly in the spec.
Make sure the visualization is clear, informative, and follows data visualization best practices.
Include appropriate titles, labels, and legends.
Choose appropriate colors that work well together, are accessible, and enhance readability.
`,
      });

      // Parse and validate the spec
      let spec;
      try {
        // Extract JSON from the response text
        const jsonMatch = response.text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          throw new Error('No valid JSON found in the response');
        }
        
        const jsonText = jsonMatch[0];
        const parsedSpec = JSON.parse(jsonText);
        
        // Validate against schema
        spec = VegaSpecSchema.parse(parsedSpec);
        
        logger.info('Successfully generated and validated Vega-Lite spec');
        
        // Save the visualization to the global store
        const vizId = `viz_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
        const title = input.title || input.prompt.substring(0, 50);
        const description = input.description || input.prompt;
        
        const visualization = {
          vizId,
          jobId: input.jobId,
          datasetId: input.datasetId,
          type: 'vega-spec',
          title,
          description,
          component: 'VegaLiteVisualization',
          timestamp: Date.now(),
          data: spec,
          config: {
            prompt: input.prompt
          },
          metadata: {
            library: 'vega-lite',
            generatedBy: 'makeVegaSpec'
          }
        };
        
        const saved = globalVisualizationStore.addVisualization(visualization);
        
        if (!saved) {
          logger.error('Failed to save Vega-Lite visualization to store');
        } else {
          logger.info(`Saved Vega-Lite visualization ${vizId} to store`);
        }
        
        return {
          success: true,
          library: 'vega-lite',
          spec: spec,
          vizId: vizId
        };
      } catch (parseError) {
        logger.error('Error parsing or validating Vega-Lite spec:', parseError);
        return {
          success: false,
          error: `Invalid Vega-Lite spec: ${parseError instanceof Error ? parseError.message : String(parseError)}`
        };
      }
    } catch (error) {
      logger.error('Error generating Vega-Lite spec:', error);
      return {
        success: false,
        error: `Failed to generate Vega-Lite spec: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }
);

// Export all Vega tools
export const vegaTools = [
  makeVegaSpec
];

export default vegaTools;
