import { stub } from './_stub.js';

const page = stub({
  title: 'Methods and caveats',
  intro: 'What the numbers mean, where they come from, and what they cannot tell you.',
  phase: 6,
});

export const mount = page.mount;
export const unmount = page.unmount;
