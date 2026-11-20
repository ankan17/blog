// Two restrained highlighting themes in the blog's palette.
// Blue = what you run, garnet = literal strings, amber/gold = constants,
// soft ink = comments. Background is set in CSS, not here.
const theme = (name, type, c) => ({
  name,
  type,
  colors: { 'editor.foreground': c.fg, 'editor.background': c.bg },
  tokenColors: [
    { settings: { foreground: c.fg } },
    { scope: ['comment', 'punctuation.definition.comment'], settings: { foreground: c.comment, fontStyle: 'italic' } },
    {
      scope: ['keyword', 'storage', 'support.function', 'entity.name.function', 'entity.name.command', 'support.function.builtin', 'keyword.control'],
      settings: { foreground: c.blue },
    },
    { scope: ['string', 'string.quoted', 'markup.inline.raw'], settings: { foreground: c.garnet } },
    {
      scope: ['constant', 'constant.numeric', 'constant.language', 'variable.other.constant', 'support.constant'],
      settings: { foreground: c.constant },
    },
    { scope: ['entity.name.tag', 'entity.name.section', 'entity.name.type', 'support.type.property-name', 'variable.other.property', 'keyword.other.definition.ini'], settings: { foreground: c.blue } },
    { scope: ['variable', 'variable.parameter', 'variable.other'], settings: { foreground: c.fg } },
    { scope: ['punctuation', 'keyword.operator', 'meta.brace'], settings: { foreground: c.punct } },
    { scope: ['markup.inserted'], settings: { foreground: c.blue } },
    { scope: ['markup.deleted'], settings: { foreground: c.garnet } },
  ],
});

export const rfcLight = theme('rfc-light', 'light', {
  fg: '#0e1a33',
  bg: '#f1f3f8',
  comment: '#56607a',
  blue: '#004d98',
  garnet: '#a50044',
  constant: '#7a5300',
  punct: '#4a5570',
});

export const rfcDark = theme('rfc-dark', 'dark', {
  fg: '#e7ebf3',
  bg: '#131c2e',
  comment: '#a3adc2',
  blue: '#8db8f2',
  garnet: '#f392b8',
  constant: '#e9c35b',
  punct: '#b9c1d3',
});
