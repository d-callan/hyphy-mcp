# HyPhy MCP Full-Stack Application

A full-stack application for phylogenetic analysis using HyPhy methods through a natural language interface. This project combines a Node.js Genkit client with integrated HyPhy tools and a Svelte chat UI to enable AI-powered analysis of FASTA sequence alignments.

## Project Architecture

This repository contains two main components that work together:

1. **Genkit Client** (`/genkit-client`):
   - A Node.js backend with integrated HyPhy tools that communicate directly with the Datamonkey API
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

- [Genkit Client README](/genkit-client/README.md)
- [Svelte Chat UI README](/genkit-client-ui/README.md)

### Quick Start

#### Using the Makefile

```bash
# Install all components
make install

# Start the full stack
make start
```

#### Manual Setup

1. **Set up the Genkit Client**:
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

This will start both the Express API server and the Svelte UI development server.

## Features

- **Natural Language Interface**: Ask questions and request analyses in plain English
- **Multiple HyPhy Methods**: Support for BUSTED, FEL, MEME, aBSREL, BGM, FADE, FUBAR, GARD, MultiHit, NRM, RELAX, SLAC, Slatkin, and more
- **Direct Datamonkey API Integration**: No local HyPhy installation required
- **Configurable AI Models**: Support for Google AI, OpenAI, Anthropic, Ollama, and more
- **Modern UI**: Clean, responsive chat interface for easy interaction
- **Session Management**: Persistent conversation history between messages

## Development Workflow

### Using the Makefile

For development, you can run components separately or together:

```bash
# Start all components
make start

# Start only the Genkit API server
make start-api

# Start only the Svelte UI
make start-ui

# Start the development environment (API and UI)
make dev
```

### Using the Startup Script

```bash
# Start all components
./start.sh --mode all

# Start only the Genkit API server
./start.sh --mode api

# Start only the Svelte UI
./start.sh --mode ui

# Start the development environment
./start.sh --mode dev
```

### Manual Commands

You can also run each component separately using direct commands:

- **Genkit Client API**: `cd genkit-client && npm run dev:server`
- **Svelte UI**: `cd genkit-client-ui && npm run dev`

Or run the API and UI together with a single command:
```bash
cd genkit-client && npm run dev
```

## License

MIT
