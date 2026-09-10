import { stub } from './_stub.js';

const page = stub({
  title: 'Distributions',
  intro: 'The shape behind the percentage: how children were spread on each task.',
  phase: 5,
});

export const mount = page.mount;
export const unmount = page.unmount;
