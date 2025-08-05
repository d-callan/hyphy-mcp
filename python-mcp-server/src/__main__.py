"""Command-line entry point for HyPhy MCP server."""

import logging
import os
import sys
import traceback

from . import server

# Create a log directory if it doesn't exist
log_dir = "/tmp/hyphy_mcp_logs"
os.makedirs(log_dir, exist_ok=True)
log_file = os.path.join(log_dir, "hyphy_mcp_debug.log")

# Configure detailed logging to both file and stderr
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler(log_file, mode='w'),
        logging.StreamHandler(sys.stderr)
    ]
)
logger = logging.getLogger(__name__)

# Write initial log entry to ensure file is created
with open(log_file, 'w') as f:
    f.write(f"Starting HyPhy MCP server log at {os.path.abspath(log_file)}\n")

def run():
    """Run the MCP server."""
    try:
        logger.debug("Starting HyPhy MCP server")
        
        # Log Python version and environment info
        logger.debug(f"Python version: {sys.version}")
        logger.debug(f"Current directory: {os.getcwd()}")
        logger.debug(f"PYTHONPATH: {sys.path}")
        
        # Check Datamonkey API connection
        logger.debug("Checking Datamonkey API connection")
        logger.debug(f"Datamonkey API URL: {server.datamonkey_state['api_url']}:{server.datamonkey_state['api_port']}")
        # No need to verify connection here as it will be checked when needed
        
        # Use the FastMCP's built-in run method (same as galaxy-mcp)
        logger.debug("Initializing MCP server")
        logger.debug("Starting server.mcp.run()")
        server.mcp.run()
    except Exception as e:
        logger.error(f"Error running HyPhy MCP server: {e}")
        traceback.print_exc(file=open(log_file, 'a'))
        with open(log_file, 'a') as f:
            f.write(f"Error running HyPhy MCP server: {e}\n")
            traceback.print_exc(file=f)
        sys.exit(1)


if __name__ == "__main__":
    with open(log_file, 'a') as f:
        f.write("__main__ block entered\n")
    run()
