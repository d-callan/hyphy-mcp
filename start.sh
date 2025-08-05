#!/bin/bash

# HyPhy MCP Full-Stack Application Startup Script

# Default settings
PYTHON_VERSION="3.10"
SERVER_PORT="3000"
MODE="all"  # Options: all, mcp, api, ui, dev

# Parse command line arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --python-version)
      PYTHON_VERSION="$2"
      shift 2
      ;;
    --server-port)
      SERVER_PORT="$2"
      shift 2
      ;;
    --mode)
      MODE="$2"
      shift 2
      ;;
    --help)
      echo "HyPhy MCP Full-Stack Application Startup Script"
      echo ""
      echo "Usage: ./start.sh [options]"
      echo ""
      echo "Options:"
      echo "  --python-version VERSION  Python version to use (default: 3.10)"
      echo "  --server-port PORT        Port for the API server (default: 3000)"
      echo "  --mode MODE               Startup mode (default: all)"
      echo "                            Available modes: all, mcp, api, ui, dev"
      echo "  --help                    Show this help message"
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      echo "Use --help for usage information"
      exit 1
      ;;
  esac
done

# Directories
PYTHON_MCP_SERVER_DIR="python-mcp-server"
GENKIT_CLIENT_DIR="genkit-client"
GENKIT_UI_DIR="genkit-client-ui"

# Function to check if a component is installed
check_installation() {
  local component=$1
  local dir=$2
  
  echo "Checking $component installation..."
  
  case $component in
    python)
      if [ ! -d "$dir/.venv" ]; then
        echo "$component is not installed. Installing..."
        cd $dir && \
        uv venv -p $PYTHON_VERSION && \
        . .venv/bin/activate && \
        uv pip install -e .
        cd ..
      else
        echo "$component is already installed."
      fi
      ;;
    node)
      if [ ! -d "$dir/node_modules" ]; then
        echo "$component is not installed. Installing..."
        cd $dir && npm install
        cd ..
      else
        echo "$component is already installed."
      fi
      ;;
  esac
}

# Function to set up environment files
setup_env() {
  if [ ! -f "$GENKIT_CLIENT_DIR/.env" ]; then
    echo "Setting up environment files..."
    cp $GENKIT_CLIENT_DIR/.env.example $GENKIT_CLIENT_DIR/.env
    echo "Created $GENKIT_CLIENT_DIR/.env from example file. Please edit with your API keys."
  fi
}

# Check installations based on mode
case $MODE in
  all|mcp|dev)
    check_installation "python" $PYTHON_MCP_SERVER_DIR
    ;;
esac

case $MODE in
  all|api|ui|dev)
    check_installation "node" $GENKIT_CLIENT_DIR
    ;;
esac

case $MODE in
  all|ui|dev)
    check_installation "node" $GENKIT_UI_DIR
    ;;
esac

# Set up environment files
setup_env

# Start components based on mode
case $MODE in
  all)
    echo "Starting all components..."
    
    # Start Python MCP server
    cd $PYTHON_MCP_SERVER_DIR && \
    . .venv/bin/activate && \
    python -m hyphy_mcp &
    MCP_PID=$!
    cd ..
    
    # Start Genkit API server
    cd $GENKIT_CLIENT_DIR && \
    SERVER_PORT=$SERVER_PORT npm run dev:server &
    API_PID=$!
    cd ..
    
    # Start Svelte UI
    cd $GENKIT_UI_DIR && \
    npm run dev &
    UI_PID=$!
    cd ..
    
    echo "All components started."
    echo "MCP server PID: $MCP_PID"
    echo "API server PID: $API_PID"
    echo "UI server PID: $UI_PID"
    echo "Press Ctrl+C to stop all components."
    
    # Wait for any process to exit
    wait -n
    ;;
    
  mcp)
    echo "Starting Python MCP server..."
    cd $PYTHON_MCP_SERVER_DIR && \
    . .venv/bin/activate && \
    python -m hyphy_mcp
    ;;
    
  api)
    echo "Starting Genkit API server..."
    cd $GENKIT_CLIENT_DIR && \
    SERVER_PORT=$SERVER_PORT npm run dev:server
    ;;
    
  ui)
    echo "Starting Svelte UI..."
    cd $GENKIT_UI_DIR && \
    npm run dev
    ;;
    
  dev)
    echo "Starting development environment..."
    cd $GENKIT_CLIENT_DIR && \
    npm run dev
    ;;
    
  *)
    echo "Unknown mode: $MODE"
    echo "Available modes: all, mcp, api, ui, dev"
    exit 1
    ;;
esac
