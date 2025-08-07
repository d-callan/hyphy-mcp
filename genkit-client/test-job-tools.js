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
  startOrMonitorMemeJob,
  startOrMonitorAbsrelJob,
  startOrMonitorBustedJob,
  startOrMonitorBgmJob,
  startOrMonitorContrastFelJob,
  startOrMonitorFadeJob,
  startOrMonitorFubarJob,
  startOrMonitorGardJob,
  startOrMonitorMultihitJob,
  startOrMonitorNrmJob,
  startOrMonitorRelaxJob,
  startOrMonitorSlacJob,
  startOrMonitorSlatkinJob,
  checkDatamonkeyJobStatus,
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
  jobFailed: {
    status: 'failed',
    jobId: 'test-job-id-456',
    error: 'Test error message',
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
    return Promise.resolve({ status: 200, data: {} });
  }),
  get: jest.fn().mockImplementation((url) => {
    if (url.includes('status')) {
      return Promise.resolve({ status: 200, data: mockResponses.jobStatus });
    }
    if (url.includes('result')) {
      return Promise.resolve({ status: 200, data: mockResponses.jobResults });
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
  console.log('Starting job tool tests...');

  // Prepare test input
  const alignmentContent = testConfig.runLiveTests ? readTestFile(testConfig.alignmentFile) : 'Mock alignment content';
  const treeContent = testConfig.runLiveTests ? readTestFile(testConfig.treeFile) : 'Mock tree content';

  if (!alignmentContent || !treeContent) {
    console.error('Test files not found or could not be read');
    return;
  }

  // Common input for all job tools
  const commonInput = {
    alignment_file: 'test.fasta',
    alignment_content: alignmentContent,
    tree_file: 'test.nwk',
    tree_content: treeContent,
    genetic_code: 'Universal',
  };

  // Test each job tool
  await testJobTool('startOrMonitorFelJob', startOrMonitorFelJob, commonInput);
  await testJobTool('startOrMonitorMemeJob', startOrMonitorMemeJob, commonInput);
  await testJobTool('startOrMonitorAbsrelJob', startOrMonitorAbsrelJob, commonInput);
  await testJobTool('startOrMonitorBustedJob', startOrMonitorBustedJob, commonInput);
  await testJobTool('startOrMonitorBgmJob', startOrMonitorBgmJob, commonInput);
  await testJobTool('startOrMonitorContrastFelJob', startOrMonitorContrastFelJob, commonInput);
  await testJobTool('startOrMonitorFadeJob', startOrMonitorFadeJob, commonInput);
  await testJobTool('startOrMonitorFubarJob', startOrMonitorFubarJob, commonInput);
  await testJobTool('startOrMonitorGardJob', startOrMonitorGardJob, commonInput);
  await testJobTool('startOrMonitorMultihitJob', startOrMonitorMultihitJob, commonInput);
  await testJobTool('startOrMonitorNrmJob', startOrMonitorNrmJob, commonInput);
  await testJobTool('startOrMonitorRelaxJob', startOrMonitorRelaxJob, commonInput);
  await testJobTool('startOrMonitorSlacJob', startOrMonitorSlacJob, commonInput);
  await testJobTool('startOrMonitorSlatkinJob', startOrMonitorSlatkinJob, commonInput);

  // Test job status and results
  await testJobTool('checkDatamonkeyJobStatus', checkDatamonkeyJobStatus, { job_id: 'test-job-id-123' });
  await testJobTool('fetchDatamonkeyJobResults', fetchDatamonkeyJobResults, { job_id: 'test-job-id-123', method: 'fel' });

  console.log('All tests completed');
}

// Run the tests
runTests().catch(console.error);
