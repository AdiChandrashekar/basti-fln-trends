import { stub } from './_stub.js';

const page = stub({
  title: 'Overview',
  intro: 'How Grade 2 is doing, and whether it is improving.',
  phase: 3,
});

export const mount = page.mount;
export const unmount = page.unmount;
