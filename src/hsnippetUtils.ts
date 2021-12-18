function makeId(length: number) {
  let result = '';
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return `[${result}]`;
}

export class HSnippetUtils {
  private placeholders: [string, string][];

  constructor() {
    this.placeholders = [];
  }

  tabstop(tabstop: number, placeholder?: string) {
    const id = makeId(10);

    let text = '';
    if (placeholder) {
      text = `\${${tabstop}:${placeholder}}`;
    } else {
      text = `$${tabstop}`;
    }
    this.placeholders.push([id, text]);

    return id;
  }

  static format(value: string, utils: HSnippetUtils) {
    for (let [id, text] of utils.placeholders) {
      value = value.replace(id, text);
    }

    return value;
  }
}
