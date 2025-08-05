#!/bin/bash

# Script to start both the Python MCP server and Genkit client for development

# Colors for terminal output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${GREEN}Starting HyPhy MCP Monorepo Development Environment${NC}"
echo -e "${BLUE}=====================================================${NC}"

# Check if Python virtual environment exists for the server
if [ ! -d "./python-mcp-server/.venv" ]; then
    echo -e "${GREEN}Setting up Python virtual environment for MCP server...${NC}"
    cd python-mcp-server
    python -m venv .venv
    source .venv/bin/activate
    pip install -r requirements.txt
    cd ..
else
    echo -e "${GREEN}Python virtual environment already exists.${NC}"
fi

# Check if Node.js dependencies are installed for the client
if [ ! -d "./genkit-client/node_modules" ]; then
    echo -e "${GREEN}Installing Node.js dependencies for Genkit client...${NC}"
    cd genkit-client
    npm install
    cd ..
else
    echo -e "${GREEN}Node.js dependencies already installed.${NC}"
fi

# Set environment variables for Datamonkey API
export DATAMONKEY_API_URL=${DATAMONKEY_API_URL:-http://localhost}
export DATAMONKEY_API_PORT=${DATAMONKEY_API_PORT:-9300}

echo -e "${GREEN}Starting Genkit client...${NC}"
echo -e "${BLUE}This will automatically start the Python MCP server as well.${NC}"
echo -e "${BLUE}Open your browser to http://localhost:3000 to access the chat interface.${NC}"

# Start the Genkit client (which will also start the Python MCP server)
cd genkit-client
npm run dev
