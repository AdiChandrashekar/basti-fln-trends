import { stub } from './_stub.js';

const page = stub({
  title: 'DiD snapshot',
  intro: 'The baseline-to-midline story from the DiD study, told like for like.',
  phase: 5,
});

export const mount = page.mount;
export const unmount = page.unmount;
