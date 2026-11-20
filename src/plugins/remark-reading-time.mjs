// Adds `minutesRead` to a post's frontmatter. Prose is read at ~230 wpm;
// code is skimmed, so its words count at half weight.
import { visit } from 'unist-util-visit';
import { toString } from 'mdast-util-to-string';

const words = (s) => (s.match(/\S+/g) || []).length;

export function remarkReadingTime() {
  return (tree, file) => {
    let codeWords = 0;
    visit(tree, 'code', (node) => {
      codeWords += words(node.value);
    });
    const total = words(toString(tree));
    const minutes = Math.max(1, Math.round((total + codeWords * 0.5) / 230));
    file.data.astro.frontmatter.minutesRead = minutes;
  };
}
