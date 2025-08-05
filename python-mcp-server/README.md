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

1. Clone the repository:
   ```bash
   git clone https://github.com/d-callan/hyphy-mcp.git
   cd hyphy-mcp
   ```

2. Choose an installation method based on your needs:

   ### Development Installation (Editable Mode)
   Use this method if you're developing or modifying the code:
   ```bash
   # Create a virtual environment with Python 3.10+
   uv venv -p 3.10
   
   # Activate the virtual environment
   source .venv/bin/activate
   
   # Install hyphy-mcp in development mode with dependencies
   uv pip install -e .
   ```

   ### Production Installation (For uvx support)
   Use this method if you want to use uvx to start the server:
   ```bash
   # Create a virtual environment with Python 3.10+
   uv venv -p 3.10
   
   # Activate the virtual environment
   source .venv/bin/activate
   
   # Install hyphy-mcp normally (not in editable mode)
   uv pip install .
   ```

3. Alternative: Install using pip:
   ```bash
   pip install -e .  # For development
   # OR
   pip install .     # For production/uvx support
   ```

4. Configure the Datamonkey API connection (optional - defaults to localhost:9300):
   ```bash
   export DATAMONKEY_API_URL=http://localhost
   export DATAMONKEY_API_PORT=9300
   ```

## Usage

### Starting the Server

#### Option 1: Direct Python Execution (Recommended)

After installing with either method, make sure your virtual environment is activated:

```bash
# Activate the uv environment
source .venv/bin/activate

# Start the server with Python
python -m hyphy_mcp
```

This method works with both editable and non-editable installations and is the most reliable way to start the server.

#### Option 2: Using the Entry Point Script (Production)

After installing with the **Production Installation** method (non-editable mode), you can use the entry point script directly:

```bash
# Activate the uv environment
source .venv/bin/activate

# Install in non-editable mode if you haven't already
uv pip install .

# Start the server using the entry point script
hyphy-mcp
```

This method uses the entry point defined in pyproject.toml and is ideal for production use.

#### Option 3: Using MCP CLI Tools (For development)

```bash
# If you prefer conda instead of uv
conda create -n hyphy-mcp python=3.10
conda activate hyphy-mcp
pip install -e .

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
