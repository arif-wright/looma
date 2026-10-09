import { mount, tick } from 'svelte';
import { fixture, installSyntheticTransport } from './runtime';
import Preview from './Preview.svelte';
installSyntheticTransport();
mount(Preview, { target: document.getElementById('app')! });
void tick().then(() => { fixture.ready = true; });
