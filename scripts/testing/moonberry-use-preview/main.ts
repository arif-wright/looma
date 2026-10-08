import { mount } from 'svelte';
import Preview from './Preview.svelte';
import { fetchShare } from './model';
// The real sharing client calls fetch. This in-memory adapter never touches a server.
window.fetch = fetchShare;
mount(Preview, { target: document.getElementById('app')! });
