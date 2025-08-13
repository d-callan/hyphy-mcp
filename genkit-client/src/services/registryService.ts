// Import logger from the correct package
import { logger } from '@genkit-ai/core/logging';

// Define enum for VisualizationOutputType to match hyphy-eye's enum
enum VisualizationOutputType {
  DOM_ELEMENT = 'dom_element',
  SVG = 'svg',
  PNG = 'png',
  JSON = 'json',
  HTML = 'html',
  TEXT = 'text'
}

// Define interfaces for our service
interface VisualizationCategory {
  id: string;
  name: string;
  description: string;
}

interface Visualization {
  name: string;
  description: string;
  component: string;
  glyph: string;
  options?: Record<string, any>;
  category: string;
  outputType: VisualizationOutputType;
}

interface HyPhyMethod {
  name: string;
  visualizations: Visualization[];
}

// Initialize with mock data
// This will be used until the dynamic import completes
let VisualizationCategories: Record<string, VisualizationCategory> = {
  summary: {
    id: 'summary',
    name: 'Summary Views',
    description: 'Overview visualizations that summarize key results'
  },
  model: {
    id: 'model',
    name: 'Model Summaries',
    description: 'Visualizations that show model parameters and fit'
  },
  codon: {
    id: 'codon',
    name: 'Codon Summaries',
    description: 'Visualizations focused on individual codon-level results'
  },
  tree: {
    id: 'tree',
    name: 'Tree Visualizations',
    description: 'Phylogenetic tree visualizations with result annotations'
  }
};

let HyPhyMethods: Record<string, HyPhyMethod> = {
  SLAC: {
    name: 'SLAC',
    visualizations: [
      {
        name: 'Summary',
        description: 'Overview of SLAC results',
        component: 'TileTable',
        glyph: 'table',
        category: 'summary',
        outputType: VisualizationOutputType.DOM_ELEMENT
      },
      {
        name: 'Site Results',
        description: 'Per-site SLAC results',
        component: 'BeadPlot',
        glyph: 'chart-bar',
        category: 'codon',
        outputType: VisualizationOutputType.DOM_ELEMENT
      }
    ]
  },
  FEL: {
    name: 'FEL',
    visualizations: [
      {
        name: 'Summary',
        description: 'Overview of FEL results',
        component: 'TileTable',
        glyph: 'table',
        category: 'summary',
        outputType: VisualizationOutputType.DOM_ELEMENT
      },
      {
        name: 'Site Results',
        description: 'Per-site FEL results',
        component: 'BeadPlot',
        glyph: 'chart-bar',
        category: 'codon',
        outputType: VisualizationOutputType.DOM_ELEMENT
      },
      {
        name: 'Rate Ratios',
        description: 'FEL dN/dS ratios',
        component: 'FelRatioPlot',
        glyph: 'chart-scatter',
        category: 'codon',
        outputType: VisualizationOutputType.DOM_ELEMENT
      }
    ]
  },
  MEME: {
    name: 'MEME',
    visualizations: [
      {
        name: 'Summary',
        description: 'Overview of MEME results',
        component: 'TileTable',
        glyph: 'table',
        category: 'summary',
        outputType: VisualizationOutputType.DOM_ELEMENT
      },
      {
        name: 'Site Results',
        description: 'Per-site MEME results',
        component: 'BeadPlot',
        glyph: 'chart-bar',
        category: 'codon',
        outputType: VisualizationOutputType.DOM_ELEMENT
      },
      {
        name: 'P-values',
        description: 'MEME p-values distribution',
        component: 'MemePvaluesPlot',
        glyph: 'chart-scatter',
        category: 'codon',
        outputType: VisualizationOutputType.DOM_ELEMENT
      }
    ]
  },
  BUSTED: {
    name: 'BUSTED',
    visualizations: [
      {
        name: 'Summary',
        description: 'Overview of BUSTED results',
        component: 'TileTable',
        glyph: 'table',
        category: 'summary',
        outputType: VisualizationOutputType.DOM_ELEMENT
      }
    ]
  }
};

let registryLoaded = false;

// Function to dynamically load the registry
async function loadRegistry() {
  try {
    // Use dynamic import for ESM compatibility
    const registry = await import('@veg/hyphy-eye/registry');
    
    // Extract the registry data
    const HyPhyEyeCategories = registry.VisualizationCategories;
    const ImportedHyPhyMethods = registry.HyPhyMethods;
    
    // Process categories
    VisualizationCategories = Object.entries(HyPhyEyeCategories).reduce((acc, [key, value]: [string, any]) => {
      acc[key] = {
        id: value.id,
        name: value.name,
        description: value.description
      };
      return acc;
    }, {} as Record<string, VisualizationCategory>);

    // Process methods
    HyPhyMethods = Object.entries(ImportedHyPhyMethods).reduce((acc, [key, value]: [string, any]) => {
      acc[key] = {
        name: value.name,
        visualizations: value.visualizations.map((viz: any) => ({
          name: viz.name,
          description: viz.description,
          component: viz.component,
          glyph: viz.glyph,
          options: viz.options,
          category: viz.category,
          outputType: viz.outputType
        }))
      };
      return acc;
    }, {} as Record<string, HyPhyMethod>);

    registryLoaded = true;
    logger.info('Successfully loaded hyphy-eye registry data');
    return true;
  } catch (error) {
    logger.error('Error loading hyphy-eye registry:', error);
    return false;
  }
}

// Service functions to get registry data
export async function getVisualizationCategories(): Promise<Record<string, VisualizationCategory>> {
  // Try to load registry if not already loaded
  if (!registryLoaded) {
    await loadRegistry();
  }
  return VisualizationCategories;
}

export async function getHyPhyMethods(): Promise<Record<string, HyPhyMethod>> {
  // Try to load registry if not already loaded
  if (!registryLoaded) {
    await loadRegistry();
  }
  return HyPhyMethods;
}

export async function getVisualizationsForMethod(methodName: string): Promise<Visualization[]> {
  // Try to load registry if not already loaded
  if (!registryLoaded) {
    await loadRegistry();
  }
  
  const method = HyPhyMethods[methodName];
  if (!method) {
    logger.warn(`Method ${methodName} not found in registry`);
    return [];
  }
  
  return method.visualizations;
}

// Initialize registry on module load
loadRegistry().catch(error => {
  logger.error('Failed to load hyphy-eye registry on initialization', error);
});

/**
 * Service for accessing hyphy-eye registry information
 */
class RegistryService {
  /**
   * Get all available HyPhy methods with their visualizations
   */
  async getAllMethods() {
    try {
      return await getHyPhyMethods();
    } catch (error) {
      logger.error('Error getting HyPhy methods:', error);
      return {};
    }
  }

  /**
   * Get available visualizations for a specific HyPhy method
   * @param method The HyPhy method name (e.g., 'BUSTED', 'FEL', 'MEME')
   */
  getMethodVisualizations(method: string) {
    try {
      if (!method || !HyPhyMethods[method]) {
        return [];
      }
      
      return HyPhyMethods[method].visualizations || [];
    } catch (error) {
      logger.error(`Error getting visualizations for method ${method}:`, error);
      return [];
    }
  }

  /**
   * Get all visualization categories
   */
  getCategories() {
    try {
      return VisualizationCategories;
    } catch (error) {
      logger.error('Error getting visualization categories:', error);
      return {};
    }
  }

  /**
   * Check if a method exists in the registry
   * @param method The HyPhy method name
   */
  methodExists(method: string): boolean {
    return !!HyPhyMethods[method];
  }

  /**
   * Check if a visualization component exists for a method
   * @param method The HyPhy method name
   * @param component The visualization component name
   */
  visualizationExists(method: string, component: string): boolean {
    if (!this.methodExists(method)) {
      return false;
    }
    
    const visualizations = HyPhyMethods[method].visualizations || [];
    return visualizations.some(viz => viz.component === component);
  }
}

export default new RegistryService();
