export type GeneratorResult = [(string | { block: number })[], string[]];
export type GeneratorFunction = (
  texts: string[],
  matchGroups: string[],
  workspaceUri: string,
  fileUri: string
) => GeneratorResult;

// Represents a snippet template from which new instances can be created.
export class HSnippet {
  trigger: string;
  description: string;
  generator: GeneratorFunction;
  regexp?: RegExp;
  placeholders: number;
  priority: number;

  // UltiSnips-like options.
  automatic = false;
  multiline = false;
  inword = false;
  wordboundary = false;
  beginningofline = false;

  constructor(header: IHSnippetHeader, generator: GeneratorFunction, placeholders: number) {
    this.description = header.description;
    this.generator = generator;
    this.placeholders = placeholders;
    this.priority = header.priority || 0;

    if (header.trigger instanceof RegExp) {
      this.regexp = header.trigger;
      this.trigger = '';
    } else {
      this.trigger = header.trigger;
    }

    if (header.flags.includes('A')) this.automatic = true;
    if (header.flags.includes('M')) this.multiline = true;
    if (header.flags.includes('i')) this.inword = true;
    if (header.flags.includes('w')) this.wordboundary = true;
    if (header.flags.includes('b')) this.beginningofline = true;
  }
}

export interface IHSnippetHeader {
  trigger: string | RegExp;
  description: string;
  flags: string;
  priority?: number;
}
