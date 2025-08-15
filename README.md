# HyPhy Full-Stack Agentic Web Application

A full-stack application for phylogenetic analysis using HyPhy methods through a natural language interface. This project combines a Node.js Genkit client with integrated HyPhy tools and a Svelte chat UI to enable AI-powered analysis of FASTA sequence alignments.

I call him MonkeyBot.

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
# Install all components (this will also create .env file from .env.example)
make install

# Edit the .env file with your API key and LLM provider settings
vim genkit-client/.env  # or use your preferred editor

# Start the full stack
make start
```

> **IMPORTANT**: After installation, you must edit the `genkit-client/.env` file with your own API key and LLM provider settings. The `make install` command includes the `setup-env` target which automatically creates the .env file from the example if it doesn't exist, but you still need to add your credentials.

#### Manual Setup

1. **Set up the Genkit Client**:
   ```bash
   cd genkit-client
   npm install
   cp .env.example .env
   # Edit .env with your API key and LLM provider configuration
   ```
   
   > **IMPORTANT**: You must copy `.env.example` to `.env` and provide your own API key and LLM provider settings in the `.env` file. The application will not work without these credentials.

3. **Set up the Svelte Chat UI**:
   ```bash
   cd genkit-client-ui
   npm install
   ```

This will start both the Express API server and the Svelte UI development server.

> **ACCESS THE APPLICATION**: Once started, access the application at [http://localhost:5173](http://localhost:5173) unless you've changed the default ports in your configuration.

## Accessing the Application

After starting the application:

- The Svelte UI is available at: [http://localhost:5173](http://localhost:5173)
- The Genkit API server runs at: [http://localhost:3000](http://localhost:3000)

If you've modified the default ports in your configuration, use your custom ports instead.

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
