<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { marked } from 'marked';
  
  // Define message interface
  interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
  }

  // Define uploaded file interface
  interface UploadedFile {
    filename: string;
    originalName: string;
    path: string;
    size: number;
    mimetype: string;
  }
  
  // Props
  export let sessionId: string | null = null;

  // Chat state
  let messages: ChatMessage[] = [];
  let userInput = '';
  let isLoading = false;
  let error: string | null = null;
  let uploadedFiles: UploadedFile[] = []; // Track uploaded files
  let isUploading = false; // Track file upload status
  let currentSessionId = sessionId; // Track the current session ID
  
  // API endpoints
  const API_URL = 'http://localhost:3000/api/chat';
  const UPLOAD_URL = 'http://localhost:3000/api/upload';
  
  // Send message to the backend
  async function sendMessage() {
    if (!userInput.trim()) return;
    
    const userMessage = userInput.trim();
    userInput = '';
    
    // Add user message to chat
    messages = [...messages, { role: 'user', content: userMessage }];
    
    try {
      isLoading = true;
      error = null;
      
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          message: userMessage,
          ...(sessionId ? { sessionId } : {}) // Only include sessionId if it's not null/undefined
        }),
      });
      
      if (!response.ok) {
        throw new Error(`Error: ${response.status}`);
      }
      
      const data = await response.json();
      
      // Store the session ID for future requests
      if (data.sessionId) {
        sessionId = data.sessionId;
        console.log(`Using session ID: ${sessionId}`);
      }
      
      // Add assistant response to chat
      messages = [...messages, { role: 'assistant', content: data.response }];
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      error = `Failed to send message: ${errorMessage}`;
      console.error('Error sending message:', err);
    } finally {
      isLoading = false;
    }
  }
  
  // Handle form submission
  function handleSubmit() {
    sendMessage();
  }
  
  // Handle Enter key press
  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  }

  // Handle file upload
  async function handleFileUpload(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;
    
    const file = input.files[0];
    const formData = new FormData();
    formData.append('file', file);
    
    // Add sessionId to the form data if available
    if (sessionId) {
      formData.append('sessionId', sessionId);
    }
    
    try {
      isUploading = true;
      error = null;
      
      const response = await fetch(UPLOAD_URL, {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) {
        throw new Error(`Error: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data.success) {
        // Add the uploaded file to our list
        uploadedFiles = [...uploadedFiles, data.file];
        
        // Add a system message about the file upload
        messages = [...messages, { 
          role: 'assistant', 
          content: `File **${data.file.originalName}** (${Math.round(data.file.size / 1024)} KB) uploaded successfully. You can now analyze this file using HyPhy methods.` 
        }];
      } else {
        throw new Error(data.error || 'Unknown error');
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      error = `Failed to upload file: ${errorMessage}`;
      console.error('Error uploading file:', err);
    } finally {
      isUploading = false;
      // Clear the file input
      input.value = '';
    }
  }
  
  // Watch for sessionId changes
  $: if (sessionId !== currentSessionId) {
    loadSession(sessionId);
    currentSessionId = sessionId;
  }
  
  // Load session data
  async function loadSession(sid: string | null) {
    if (!sid) {
      // New session, reset state
      messages = [
        { 
          role: 'assistant', 
          content: 'Hi! I\'m MonkeyBot! I can help you analyze your FASTA files using various HyPhy methods. How can I assist you today?' 
        }
      ];
      uploadedFiles = [];
      return;
    }
    
    try {
      isLoading = true;
      error = null;
      
      const response = await fetch(`http://localhost:3000/api/sessions/${sid}`);
      
      if (!response.ok) {
        throw new Error(`Error: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data.success && data.session) {
        messages = data.session.messages || [];
        uploadedFiles = data.session.files || [];
        console.log(`Loaded session ${sid} with ${messages.length} messages`);
      } else {
        throw new Error(data.error || 'Unknown error');
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      error = `Failed to load session: ${errorMessage}`;
      console.error('Error loading session:', err);
      
      // Fallback to welcome message
      messages = [
        { 
          role: 'assistant', 
          content: 'Hi! I\'m MonkeyBot! I can help you analyze your FASTA files using various HyPhy methods. How can I assist you today?' 
        }
      ];
    } finally {
      isLoading = false;
    }
  }
  
  onMount(() => {
    // Load initial session or show welcome message
    if (sessionId) {
      loadSession(sessionId);
    } else {
      messages = [
        { 
          role: 'assistant', 
          content: 'Hi! I\'m MonkeyBot! I can help you analyze your FASTA files using various HyPhy methods. How can I assist you today?' 
        }
      ];
    }
  });
</script>

<div class="chat-container">
  <div class="chat-messages">
    {#each messages as message}
      <div class="message {message.role}">
        <div class="message-content">
          {@html marked(message.content)}
        </div>
      </div>
    {/each}
    
    {#if isLoading}
      <div class="message assistant loading">
        <div class="loading-indicator">
          <span>.</span><span>.</span><span>.</span>
        </div>
      </div>
    {/if}
    
    {#if error}
      <div class="error-message">
        {error}
      </div>
    {/if}
  </div>
  
  <form on:submit|preventDefault={handleSubmit} class="chat-input-form">
    <div class="file-upload">
      <label for="file-upload" class="file-upload-label" class:disabled={isUploading}>
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
          <polyline points="17 8 12 3 7 8"></polyline>
          <line x1="12" y1="3" x2="12" y2="15"></line>
        </svg>
        <span class="tooltip">{isUploading ? 'Uploading...' : 'Upload FASTA file'}</span>
      </label>
      <input 
        id="file-upload" 
        type="file" 
        accept=".fasta,.fa,.txt,.fas,.nex,.nexus,.tree,.fna" 
        on:change={handleFileUpload} 
        disabled={isUploading}
      />
    </div>
    <textarea 
      bind:value={userInput} 
      on:keydown={handleKeydown}
      placeholder="Type your message here..."
      rows="3"
      disabled={isLoading}
    ></textarea>
    <button type="submit" disabled={isLoading || !userInput.trim()}>
      {isLoading ? 'Sending...' : 'Send'}
    </button>
  </form>
</div>

<style>
  .chat-container {
    display: flex;
    flex-direction: column;
    height: 100%;
    max-width: 800px;
    margin: 0 auto;
    border: 1px solid #ddd;
    border-radius: 8px;
    overflow: hidden;
  }
  
  .chat-messages {
    flex: 1;
    overflow-y: auto;
    padding: 1rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
    background-color: #f9f9f9;
    min-height: 400px;
  }
  
  .message {
    max-width: 80%;
    padding: 0.75rem 1rem;
    border-radius: 1rem;
    animation: fadeIn 0.3s ease;
  }
  
  .user {
    align-self: flex-end;
    background-color: #0084ff;
    color: white;
    border-bottom-right-radius: 0.25rem;
  }
  
  .assistant {
    align-self: flex-start;
    background-color: #e5e5ea;
    color: #333;
    border-bottom-left-radius: 0.25rem;
  }
  
  .loading-indicator {
    display: flex;
    gap: 0.25rem;
  }
  
  .loading-indicator span {
    animation: bounce 1s infinite;
  }
  
  .loading-indicator span:nth-child(2) {
    animation-delay: 0.2s;
  }
  
  .loading-indicator span:nth-child(3) {
    animation-delay: 0.4s;
  }
  
  .error-message {
    color: #d32f2f;
    padding: 0.5rem;
    margin: 0.5rem 0;
    background-color: #ffebee;
    border-radius: 4px;
    font-size: 0.875rem;
  }
  
  .chat-input-form {
    display: flex;
    padding: 1rem;
    background-color: white;
    border-top: 1px solid #ddd;
    gap: 0.5rem;
    align-items: flex-end;
  }
  
  .file-upload {
    position: relative;
  }
  
  .file-upload input[type="file"] {
    display: none;
  }
  
  .file-upload-label {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    background-color: #f0f0f0;
    border-radius: 4px;
    cursor: pointer;
    transition: background-color 0.2s;
    position: relative;
  }
  
  .file-upload-label:hover {
    background-color: #e0e0e0;
  }
  
  .file-upload-label.disabled {
    background-color: #cccccc;
    cursor: not-allowed;
  }
  
  .file-upload-label svg {
    width: 20px;
    height: 20px;
    color: #555;
  }
  
  .tooltip {
    position: absolute;
    bottom: 100%;
    left: 50%;
    transform: translateX(-50%);
    background-color: #333;
    color: white;
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 12px;
    white-space: nowrap;
    opacity: 0;
    visibility: hidden;
    transition: opacity 0.2s, visibility 0.2s;
    margin-bottom: 5px;
  }
  
  .file-upload-label:hover .tooltip {
    opacity: 1;
    visibility: visible;
  }
  
  textarea {
    flex: 1;
    padding: 0.75rem;
    border: 1px solid #ddd;
    border-radius: 4px;
    resize: none;
    font-family: inherit;
    font-size: 1rem;
  }
  
  button {
    padding: 0.5rem 1rem;
    background-color: #0084ff;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-weight: bold;
    transition: background-color 0.2s;
  }
  
  button:hover:not(:disabled) {
    background-color: #0069d9;
  }
  
  button:disabled {
    background-color: #cccccc;
    cursor: not-allowed;
  }
  
  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(10px); }
    to { opacity: 1; transform: translateY(0); }
  }
  
  @keyframes bounce {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-5px); }
  }
</style>
