# HyPhy MCP Full-Stack Application

A full-stack application for phylogenetic analysis using HyPhy methods through a natural language interface. This project combines a Python MCP server, a Node.js Genkit client, and a Svelte chat UI to enable AI-powered analysis of FASTA sequence alignments.

## Project Architecture

This repository contains three main components that work together:

1. **Python MCP Server** (`/python-mcp-server`): 
   - A Model Context Protocol server that exposes HyPhy's evolutionary analysis methods
   - Communicates with the Datamonkey API to run analyses without requiring a local HyPhy installation
   - Provides tools for processing FASTA files and interpreting results

2. **Genkit Client** (`/genkit-client`):
   - A Node.js backend that connects to the HyPhy MCP server
   - Configures and initializes a Genkit instance with the selected AI model
   - Exposes a REST API for the frontend chat UI
   - Processes natural language requests using the configured AI model

3. **Svelte Chat UI** (`/genkit-client-ui`):
   - A modern, responsive chat interface built with Svelte
   - Communicates with the Genkit client's REST API
   - Allows users to send natural language requests for HyPhy analyses
   - Displays responses and analysis results in a conversational format

## Getting Started

Each component has its own README with specific setup instructions:

- [Python MCP Server README](/python-mcp-server/README.md)
- [Genkit Client README](/genkit-client/README.md)
- [Svelte Chat UI README](/genkit-client-ui/README.md)

### Quick Start

1. **Set up the Python MCP Server**:
   ```bash
   cd python-mcp-server
   uv venv -p 3.10
   source .venv/bin/activate
   uv pip install -e .
   ```

2. **Set up the Genkit Client**:
   ```bash
   cd genkit-client
   npm install
   cp .env.example .env
   # Edit .env with your API keys and configuration
   ```

3. **Set up the Svelte Chat UI**:
   ```bash
   cd genkit-client-ui
   npm install
   ```

4. **Run the full stack**:
   ```bash
   # In the genkit-client directory
   npm run dev
   ```

This will start both the Express API server and the Svelte UI development server.

## Features

- **Natural Language Interface**: Ask questions and request analyses in plain English
- **Multiple HyPhy Methods**: Support for BUSTED, FEL, MEME, aBSREL, and more
- **API-Based Processing**: No local HyPhy installation required
- **Configurable AI Models**: Support for Google AI, OpenAI, Anthropic, Ollama, and more
- **Modern UI**: Clean, responsive chat interface for easy interaction

## Development Workflow

For development, you can run each component separately:

- **Python MCP Server**: `cd python-mcp-server && python -m hyphy_mcp`
- **Genkit Client API**: `cd genkit-client && npm run dev:server`
- **Svelte UI**: `cd genkit-client-ui && npm run dev`

Or run the full stack with a single command:
```bash
cd genkit-client && npm run dev
```

## License

MIT
