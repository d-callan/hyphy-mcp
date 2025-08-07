<script lang="ts">
  import Chat from '$lib/components/Chat.svelte';
  import SessionSidebar from '$lib/components/SessionSidebar.svelte';
  import { onMount } from 'svelte';
  import { base } from '$app/paths';
  
  // State
  let activeSessionId: string | null = null;
  let showSidebar = true;
  let sessions: Array<{id: string, created: number, updated: number}> = [];
  let isLoading = true;
  
  // Handle session selection
  function handleSessionSelect(event: CustomEvent<{sessionId: string}>) {
    activeSessionId = event.detail.sessionId;
    // Store the selected session ID in localStorage
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('hyphy_active_session', activeSessionId);
    }
  }
  
  // Handle new session creation
  function handleNewSession() {
    activeSessionId = null;
    // Clear the stored session ID
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('hyphy_active_session');
    }
  }
  
  // Toggle sidebar visibility
  function toggleSidebar() {
    showSidebar = !showSidebar;
  }
  
  // Load sessions and set the most recent one as active
  async function loadSessions() {
    try {
      isLoading = true;
      const response = await fetch('http://localhost:3000/api/sessions');
      
      if (!response.ok) {
        throw new Error(`Error: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data.success && data.sessions) {
        sessions = data.sessions;
        
        // Try to get the stored session ID first
        const storedSessionId = typeof localStorage !== 'undefined' ? 
          localStorage.getItem('hyphy_active_session') : null;
        
        if (storedSessionId && sessions.some(s => s.id === storedSessionId)) {
          // Use the stored session if it exists
          activeSessionId = storedSessionId;
        } else if (sessions.length > 0) {
          // Otherwise use the most recent session
          // Sort sessions by updated timestamp (newest first)
          sessions.sort((a, b) => b.updated - a.updated);
          activeSessionId = sessions[0].id;
          
          // Store the selected session ID
          if (typeof localStorage !== 'undefined') {
            localStorage.setItem('hyphy_active_session', activeSessionId);
          }
        }
      }
    } catch (error) {
      console.error('Error loading sessions:', error);
    } finally {
      isLoading = false;
    }
  }
  
  onMount(() => {
    loadSessions();
  });
</script>

<div class="container">
  <header>
    <div class="header-content">
      <img src={`${base}/images/monkeybot.png`} alt="MonkeyBot" class="monkeybot-logo" />
      <div>
        <h1>MonkeyBot</h1>
        <p>Analyze FASTA files using HyPhy phylogenetic methods</p>
      </div>
    </div>
  </header>
  
  <main class="chat-layout">
    {#if showSidebar}
      <SessionSidebar 
        activeSessionId={activeSessionId} 
        on:select={handleSessionSelect}
        on:new={handleNewSession}
      />
    {/if}
    
    <div class="chat-area">
      <button class="toggle-sidebar" on:click={toggleSidebar}>
        {showSidebar ? '«' : '»'}
      </button>
      <Chat sessionId={activeSessionId} />
    </div>
  </main>
  
  <footer>
    <p>Powered by Genkit and HyPhy MCP</p>
  </footer>
</div>

<style>
  .container {
    max-width: 1200px;
    margin: 0 auto;
    padding: 2rem 1rem;
    display: flex;
    flex-direction: column;
    min-height: 100vh;
  }
  
  header {
    margin-bottom: 2rem;
    text-align: center;
  }
  
  .header-content {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 1rem;
  }
  
  .monkeybot-logo {
    width: 80px;
    height: 80px;
    object-fit: contain;
  }
  
  h1 {
    font-size: 2.5rem;
    color: #333;
    margin-bottom: 0.5rem;
  }
  
  header p {
    font-size: 1.2rem;
    color: #666;
  }
  
  main {
    flex: 1;
  }
  
  .chat-layout {
    display: flex;
    height: calc(100vh - 200px);
    min-height: 500px;
    position: relative;
    border: 1px solid #ddd;
    border-radius: 8px;
    overflow: hidden;
  }
  
  .chat-area {
    flex: 1;
    position: relative;
    display: flex;
    flex-direction: column;
  }
  
  .toggle-sidebar {
    position: absolute;
    top: 10px;
    left: 10px;
    z-index: 10;
    background-color: #f5f5f5;
    border: 1px solid #ddd;
    border-radius: 4px;
    width: 30px;
    height: 30px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    font-weight: bold;
    color: #666;
  }
  
  .toggle-sidebar:hover {
    background-color: #e0e0e0;
  }
  
  footer {
    margin-top: 2rem;
    text-align: center;
    color: #666;
    font-size: 0.9rem;
    padding: 1rem 0;
    border-top: 1px solid #eee;
  }
</style>
