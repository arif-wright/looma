import { mount, unmount, tick } from 'svelte';
import { fixture, installSyntheticTransport } from './runtime';
import './observe-scene';
import Arpg from '../../../src/routes/app/(game)/games/arpg/+page.svelte';

installSyntheticTransport();
const pages = new Map<number, { component: ReturnType<typeof mount>; target: HTMLDivElement }>();
let serial = 0;
fixture.mountAnother = async () => {
  const id = ++serial;
  const target = document.createElement('div');
  target.dataset.fixturePage = String(id);
  document.querySelector('#pages')!.append(target);
  const component = mount(Arpg, { target, props: { data: { slug: 'arpg' } as never } });
  pages.set(id, { component, target });
  await tick();
  return id;
};
fixture.unmountPage = async (id) => {
  const page = pages.get(id);
  if (!page) return;
  pages.delete(id);
  await unmount(page.component);
  page.target.remove();
  await tick();
};
fixture.unmountAll = async () => {
  for (const id of [...pages.keys()]) await fixture.unmountPage(id);
};
await fixture.mountAnother();
fixture.ready = true;
