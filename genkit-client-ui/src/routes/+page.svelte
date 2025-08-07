<script lang="ts">
  import Chat from '$lib/components/Chat.svelte';
  import SessionSidebar from '$lib/components/SessionSidebar.svelte';
  import Jobs from '$lib/components/Jobs.svelte';
  import { onMount } from 'svelte';
  import { base } from '$app/paths';
  
  // Stepper state
  let activeStep = 'jobs';
  let selectedJobId: string | null = null;
  let canViewVisualizations = false;
  
  // State
  let activeSessionId: string | null = null;
  let showSidebar = false; // Collapsed by default
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
  
  // Handle step navigation
  function navigateToStep(stepId: string) {
    // Only allow navigation to visualizations if a job is selected
    if (stepId === 'viz' && !canViewVisualizations) {
      return;
    }
    activeStep = stepId;
  }
  
  // Handle job selection
  function selectJob(jobId: string) {
    selectedJobId = jobId;
    canViewVisualizations = true;
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
  
  <main class="main-layout">
    <div class="analyses-section">
      <h2>Analyses</h2>
      
      <div class="stepper" role="tablist" aria-label="Analysis Steps">
        <button 
          class="step {activeStep === 'jobs' ? 'active' : ''}" 
          on:click={() => navigateToStep('jobs')}
          on:keydown={(e) => e.key === 'Enter' && navigateToStep('jobs')}
          role="tab"
          aria-selected={activeStep === 'jobs'}
          tabindex="0"
        >
          <div class="step-number">1</div>
          <div class="step-label">Jobs</div>
        </button>
        <div class="step-connector" aria-hidden="true"></div>
        <button 
          class="step {activeStep === 'viz' ? 'active' : ''} {!canViewVisualizations ? 'disabled' : ''}" 
          on:click={() => navigateToStep('viz')}
          on:keydown={(e) => e.key === 'Enter' && navigateToStep('viz')}
          role="tab"
          aria-selected={activeStep === 'viz'}
          aria-disabled={!canViewVisualizations}
          tabindex={canViewVisualizations ? 0 : -1}
        >
          <div class="step-number">2</div>
          <div class="step-label">Visualizations</div>
        </button>
      </div>
      
      {#if activeStep === 'jobs'}
        <div class="step-content">
          <div class="jobs-table">
            <Jobs on:selectJob={(e) => selectJob(e.detail.jobId)} />
          </div>
        </div>
      {:else if activeStep === 'viz'}
        <div class="step-content">
          <div class="coming-soon">
            <p>Visualizations for job {selectedJobId} coming soon...</p>
          </div>
        </div>
      {/if}
    </div>
    
    <div class="chat-container">
      <button class="toggle-sidebar" on:click={toggleSidebar}>
        {showSidebar ? '«' : '»'}
      </button>
      
      <div class="chat-layout">
        {#if showSidebar}
          <div class="sidebar-container">
            <SessionSidebar 
              activeSessionId={activeSessionId} 
              on:select={handleSessionSelect}
              on:new={handleNewSession}
            />
          </div>
        {/if}
        
        <div class="chat-section">
          <h2>Chat</h2>
          <Chat sessionId={activeSessionId} />
        </div>
      </div>
    </div>
  </main>
  
  <footer>
    <p>Powered by Genkit and HyPhy MCP</p>
  </footer>
</div>

<style>
  .container {
    width: 100%;
    margin: 0 auto;
    padding: 2rem;
    display: flex;
    flex-direction: column;
    height: 100vh;
    box-sizing: border-box;
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
  
  .main-layout {
    display: flex;
    height: calc(100vh - 200px);
    min-height: 500px;
    position: relative;
    overflow: hidden;
    gap: 1rem;
    flex: 1;
  }
  
  .analyses-section {
    flex: 6;
    padding: 1rem;
    overflow-y: auto;
    border: 1px solid #ddd;
    border-radius: 8px;
    display: flex;
    flex-direction: column;
  }
  
  .stepper {
    display: flex;
    align-items: center;
    margin-bottom: 1.5rem;
  }
  
  .step {
    display: flex;
    align-items: center;
    cursor: pointer;
    padding: 0.5rem;
    border-radius: 4px;
    transition: background-color 0.2s;
  }
  
  .step:hover:not(.disabled) {
    background-color: #f0f0f0;
  }
  
  .step.active {
    font-weight: 500;
  }
  
  .step.disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  
  .step-number {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background-color: #ddd;
    color: #666;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 500;
    margin-right: 0.5rem;
  }
  
  .step.active .step-number {
    background-color: #4a90e2;
    color: white;
  }
  
  .step-connector {
    flex: 1;
    height: 2px;
    background-color: #ddd;
    margin: 0 0.5rem;
    max-width: 50px;
  }
  
  .step-content {
    flex: 1;
    overflow-y: auto;
  }
  
  .jobs-table {
    width: 100%;
  }
  
  
  .coming-soon {
    display: flex;
    justify-content: center;
    align-items: center;
    height: 200px;
    color: #666;
    font-style: italic;
    background-color: #f9f9f9;
    border-radius: 8px;
    margin-top: 1rem;
  }
  
  .chat-container {
    flex: 4;
    position: relative;
    border: 1px solid #ddd;
    border-radius: 8px;
    overflow: hidden;
  }
  
  .chat-layout {
    display: flex;
    height: 100%;
    width: 100%;
  }
  
  .sidebar-container {
    width: 250px;
    border-right: 1px solid #ddd;
    overflow-y: auto;
    background-color: #f9f9f9;
  }
  
  .chat-section {
    flex: 1;
    padding: 1rem;
    display: flex;
    flex-direction: column;
    overflow-y: auto;
    max-height: 100%;
  }
  
  .analyses-section h2,
  .chat-section h2 {
    margin-top: 0;
    margin-bottom: 1rem;
    font-size: 1.3rem;
    color: #333;
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
