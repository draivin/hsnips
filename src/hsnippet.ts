import { DynamicRange, IChangeInfo } from './dynamicRange';

export type GeneratorResult = [(string | { block: number })[], string[]];
export type GeneratorFunction = (texts: string[], matchGroups: string[]) => GeneratorResult;

// Represents a snippet template from which new instances can be created.
export class HSnippet {
  trigger: string;
  description: string;
  generator: GeneratorFunction;
  automatic = false;
  regexp?: RegExp;
  placeholders: number;
  priority: number;

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

    if (header.flags.includes('A')) {
      this.automatic = true;
    }
  }
}

export interface IHSnippetHeader {
  trigger: string | RegExp;
  description: string;
  flags: string;
  priority?: number;
}
