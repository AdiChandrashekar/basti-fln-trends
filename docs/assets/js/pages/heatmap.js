import { stub } from './_stub.js';

const page = stub({
  title: 'Competency map',
  intro: 'Every competency in every round: which are strong, which are weak, and when.',
  phase: 4,
});

export const mount = page.mount;
export const unmount = page.unmount;
