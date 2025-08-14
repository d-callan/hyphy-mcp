<script lang="ts">
  import { onMount } from 'svelte';
  import { createEventDispatcher } from 'svelte';

  // Define session interface
  interface SessionInfo {
    id: string;
    created: number;
    updated: number;
  }

  // Props
  export let activeSessionId: string | null = null;

  // Local state
  let sessions: SessionInfo[] = [];
  let loading = true;
  let error: string | null = null;

  // Event dispatcher
  const dispatch = createEventDispatcher();

  // API endpoint
  const SESSIONS_URL = 'http://localhost:3000/api/sessions';

  // Format timestamp to readable date
  function formatDate(timestamp: number): string {
    return new Date(timestamp).toLocaleString();
  }

  // Format session ID for display (remove prefix and hash)
  function formatSessionId(id: string): string {
    // Session IDs are in format: session-{timestamp}-{random}
    const parts = id.split('-');
    if (parts.length >= 2) {
      return `Session ${new Date(parseInt(parts[1])).toLocaleString()}`;
    }
    return id;
  }

  // Load sessions from API
  async function loadSessions() {
    try {
      loading = true;
      error = null;
      
      const response = await fetch(SESSIONS_URL);
      
      if (!response.ok) {
        throw new Error(`Error: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data.success) {
        sessions = data.sessions;
        // Sort sessions by creation time (newest first)
        sessions.sort((a, b) => b.created - a.created);
      } else {
        throw new Error(data.error || 'Unknown error');
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      error = `Failed to load sessions: ${errorMessage}`;
      console.error('Error loading sessions:', err);
    } finally {
      loading = false;
    }
  }

  // Handle session selection
  function selectSession(sessionId: string) {
    dispatch('select', { sessionId });
  }

  // Create new session
  function createNewSession() {
    dispatch('new');
  }

  // Load sessions on mount
  onMount(() => {
    loadSessions();
  });
</script>

<div class="session-sidebar">
  <div class="sidebar-header">
    <h3>Chat Sessions</h3>
    <button class="refresh-button" on:click={loadSessions} disabled={loading}>
      {#if loading}
        Loading...
      {:else}
        ↻
      {/if}
    </button>
  </div>

  <button class="new-session-button" on:click={createNewSession}>
    + New Chat
  </button>

  {#if error}
    <div class="error-message">
      {error}
    </div>
  {/if}

  <div class="sessions-list">
    {#if loading && sessions.length === 0}
      <div class="loading">Loading sessions...</div>
    {:else if sessions.length === 0}
      <div class="empty-state">No sessions found</div>
    {:else}
      <ul>
        {#each sessions as session (session.id)}
          <li 
            class:active={activeSessionId === session.id}
            on:click={() => selectSession(session.id)}
            on:keydown={(e) => e.key === 'Enter' && selectSession(session.id)}
            tabindex="0"
          >
            <div class="session-name">{formatSessionId(session.id)}</div>
            <div class="session-date">Last updated: {formatDate(session.updated)}</div>
          </li>
        {/each}
      </ul>
    {/if}
  </div>
</div>

<style>
  .session-sidebar {
    background-color: #f5f5f5;
    border-right: 1px solid #ddd;
    width: 250px;
    height: 100%;
    padding: 1rem;
    display: flex;
    flex-direction: column;
  }

  .sidebar-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
  }

  h3 {
    margin: 0;
    font-size: 1.2rem;
    color: #333;
  }

  .refresh-button {
    background: none;
    border: none;
    color: #666;
    cursor: pointer;
    font-size: 1.2rem;
  }

  .refresh-button:hover {
    color: #333;
  }

  .new-session-button {
    background-color: #4CAF50;
    color: white;
    border: none;
    padding: 0.5rem;
    border-radius: 4px;
    cursor: pointer;
    margin-bottom: 1rem;
    font-weight: bold;
  }

  .new-session-button:hover {
    background-color: #45a049;
  }

  .error-message {
    color: #d32f2f;
    margin-bottom: 1rem;
    padding: 0.5rem;
    background-color: #ffebee;
    border-radius: 4px;
    font-size: 0.9rem;
  }

  .sessions-list {
    flex: 1;
    overflow-y: auto;
  }

  ul {
    list-style: none;
    padding: 0;
    margin: 0;
  }

  li {
    padding: 0.75rem;
    border-radius: 4px;
    margin-bottom: 0.5rem;
    cursor: pointer;
    transition: background-color 0.2s;
    border: 1px solid transparent;
  }

  li:hover {
    background-color: #e0e0e0;
  }

  li.active {
    background-color: #e8f5e9;
    border-color: #4CAF50;
  }

  .session-name {
    font-weight: bold;
    margin-bottom: 0.25rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .session-date {
    font-size: 0.8rem;
    color: #666;
  }

  .loading, .empty-state {
    color: #666;
    text-align: center;
    padding: 1rem 0;
  }
</style>
