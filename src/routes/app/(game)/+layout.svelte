<div id="game-root">
  <slot />
</div>

<style>
  #game-root {
    position: fixed;
    inset: 0;
    width: 100vw;
    height: 100vh;
    overflow: hidden;
    background: #000;
    touch-action: none;
  }
</style>
