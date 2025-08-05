# HyPhy Chat UI

A Svelte-based chat interface for interacting with the HyPhy MCP server through the Genkit client. This frontend provides a user-friendly way to request phylogenetic analyses using natural language.

## Overview

This Svelte application:

1. Provides a modern, responsive chat interface
2. Communicates with the Genkit client's REST API
3. Allows users to send natural language requests for HyPhy analyses
4. Displays responses and analysis results in a conversational format

## Developing

Once you've created a project and installed dependencies with `npm install` (or `pnpm install` or `yarn`), start a development server:

```sh
npm run dev

# or start the server and open the app in a new browser tab
npm run dev -- --open
```

## Building

To create a production version of your app:

```sh
npm run build
```

You can preview the production build with `npm run preview`.

> To deploy your app, you may need to install an [adapter](https://svelte.dev/docs/kit/adapters) for your target environment.
