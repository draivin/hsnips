# HyperSnips

![](./images/welcome.gif)

HyperSnips is a snippet engine for vscode heavily inspired by vim's
[UltiSnips](https://github.com/SirVer/ultisnips).

## Usage

To use HyperSnips you create `.hsnips` files on a directory which depends on your platform:

- Windows: `%APPDATA%\Code\User\globalStorage\draivin.hsnips\hsnips\(language).hsnips`
- Mac: `$HOME/Library/Application Support/Code/User/globalStorage/draivin.hsnips/hsnips/(language).hsnips`
- Linux: `$HOME/.config/Code/User/globalStorage/draivin.hsnips/hsnips/(language).hsnips`

You can open this directory by running the command `HyperSnips: Open snippets directory`.
This directory may be customized by changing the setting `hsnips.hsnipsPath`.
If this setting starts with `~` or `${workspaceFolder}`, then it will be replaced with
your home directory or the current workspace folder, respectively.

The file should be named based on the language the snippets are meant for (e.g. `latex.hsnips`
for snippets which will be available for LaTeX files).
Additionally, you can create an `all.hsnips` file for snippets that should be available on all languages.

### Snippets file

A snippets file is a file with the `.hsnips` extension, the file is composed of two types of blocks:
global blocks and snippet blocks.

Global blocks are JavaScript code blocks with code that is shared between all the snippets defined
in the current file. They are defined with the `global` keyword, as follows:

```lua
global
// JavaScript code
endglobal
```

Snippet blocks are snippet definitions. They are defined with the `snippet` keyword, as follows:

```lua
context expression
snippet trigger "description" flags
body
endsnippet
```

where the `trigger` field is required and the fields `description` and `flags` are optional.

### Trigger

A trigger can be any sequence of characters which does not contain a space, or a regular expression
surrounded by backticks (`` ` ``).

### Flags

The flags field is a sequence of characters which modify the behavior of the snippet, the available
flags are the following:

- `A`: Automatic snippet expansion - Usually snippets are activated when the `tab` key is pressed,
  with the `A` flag snippets will activate as soon as their trigger matches, it is specially useful
  for regex snippets.

- `1-9`: Hide snippet from inline suggestions up to character (1-9)\* - By default, all snippets will be listed 
  by the inline suggestions. With a specified number snippets will be hidden from suggestion until the specified
  number of characters are written. (If number exceeds trigger length: Necessarily needs `A` flag or else snippet won't expand)

- `i`: In-word expansion\* - By default, a snippet trigger will only match when the trigger is
  preceded by whitespace characters. A snippet with this option is triggered regardless of the
  preceding character, for example, a snippet can be triggered in the middle of a word.

- `w`: Word boundary\* - With this option the snippet trigger will match when the trigger is a word
  boundary character. Use this option, for example, to permit expansion where the trigger follows
  punctuation without expanding suffixes of larger words.

- `b`: Beginning of line expansion\* - A snippet with this option is expanded only if the
  tab trigger is the first word on the line. In other words, if only whitespace precedes the tab
  trigger, expand.

- `M`: Multi-line mode - By default, regex matches will only match content on the current line, when
  this option is enabled the last `hsnips.multiLineContext` lines will be available for matching.

\*: This flag will only affect snippets which have non-regex triggers.

### Snippet body

The body is the text that will replace the trigger when the snippet is expanded, as in usual
snippets, the tab stops `$1`, `$2`, etc. are available.

The full power of HyperSnips comes when using JavaScript interpolation: you can have code blocks
inside your snippet delimited by two backticks (` `` `) that will run when the snippet is expanded,
and every time the text in one of the tab stops is changed.

### Code interpolation

Inside the code interpolation, you have access to a few special variables:

- `rv`: The return value of your code block, the value of this variable will replace the code block
  when the snippet is expanded.
- `t`: An array containing the text within the tab stops, in the same order as the tab stops are
  defined in the snippet block. You can use it to dynamically change the snippet content.
- `m`: An array containing the match groups of your regular expression trigger, or an empty array if
  the trigger is not a regular expression.
- `w`: A URI string of the currently opened workspace, or an empty string if no workspace is open.
- `path`: A URI string of the current document. (untitled documents have the scheme `untitled`)

Additionally, every variable defined in one code block will be available in all the subsequent code
blocks in the snippet.

The `require` function can also be used to import NodeJS modules.

### Context matching

Optionally, you can have a `context` line before the snippet block, it is followed by any javascript
expression, and the snippet is only available if the `context` expression evaluates to `true`.

Inside the `context` expression you can use the `context` variable, which has the following type:

```ts
interface Context {
  scopes: string[];
}
```
Here, `scopes` stands for the TextMate scopes at the current cursor position, which can be viewed by
running the `Developer: Inspect Editor Tokens and Scopes` command in `vscode`.

As an example, here is an automatic LaTeX snippet that only expands when inside a math block:

```lua
global
function math(context) {
    return context.scopes.some(s => s.startsWith("meta.math"));
}
endglobal

context math(context)
snippet inv "inverse" Ai
^{-1}
endsnippet
```

## Examples

- Simple snippet which greets you with the current date and time

```lua
snippet dategreeting "Gives you the current date!"
Hello from your hsnip at ``rv = new Date().toDateString()``!
endsnippet
```

- Box snippet as shown in the gif above

```lua
snippet box "Box" A
``rv = '┌' + '─'.repeat(t[0].length + 2) + '┐'``
│ $1 │
``rv = '└' + '─'.repeat(t[0].length + 2) + '┘'``
endsnippet
```

- Snippet to insert the current filename

```lua
snippet filename "Current Filename"
``rv = require('path').basename(path)``
endsnippet
```
