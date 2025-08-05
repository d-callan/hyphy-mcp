# Genkit Client for HyPhy MCP

A Node.js backend that connects to the HyPhy MCP server using Genkit. This component provides a bridge between the HyPhy MCP server and the chat UI, allowing natural language processing of requests for phylogenetic analysis.

## Overview

This Genkit client:

1. Configures and initializes a Genkit instance with the selected AI model
2. Connects to the HyPhy MCP server to access its tools
3. Exposes a REST API for the frontend chat UI
4. Processes natural language requests using the configured AI model

## Prerequisites

- Node.js (v24.x or compatible version)
- npm (v10.x or compatible version)
- Access to a HyPhy API (local or remote)

## Configuration

The application uses environment variables for configuration. Copy `.env.example` to `.env` and adjust the settings:

```bash
# Model configuration
MODEL_NAME=gemini-2.5-flash
MODEL_TEMPERATURE=0.7

# Model provider selection
# Options: google, openai, anthropic, ollama, deepseek, local
MODEL_PROVIDER=google

# API Keys for different providers
GOOGLE_API_KEY=your_google_api_key_here
# OPENAI_API_KEY=your_openai_api_key_here
# ANTHROPIC_API_KEY=your_anthropic_api_key_here
# DEEPSEEK_API_KEY=your_deepseek_api_key_here

# Ollama configuration
# OLLAMA_URL=http://localhost:11434

# Server configuration
# SERVER_PORT=3000
# DEBUG_MODE=true
```

## Installation

1. Install backend dependencies:

```bash
cd genkit-client
npm install
```

2. Install frontend dependencies:

```bash
cd ../genkit-client-ui
npm install
```

## Development

To start both the backend server and frontend UI in development mode:

```bash
cd genkit-client
npm run dev
```

This will:
- Start the Express API server on port 3000 (or as configured in .env)
- Start the Svelte development server (typically on port 5173)
- Connect to the HyPhy MCP server

### Individual Components

If you want to start components individually:

- Backend API server only: `npm run dev:server`
- Original Genkit backend only: `npm run dev:backend`
- Frontend UI only: `npm run dev:ui`

## Building for Production

1. Build the backend:

```bash
cd genkit-client
npm run build
```

2. Build the frontend:

```bash
cd ../genkit-client-ui
npm run build
```

## Usage

1. Open the chat interface in your browser (typically at http://localhost:5173 during development)
2. Enter natural language requests to analyze FASTA files using HyPhy methods
3. The system will process your request and execute the appropriate HyPhy methods

## Available HyPhy Methods

The following methods are available through the MCP server:

- BUSTED (Branch-Site Unrestricted Statistical Test for Episodic Diversification)
- FEL (Fixed Effects Likelihood)
- MEME (Mixed Effects Model of Evolution)
- aBSREL (adaptive Branch-Site Random Effects Likelihood)
- BGM (Bayesian Graphical Model)
- Contrast-FEL
- FADE (FUBAR Approach to Directional Evolution)
- FUBAR (Fast Unconstrained Bayesian AppRoximation)
- GARD (Genetic Algorithm for Recombination Detection)
- MULTIHIT
- NRM (Nucleotide Rate Matrices)
- RELAX (Relaxation of Selection)
- SLAC (Single-Likelihood Ancestor Counting)
- Slatkin-Maddison test

## License

MIT
