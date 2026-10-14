// One colour per request, the same everywhere on the site.
const HUES = [32, 195, 340, 150, 265, 10, 175, 55, 300, 110, 225, 0];

export function seqColor(id: number) {
  return `hsl(${HUES[id % HUES.length]} 62% 48%)`;
}
