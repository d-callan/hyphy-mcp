# HyPhy MCP Server

A Model Context Protocol (MCP) server that provides access to HyPhy's evolutionary analysis methods through the Datamonkey API. This server allows AI assistants and other MCP clients to run HyPhy analyses on FASTA sequence alignments without requiring a local HyPhy installation.

## Features

- Run HyPhy methods through a simple MCP interface via the Datamonkey API
- Currently supports three key methods:
  - **BUSTED**: Branch-Site Unrestricted Statistical Test for Episodic Diversification
  - **FEL**: Fixed Effects Likelihood for site-specific selection analysis
  - **MEME**: Mixed Effects Model of Evolution for detecting episodic selection
- Process cleaned FASTA files with optional tree files
- Get summarized results for easy interpretation
- No local HyPhy installation required - all analyses run on the Datamonkey API server

## Prerequisites

- Python 3.12+
- Requests library
- MCP server library
- Access to a running Datamonkey API server (defaults to localhost:9300)

## Installation

1. Clone this repository:
   ```bash
   git clone https://github.com/veg/hyphy-mcp.git
   cd hyphy-mcp
   ```

2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

3. Configure the Datamonkey API connection (optional - defaults to localhost:9300):
   ```bash
   export DATAMONKEY_API_URL=http://localhost
   export DATAMONKEY_API_PORT=9300
   ```

## Usage

### Starting the Server

#### Option 1: Using uvx (Preferred Method)

First, make sure hyphy-mcp is installed in your active Python environment:

```bash
# Install hyphy-mcp in development mode
cd /path/to/hyphy-mcp
pip install -e .
```

Then start the server with uvx:

```bash
uvx start hyphy-mcp
```

This is the preferred method for starting the server.

#### Option 2: Direct Python Execution

```bash
python3 -m hyphy_mcp
```

This will start the MCP server which can then be connected to compatible MCP clients like Claude Desktop.

#### Option 3: Using MCP CLI Tools (For development)

```bash
# Install dependencies in a conda environment with Python 3.12
conda create -n py312 python=3.12
conda activate py312
pip install -r requirements.txt

# Start the server using MCP dev tools
mcp dev hyphy-mcp/server.py

# When prompted with "Command:", type "hyphy-mcp" and press Enter/ click 'Connect'
```

### Available Tools

The server provides the following tools:

1. **get_available_methods**: List all available HyPhy analysis methods supported by the Datamonkey API
2. **upload_file_to_datamonkey**: Upload a file to the Datamonkey API server
3. **start_busted_job**: Start a BUSTED analysis job on the Datamonkey API
4. **start_fel_job**: Start a FEL analysis job on the Datamonkey API
5. **start_meme_job**: Start a MEME analysis job on the Datamonkey API
6. **check_datamonkey_job_status**: Check the status of a job on the Datamonkey API
7. **fetch_datamonkey_job_results**: Fetch the results of a completed job from the Datamonkey API

### Example Workflow

1. Connect to the server from an MCP client
2. Ensure the Datamonkey API is reachable using `get_available_methods`
3. Upload a FASTA alignment file using `upload_file_to_datamonkey`
4. Start an analysis job with the alignment file handle:
   - Use `start_busted_job`, `start_fel_job`, or `start_meme_job` depending on the analysis needed
   - These methods return a job ID from the Datamonkey API
5. Periodically check the job status using `check_datamonkey_job_status` with the job ID
6. Once the job is complete, fetch the results using `fetch_datamonkey_job_results` with the job ID
7. Interpret the results or save them to a file for further analysis

## Development

### Adding New Methods

To add support for additional HyPhy methods available in the Datamonkey API:

1. Check the Datamonkey API specification for the new method's endpoint and request format
2. Create a new tool function with the `@mcp.tool()` decorator that follows the pattern of existing methods
3. Add the method to the list returned by `get_available_methods`

### Testing

To test the integration with the Datamonkey API:

1. Ensure you have a running instance of the Datamonkey API service:
   ```bash
   # Clone and start the service-datamonkey repository
   git clone https://github.com/veg/service-datamonkey.git
   cd service-datamonkey
   make start
   ```

2. Set the environment variables to point to your local Datamonkey API:
   ```bash
   export DATAMONKEY_API_URL=http://localhost
   export DATAMONKEY_API_PORT=9300
   ```

3. Start the hyphy-mcp server and test the tools with sample alignment files

## License

MIT

## Acknowledgements

- [HyPhy](https://github.com/veg/hyphy) - Hypothesis testing using Phylogenies
- [Model Context Protocol](https://modelcontextprotocol.io/) - Protocol for AI tool integration
