<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import { fade, scale } from 'svelte/transition';
  
  // Props
  export let closeOnEsc = true;
  export let closeOnOutsideClick = true;
  export let width = 'auto';
  export let maxWidth = '800px';
  export let maxHeight = '90vh';
  
  // Event dispatcher
  const dispatch = createEventDispatcher();
  
  // Close the modal
  function close() {
    dispatch('close');
  }
  
  // Handle keydown events
  function handleKeydown(event: KeyboardEvent) {
    if (closeOnEsc && event.key === 'Escape') {
      close();
    }
  }
  
  // Handle outside clicks
  function handleOutsideClick(event: MouseEvent) {
    if (closeOnOutsideClick && event.target === event.currentTarget) {
      close();
    }
  }
  
  // Add keydown event listener on mount
  onMount(() => {
    document.addEventListener('keydown', handleKeydown);
    
    return () => {
      document.removeEventListener('keydown', handleKeydown);
    };
  });
</script>

<div 
  class="modal-backdrop" 
  on:click={handleOutsideClick} 
  on:keydown={handleKeydown} 
  role="dialog" 
  tabindex="-1"
  aria-modal="true" 
  transition:fade={{ duration: 200 }}>
  <div 
    class="modal-container" 
    transition:scale={{ duration: 200, start: 0.95 }}
    style="width: {width}; max-width: {maxWidth}; max-height: {maxHeight};"
  >
    <div class="modal-header">
      <slot name="header">
        <h2>Modal Title</h2>
      </slot>
      <button class="close-button" on:click={close} aria-label="Close modal">
        &times;
      </button>
    </div>
    
    <div class="modal-content">
      <slot name="content">
        <p>Modal content goes here.</p>
      </slot>
    </div>
    
    <div class="modal-footer">
      <slot name="footer">
        <!-- Default footer content, if any -->
      </slot>
    </div>
  </div>
</div>

<style>
  .modal-backdrop {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background-color: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    padding: 20px;
    box-sizing: border-box;
  }
  
  .modal-container {
    background-color: white;
    border-radius: 8px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    width: 100%;
  }
  
  .modal-header {
    padding: 16px 20px;
    border-bottom: 1px solid #eee;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  
  .modal-header h2 {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 500;
  }
  
  .close-button {
    background: none;
    border: none;
    font-size: 1.5rem;
    cursor: pointer;
    padding: 0;
    color: #666;
    line-height: 1;
    transition: color 0.2s;
  }
  
  .close-button:hover {
    color: #333;
  }
  
  .modal-content {
    padding: 20px;
    overflow-y: auto;
    flex: 1;
  }
  
  .modal-footer {
    padding: 16px 20px;
    border-top: 1px solid #eee;
    display: flex;
    justify-content: flex-end;
  }
</style>
