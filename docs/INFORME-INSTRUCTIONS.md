# Informe Creation

> **Goal:** Update the LaTeX report at [`@informe/informe.tex`](informe/informe.tex) so it fully documents the project.

Here's some info about the audio assets:

```text
Créditos de la música: al final de esa subsección, una frase y una tabla pequeña: «Els sons provenen de Pixabay i s’utilitzen sota la Pixabay Content License (ús gratuït, atribució no obligatòria)».

Uso	Autor	Título
Música menús	solarflex	Magic Fantasy Fairy Tale Music
Música partida	leberch	Motions to Dark Mystery
Hechizo	daviddumaisaudio	Magical Spell Cast
Victoria	pw23check	Winning
Navegación	yodguard	Wind Magic 2

En cada uno, enlace a su página de Pixabay. Para encontrarla, busca en Pixabay el título del sonido
```

---

## Modules

| Module | Description | Tech stack | Location |
|--------|-------------|------------|----------|
| **User Management** | Node.js app that renders the web interface with a view engine | Node.js, Eta | `@server` |
| **Interaction** | The main multiplayer game | Pixi.js, Colyseus | `@client` |

---

## Document Content

The report must include:

- [ ] A **detailed explanation** of what was built in **both modules**
- [ ] Special emphasis on the **multiplayer part** of each module
- [ ] An explanation of **how the two modules connect** with each other

---

## Team and Task Distribution

**Members:** Gerard, Diego, Mikolaj

Split the project into its different parts and assign them **equally** among the three members.

> **Note:** Some tasks can be assigned to **more than one member**, so the report reads as if the team worked on them together in a Discord call.

---

## Links

The document must include **three links**. For now, use blank placeholders (or `https://google.com`):

| # | Link | Points to |
|---|------|-----------|
| 1 | **Source code** | A `.zip` file containing the code of both modules |
| 2 | **Live game (client)** | The playable version of the Interaction module |
| 3 | **Live app (server)** | The deployed User Management module |