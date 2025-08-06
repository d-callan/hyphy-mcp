# HyPhy MCP Full-Stack Application Makefile

# Default paths
GENKIT_CLIENT_DIR = genkit-client
GENKIT_UI_DIR = genkit-client-ui

# Default port for the API server
SERVER_PORT ?= 3000

# Default Datamonkey API settings
DATAMONKEY_API_URL ?= http://localhost
DATAMONKEY_API_PORT ?= 9300

.PHONY: help install install-node install-ui setup-env \
        start start-api start-ui dev clean

help:
	@echo "HyPhy MCP Full-Stack Application"
	@echo ""
	@echo "Available commands:"
	@echo "  make install          - Install all components (Genkit client and UI)"
	@echo "  make install-node     - Install only the Genkit client"
	@echo "  make install-ui       - Install only the Svelte UI"
	@echo "  make setup-env        - Set up environment files"
	@echo "  make start            - Start the full stack (API and UI)"
	@echo "  make start-api        - Start only the Genkit API server"
	@echo "  make start-ui         - Start only the Svelte UI"
	@echo "  make dev              - Start the development environment (API and UI)"
	@echo "  make clean            - Clean up temporary files and directories"
	@echo ""
	@echo "Environment variables:"
	@echo "  SERVER_PORT           - Port for the API server (default: 3000)"

# Installation targets
install: install-node install-ui setup-env

install-node:
	@echo "Installing Genkit client..."
	cd $(GENKIT_CLIENT_DIR) && npm install
	@echo "Genkit client installed successfully."

install-ui:
	@echo "Installing Svelte UI..."
	cd $(GENKIT_UI_DIR) && npm install
	@echo "Svelte UI installed successfully."

setup-env:
	@echo "Setting up environment files..."
	@if [ ! -f "$(GENKIT_CLIENT_DIR)/.env" ]; then \
		cp $(GENKIT_CLIENT_DIR)/.env.example $(GENKIT_CLIENT_DIR)/.env; \
		echo "Created $(GENKIT_CLIENT_DIR)/.env from example file. Please edit with your API keys."; \
	else \
		echo "$(GENKIT_CLIENT_DIR)/.env already exists."; \
	fi

# Start targets
start: start-api start-ui

start-api:
	@echo "Starting Genkit API server..."
	cd $(GENKIT_CLIENT_DIR) && \
	SERVER_PORT=$(SERVER_PORT) npm run dev:server &
	@echo "Genkit API server started on port $(SERVER_PORT)."

start-ui:
	@echo "Starting Svelte UI..."
	cd $(GENKIT_UI_DIR) && npm run dev &
	@echo "Svelte UI started."

# Development target (API + UI)
dev:
	@echo "Starting development environment..."
	@echo "Setting up environment variables for Datamonkey API..."
	@echo "DATAMONKEY_API_URL=$(DATAMONKEY_API_URL)"
	@echo "DATAMONKEY_API_PORT=$(DATAMONKEY_API_PORT)"
	@echo "Open your browser to http://localhost:$(SERVER_PORT) to access the chat interface."
	cd $(GENKIT_CLIENT_DIR) && \
	DATAMONKEY_API_URL=$(DATAMONKEY_API_URL) \
	DATAMONKEY_API_PORT=$(DATAMONKEY_API_PORT) \
	SERVER_PORT=$(SERVER_PORT) \
	npm run dev

# Clean target
clean:
	@echo "Cleaning up..."
	find . -name "*.pyc" -delete
	find . -name "__pycache__" -type d -exec rm -rf {} +
	find . -name "*.egg-info" -type d -exec rm -rf {} +
	find . -name "dist" -type d -exec rm -rf {} +
	find . -name "build" -type d -exec rm -rf {} +
	find . -name "node_modules" -type d -exec rm -rf {} +
	@echo "Clean up complete."
