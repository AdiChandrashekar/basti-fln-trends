/**
 * Temporary scaffold for pages not yet built.
 *
 * Each page module below phase 3 imports this so the navigation rail works
 * end-to-end from phase 1. Every one of these files is replaced by a real
 * implementation in its build phase — nothing here ships.
 */

export function stub({ title, intro, phase }) {
  return {
    mount(root) {
      const heading = document.createElement('h1');
      heading.className = 'page-title';
      heading.textContent = title;

      const lead = document.createElement('p');
      lead.className = 'page-intro';
      lead.textContent = intro;

      const note = document.createElement('div');
      note.className = 'empty-state';
      note.style.marginTop = 'var(--s-5)';
      note.textContent = `This page is built in phase ${phase}. The data layer and the navigation are in place; the charts come next.`;

      root.append(heading, lead, note);
    },
    unmount() {},
  };
}
