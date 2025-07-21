# HyPhy MCP Server

A Model Context Protocol (MCP) server that provides access to HyPhy's evolutionary analysis methods through a standardized interface. This server allows AI assistants and other MCP clients to run HyPhy analyses on FASTA sequence alignments.

## Features

- Run HyPhy methods through a simple MCP interface
- Currently supports three key methods:
  - **BUSTED**: Branch-Site Unrestricted Statistical Test for Episodic Diversification
  - **FEL**: Fixed Effects Likelihood for site-specific selection analysis
  - **MEME**: Mixed Effects Model of Evolution for detecting episodic selection
- Process cleaned FASTA files with optional tree files
- Get summarized results for easy interpretation

## Prerequisites

- Python 3.12+
- HyPhy installed at `/usr/local/bin/hyphy` (or specified via environment variable)
- Biopython
- MCP server library

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

3. Ensure HyPhy is installed and available in your PATH or set the `HYPHY_PATH` environment variable:
   ```bash
   export HYPHY_PATH=/path/to/hyphy
   ```

## Usage

### Starting the Server

#### Option 1: Direct Python Execution

```bash
python -m hyphy-mcp
```

This will start the MCP server which can then be connected to compatible MCP clients like Claude Desktop.

#### Option 2: Using MCP CLI Tools (Recommended for development)

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

1. **check_hyphy_installation**: Verify that HyPhy is properly installed
2. **get_available_methods**: List all available HyPhy analysis methods
3. **run_busted**: Run BUSTED analysis on an alignment (runs as a background job)
4. **run_fel**: Run FEL analysis on an alignment (runs as a background job)
5. **run_meme**: Run MEME analysis on an alignment (runs as a background job)
6. **check_job_status**: Check the status of a background job and retrieve results when complete

### Example Workflow

1. Connect to the server from an MCP client
2. Check if HyPhy is properly installed using `check_hyphy_installation`
3. Upload or provide path to a FASTA alignment file
4. Run an analysis method with the alignment file path
   - All HyPhy methods run as background jobs and return a job ID
5. Periodically check the job status using `check_job_status` with the job ID
6. Once the job is complete, retrieve and interpret the results

## Development

### Adding New Methods

To add support for additional HyPhy methods:

1. Update the `run_hyphy_method` function to handle the new method
2. Create a new tool function with the `@mcp.tool()` decorator
3. Add the method to the list returned by `get_available_methods`

### Testing

TBD

## License

MIT

## Acknowledgements

- [HyPhy](https://github.com/veg/hyphy) - Hypothesis testing using Phylogenies
- [Model Context Protocol](https://modelcontextprotocol.io/) - Protocol for AI tool integration
