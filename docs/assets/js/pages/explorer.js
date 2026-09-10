import { stub } from './_stub.js';

const page = stub({
  title: 'Competency explorer',
  intro: 'A deep look at one competency across every round that measured it.',
  phase: 3,
});

export const mount = page.mount;
export const unmount = page.unmount;
