---
name: latex-catalan-pdflatex
description: Write LaTeX source (.tex) for pdfLaTeX, in Catalan by default, without ever compiling it, because the user builds the PDF themselves. Use this skill whenever the user asks to write, draft, extend, fix, translate, restructure or format a LaTeX document, article, report, thesis, assignment, lab report, notes, CV, letter or Beamer presentation, or pastes .tex code or a pdflatex error log, even if they do not say "LaTeX" and only say they want a document to compile, upload to Overleaf, or typeset. Also use it for questions about Catalan typography in LaTeX (babel, quotes, l·l, decimal comma, units, theorem names). Do not use it for Word, PDF-editing, or Markdown-only tasks.
---

# LaTeX for pdfLaTeX, written in Catalan

The user compiles the document themselves with **pdfLaTeX**, and usually writes in **Catalan**. Your job is to produce clean `.tex` source that compiles on the first try on a standard, current TeX Live or Overleaf installation. Everything below follows from those two facts.

## What to deliver

- Deliver **source only**. Do not run pdflatex, do not produce a PDF, and do not say a document "compiles" or "was tested" unless you really ran it. Say "I have not compiled it" if the question comes up.
- If you can create files, save the result as a `.tex` file (a standalone document of more than a few lines is always a file). If not, give one complete fenced `latex` block containing the whole document, not fragments, so the user can copy it in one go. Fragments are fine only when the user asked to modify an existing file.
- After the source, add **one short line about building** only if the document needs more than a single pdflatex run. For example: "Run pdflatex twice for the table of contents and references", or "Run pdflatex, biber, pdflatex, pdflatex" when biblatex is used. Skip it for simple documents.
- Reply in the language the user is writing in. The **document text** is Catalan unless the user asks for another language. Code comments follow the user's language.

## Start from the template

`assets/template-article.tex` is a tested preamble: T1 + utf8 + `babel` (catalan), `lmodern`, `microtype`, `geometry`, `csquotes` with a Catalan quote style, `siunitx` with decimal comma, `amsmath/amssymb/amsthm` with Catalan theorem names, `graphicx`, `booktabs`, `hyperref`. Copy its preamble and adapt it instead of inventing a new one each time. Remove packages the document does not use, because each extra package is a chance of a conflict.

Choose the class from the content:
- `article`: papers, assignments, short reports (default).
- `report` or `book`: anything with chapters or a thesis structure. Use `\chapter`.
- `beamer`: presentations. Keep the same language and encoding lines.
- `scrlttr2` (KOMA-Script): formal letters.

If the user already has a preamble or a university/journal class, keep it exactly and write only what is asked. Never switch their class, engine, bibliography backend or fonts.

## pdfLaTeX constraints (why they matter)

pdfLaTeX is not Unicode-native, so anything written for XeLaTeX or LuaLaTeX can fail with obscure errors. Therefore:

- Always load `\usepackage[T1]{fontenc}` and `\usepackage[utf8]{inputenc}` (before babel), plus `lmodern` so T1 text uses scalable fonts.
- Never use `fontspec`, `unicode-math`, `polyglossia`, `\directlua`, `luacode`, or system fonts. For other fonts, use pdfLaTeX-compatible packages, for example `\usepackage{newtxtext,newtxmath}` or `\usepackage{libertine}`, and only if the user asks.
- Catalan letters (à è é í ï ò ó ú ü ç ·) are fine as plain UTF-8 text. Other characters (Greek, arrows, math symbols such as →, ≤, ∞) are not safe in text: use math mode (`$\to$`, `$\leq$`) or text commands (`\textrightarrow`, `\texteuro`).
- Put `hyperref` near the end of the preamble, and `cleveref`/`bookmark` after it. Do not load packages that conflict with it in the wrong order.
- Use current commands: `\textbf{}`, `\textit{}`, `\emph{}` (not `\bf`, `\it`); `\[ ... \]` (not `$$`); `align` (not `eqnarray`); `\usepackage{...}` once per package; `\newcommand` for macros.
- For references use `biblatex` with `backend=biber` only when there is a bibliography to manage, and say that biber must run. If the user uses BibTeX, keep `\bibliographystyle` and `\bibliography`.

## Catalan rules

Read `references/catalan-typography.md` whenever the document contains quotations, numbers with units, dates, ordinals, theorems, cross-references or maths, which is almost always. The essentials:

- Load `babel` with the `catalan` option, so hyphenation, captions (Índex, Resum, Taula, Figura, Bibliografia, Demostració) and `\today` are Catalan.
- Quotation marks: `\enquote{...}` with the Catalan style from the template. Never type a straight `"`: it can clash with babel shorthands and is wrong typographically.
- Write `l·l` with the real middle dot (`col·legi`, `paral·lel`), never `l.l` or `l-l`.
- Titles and headings use sentence case: only the first word and proper nouns are capitalised. Months, days and languages are lowercase.
- Decimal comma and thin-space thousands via `siunitx` (`\num{1234,5}`, `\SI{2,5}{\kilo\gram}`). In plain math mode write a decimal comma as `{,}`.

## Writing and checking

1. If the request is missing something that changes the structure (document type, length, bibliography yes/no), ask at most one short question. Otherwise state your assumption in one line and write.
2. Write the whole document in one coherent pass: sections with `\label`, references with `~\ref{}` (non-breaking space before the number), captions on every figure and table, and `\includegraphics` paths that are clearly placeholders if the file is not known (say so).
3. Before replying, re-read the source as a compiler would. Check that every `\begin` has its `\end`, braces balance, every command comes from a loaded package, every `\ref` has a `\label`, no straight `"` quotes, no unescaped `& % $ # _ { } ~ ^ \` in text (write `\&`, `\%`, `\$`, `\#`, `\_`), and no bare Unicode symbols outside T1.
4. When editing the user's own file, change as little as possible, keep their macros and style, and say what you changed.

## When the user pastes an error

Ask for nothing you can infer. Read the first `!` error and the line number, explain the cause in one or two sentences, and give the corrected lines. The usual suspects with Catalan and pdfLaTeX are: a missing `\usepackage[T1]{fontenc}` or `inputenc`; a Unicode character outside T1; a `"` clashing with babel; a missing `lmodern` with `microtype` ("font expansion" error); a `.aux` file left over from a previous error (suggest deleting the auxiliary files and rebuilding); and a package loaded after `hyperref` that should come before it.
