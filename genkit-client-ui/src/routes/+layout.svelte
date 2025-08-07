<script>
	import favicon from '$lib/assets/favicon.svg';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<div class="app">
  <nav class="main-nav">
    <div class="nav-container">
      <div class="logo">
        <a href="/">MonkeyBot</a>
      </div>
      <ul class="nav-links">
        <li><a href="/">Home</a></li>
      </ul>
    </div>
  </nav>

  <div class="content">
    {@render children?.()}
  </div>
</div>

<style>
  .app {
    display: flex;
    flex-direction: column;
    min-height: 100vh;
  }

  .main-nav {
    background-color: #2c3e50;
    color: white;
    padding: 0.5rem 0;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  }

  .nav-container {
    max-width: 1200px;
    margin: 0 auto;
    padding: 0 1rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .logo a {
    color: white;
    font-size: 1.5rem;
    font-weight: bold;
    text-decoration: none;
  }

  .nav-links {
    display: flex;
    list-style: none;
    margin: 0;
    padding: 0;
    gap: 1.5rem;
  }

  .nav-links a {
    color: white;
    text-decoration: none;
    font-size: 1rem;
    padding: 0.5rem 0;
    transition: color 0.2s;
  }

  .nav-links a:hover {
    color: #3498db;
  }

  .content {
    flex: 1;
  }
</style>
