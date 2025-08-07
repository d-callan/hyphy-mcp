const { GenKit } = require('genkit');
const path = require('path');
const fs = require('fs');

// Initialize GenKit
const genkit = new GenKit({
  apiKey: process.env.GENKIT_API_KEY || 'test-key',
});

// Import the tools
const { 
  startOrMonitorFelJob,
  fetchDatamonkeyJobResults
} = require('./dist');

// Test configuration
const testConfig = {
  // Set this to true to actually run the tests against the API
  runLiveTests: false,
  // Sample alignment and tree files for testing
  alignmentFile: path.join(__dirname, 'test', 'data', 'sample.fasta'),
  treeFile: path.join(__dirname, 'test', 'data', 'sample.nwk'),
};

// Mock API responses for testing without hitting the actual API
const mockResponses = {
  jobStart: {
    status: 'success',
    jobId: 'test-job-id-123',
  },
  jobStatus: {
    status: 'completed',
    jobId: 'test-job-id-123',
    progress: 100,
  },
  jobResults: {
    status: 'success',
    results: { test: 'data' },
  },
};

// Helper function to read test files
function readTestFile(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    console.error(`Error reading file ${filePath}: ${error.message}`);
    return null;
  }
}

// Mock the axios module
jest.mock('axios', () => ({
  post: jest.fn().mockImplementation((url) => {
    if (url.includes('-start')) {
      return Promise.resolve({ status: 200, data: mockResponses.jobStart });
    }
    if (url.includes('-result')) {
      return Promise.resolve({ status: 200, data: mockResponses.jobResults });
    }
    return Promise.resolve({ status: 200, data: {} });
  }),
  get: jest.fn().mockImplementation((url) => {
    if (url.includes('status')) {
      return Promise.resolve({ status: 200, data: mockResponses.jobStatus });
    }
    return Promise.resolve({ status: 200, data: {} });
  }),
}));

// Test function for job tools
async function testJobTool(toolName, tool, input) {
  console.log(`Testing ${toolName}...`);
  try {
    const result = await tool(input);
    console.log(`${toolName} result:`, result);
    return result;
  } catch (error) {
    console.error(`${toolName} error:`, error);
    return null;
  }
}

// Main test function
async function runTests() {
  console.log('Starting result fetching tests...');

  // Prepare test input
  const alignmentContent = testConfig.runLiveTests ? readTestFile(testConfig.alignmentFile) : 'Mock alignment content';
  const treeContent = testConfig.runLiveTests ? readTestFile(testConfig.treeFile) : 'Mock tree content';

  if (!alignmentContent || !treeContent) {
    console.error('Test files not found or could not be read');
    return;
  }

  // Test scenario 1: Start a job and then fetch results
  console.log('Test scenario 1: Start a job and then fetch results');
  
  // First start a job
  const jobInput = {
    alignment_file: 'test.fasta',
    alignment_content: alignmentContent,
    tree_file: 'test.nwk',
    tree_content: treeContent,
    genetic_code: 'Universal',
    session: { id: 'test-session-123' }
  };
  
  const jobResult = await testJobTool('startOrMonitorFelJob', startOrMonitorFelJob, jobInput);
  
  if (!jobResult || jobResult.status !== 'success') {
    console.error('Failed to start job');
    return;
  }
  
  // Then fetch results for the job
  const resultsInput = {
    job_id: jobResult.job_id,
    method: 'fel',
    session: { id: 'test-session-123' }
  };
  
  await testJobTool('fetchDatamonkeyJobResults', fetchDatamonkeyJobResults, resultsInput);
  
  console.log('All tests completed');
}

// Run the tests
runTests().catch(console.error);
