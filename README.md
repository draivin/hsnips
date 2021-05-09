[![Version](https://vsmarketplacebadge.apphb.com/version-short/draivin.hsnips.svg)](https://marketplace.visualstudio.com/items?itemName=draivin.hsnips)
[![Rating](https://vsmarketplacebadge.apphb.com/rating-short/draivin.hsnips.svg)](https://marketplace.visualstudio.com/items?itemName=draivin.hsnips)
[![Installs](https://vsmarketplacebadge.apphb.com/installs/draivin.hsnips.svg)](https://marketplace.visualstudio.com/items?itemName=draivin.hsnips)

# HyperSnips for Math

这是一个由 OrangeX4 魔改过的 HyperSnips, 增加了**对 Markdown 和 Latex 中数学环境匹配**的功能.

看个小例子:

``` hsnips
snippet `((\d+)|(\d*)(\\)?([A-Za-z]+)((\^|_)(\{\d+\}|\d))*)/` "Fraction no ()" Am
\frac{``rv = m[1]``}{$1}$0
endsnippet
```

这是一个在数学环境中自动展开的 Snippet, 它有两个标示符 'Am', 分别代表 '自动展开' 和 '数学环境'. 用处是:

```
1/    --->    \frac{1}{}
```

相比于原来的 HyperSnips, 最大特点是, 它只会在数学环境 `$...$`, `$$...$$`, `\(...\)` 和 `\[...\]` 中自动展开!

![](./images/welcome.gif)

HyperSnips is a snippet engine for vscode heavily inspired by vim's
[UltiSnips](https://github.com/SirVer/ultisnips).

## Usage

To use HyperSnips you create `.hsnips` files on a directory which depends on your platform:

- Windows: `%APPDATA%\Code\User\hsnips\(language).hsnips`
- Mac: `$HOME/Library/Application Support/Code/User/hsnips/(language).hsnips`
- Linux: `$HOME/.config/Code/User/hsnips/(language).hsnips`

Or alternatively, you can open this directory by running the command `HyperSnips: Open snippets directory`.

Additionally, you can create an `all.hsnips` file for snippets that should be available on all languages.

### Snippets file

A snippets file is a file with the `.hsnips` extension, the file is composed of two types of blocks:
global blocks and snippet blocks.

Global blocks are JavaScript code blocks with code that is shared between all the snippets defined
in the current file. They are defined with the `global` keyword, as follows:

```hsnips
global
// JavaScript code
endglobal
```

Snippet blocks are snippet definitions. They are defined with the `snippet` keyword, as follows:

```hsnips
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

- `m`: Math mode

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

## Examples

- Simple snippet which greets you with the current date and time

```hsnips
snippet dategreeting "Gives you the current date!"
Hello from your hsnip at ``rv = new Date().toDateString()``!
endsnippet
```

- Box snippet as shown in the gif above

```hsnips
snippet box "Box" A
``rv = '┌' + '─'.repeat(t[0].length + 2) + '┐'``
│ $1 │
``rv = '└' + '─'.repeat(t[0].length + 2) + '┘'``
endsnippet
```

- Snippet to insert the current filename

```hsnips
snippet filename "Current Filename"
``rv = require('path').basename(path)``
endsnippet
```
