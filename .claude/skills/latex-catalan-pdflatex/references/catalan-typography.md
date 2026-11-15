# Catalan typography in LaTeX (pdfLaTeX)

Contents: 1. Language setup · 2. Quotes · 3. Special letters · 4. Dates, ordinals, numbers · 5. Titles and cross-references · 6. Maths and theorems · 7. Pitfalls

## 1. Language setup

```latex
\usepackage[T1]{fontenc}
\usepackage[utf8]{inputenc}
\usepackage[catalan]{babel}
```

With `catalan`, babel provides Catalan hyphenation and translates the automatic names: Resum (abstract), Índex (contents), Bibliografia, Capítol, Apèndix, Figura, Taula, Índex de figures, Índex de taules, Demostració (proof), Glossari. `\today` gives a Catalan date such as "15 de novembre de 2026" (babel handles the elisions "d'abril", "d'agost", "d'octubre").

Mixed-language text: `\foreignlanguage{english}{...}` for short phrases, or `\begin{otherlanguage}{english}...\end{otherlanguage}` for blocks. To use several languages, load them all: `\usepackage[english,catalan]{babel}`, with the main language **last**.

## 2. Quotes

`csquotes` has no Catalan style, so define it once in the preamble (the template does this):

```latex
\usepackage{csquotes}
\DeclareQuoteStyle{catalan}
  {\guillemotleft}{\guillemotright}
  {\textquotedblleft}{\textquotedblright}
```

Then `\enquote{text}` gives «text», and a nested `\enquote` gives “text” inside. Block quotes: `\blockquote{...}` or the `quote` environment. Never type a straight `"`.

## 3. Special letters and punctuation

- Geminated l: type `l·l` directly with the middle dot (U+00B7): `col·legi`, `paral·lel`, `Corol·lari`. Works with `inputenc` utf8 and T1. In a `\newtheorem` title or a section title it is also fine.
- Apostrophe: a normal `'` (`l'any`, `d'aigua`) typesets correctly.
- Accents on capitals work normally: `É`, `À`, `Ç`. For small caps use `\textsc{...}`.
- Dashes: `--` for ranges (pàgines 3--7), `---` for a long dash, `-` for hyphens.

## 4. Dates, ordinals, numbers

- Ordinals are written without superscript: 1r, 2n, 3r, 4t (masculine) and 1a, 2a, 3a, 4a (feminine). Type them as plain text.
- Decimal comma, thin-space thousands:

```latex
\usepackage{siunitx}
\sisetup{output-decimal-marker={,}, group-separator={\,}}
\num{1234567,89}      % 1 234 567,89
\SI{2,5}{\kilo\gram}
\SI{12}{\percent}     % or: 12~\%
```

- Put a non-breaking space between a number and `%` (`50~\%`), and between a number and its unit if not using siunitx.
- In math mode a decimal comma needs braces to avoid extra space: `$3{,}14$`.
- Thousands in running text: a thin non-breaking space `1\,000`.

## 5. Titles and cross-references

- Sentence case in titles and headings: "Introducció a l'àlgebra lineal", not "Introducció A L'Àlgebra Lineal". Capitalise only the first word and proper nouns.
- Cross-references: `Figura~\ref{fig:x}`, `taula~\ref{tab:y}`, `secció~\ref{sec:z}`. Use the article that matches the noun in running text ("a la taula", "al capítol", "a l'apèndix"). Do not use `cleveref` unless it is already in the preamble.
- Captions end with a full stop and describe the content: `\caption{Evolució de la temperatura al llarg del dia.}`.
- Lists: items starting lowercase and ending with `;` and a final `.` for sentence-style lists, or plain noun phrases with no punctuation for short lists; stay consistent inside one document.

## 6. Maths and theorems

Catalan theorem names (also in the template):

```latex
\usepackage{amsthm}
\theoremstyle{plain}
\newtheorem{teorema}{Teorema}
\newtheorem{lema}[teorema]{Lema}
\newtheorem{proposicio}[teorema]{Proposició}
\newtheorem{corollari}[teorema]{Corol·lari}
\theoremstyle{definition}
\newtheorem{definicio}[teorema]{Definició}
\newtheorem{exemple}[teorema]{Exemple}
\theoremstyle{remark}
\newtheorem*{observacio}{Observació}
```

The `proof` environment is titled "Demostració" automatically. Catalan notation for trigonometric functions uses `tg` and `arctg`:

```latex
\DeclareMathOperator{\tg}{tg}
\DeclareMathOperator{\arctg}{arctg}
```

Use `\operatorname{...}` or `\DeclareMathOperator` for any other named function, never plain italic letters. Put punctuation after displayed equations inside the display.

## 7. Pitfalls

- **Straight `"`**: use `\enquote`. With some babel setups `"` is an active character and breaks TikZ or pgfplots labels written as `"label"`; if that happens add `\usetikzlibrary{babel}` or `\shorthandoff{"}` before the TikZ code.
- **Package order**: `babel` before `csquotes`; `hyperref` late; `biblatex` after `babel` and `csquotes`.
- **Fonts**: `microtype` with T1 but without `lmodern` triggers a "font expansion" error on some installs; keep `lmodern`.
- **Hyphenation**: for a word that breaks badly, add `\hyphenation{pa-ra-lel}` in the preamble; the middle dot of `l·l` is never a break point, which is the desired behaviour.
- **Bibliography**: `biblatex` with `backend=biber` needs biber to run; classic BibTeX needs `bibtex`. Do not mix them.
