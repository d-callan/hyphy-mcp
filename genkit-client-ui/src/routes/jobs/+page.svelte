<script>
  import Jobs from '$lib/components/Jobs.svelte';
</script>

<div class="container">
  <header>
    <h1>HyPhy Jobs Dashboard</h1>
    <p>View and manage all your HyPhy analysis jobs</p>
  </header>
  
  <main>
    <Jobs />
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
  
  footer {
    margin-top: 2rem;
    text-align: center;
    color: #666;
    font-size: 0.9rem;
    padding: 1rem 0;
    border-top: 1px solid #eee;
  }
</style>
