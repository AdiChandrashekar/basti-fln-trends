import { stub } from './_stub.js';

const page = stub({
  title: 'Changes',
  intro: 'Separating the changes you can trust from the ones that cross an instrument change.',
  phase: 4,
});

export const mount = page.mount;
export const unmount = page.unmount;
