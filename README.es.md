[English](README.md) · [Português](README.pt-BR.md) · **Español**

<p align="center">
  <img src="https://raw.githubusercontent.com/Sassine/devin-memory/main/banner.png" alt="devin-memory — Memoria + contexto para el Devin CLI" />
</p>

No vuelvas a perder una sesión del Devin CLI. **devin-memory** monitorea el uso de tu
contexto, te avisa *antes* de que la ventana se llene y te permite guardar y retomar la
sesión — para que `/clear` deje de significar "empezar de cero".

> Proyecto comunitario no oficial, **sin afiliación con Cognition AI**.
> "Devin" es una marca de Cognition AI.

## Instalación

Desde la raíz de tu proyecto:

```sh
npx devin-memory@latest setup
```

Eso es todo. Todo se instala en `.devin/` — sin dependencias, sin servidores, nada
corriendo en segundo plano. npm es solo el instalador; en runtime todo es local y offline.

<sub>¿Sin npm? Clona el repo y ejecuta `node scripts/install.js`.</sub>

## Cómo funciona

1. **Trabaja normalmente.** En cada prompt, un hook estima qué tan lleno está el contexto.
2. **Pasado el ~75% recibes un aviso** — el agente te recuerda, en tu idioma, guardar.
3. **`/memory-save`** (o simplemente di *"guardar memoria"*) → el estado de la sesión se
   escribe en un snapshot markdown: objetivo, progreso, decisiones, archivos, próximos pasos.
4. **`/clear`** — sin ansiedad.
5. **`/memory-resume`** (o *"continúa donde lo dejamos"*) → el agente recarga el
   snapshot, relee los archivos relevantes y sigue exactamente donde paraste.

<p align="center">
  <img src="https://raw.githubusercontent.com/Sassine/devin-memory/main/docs/alert-screenshot.png" alt="El aviso de devin-memory en el Devin CLI con ~84% de uso de contexto" />
  <br>
  <sub>El aviso en acción — el agente te recuerda en el idioma en que estés escribiendo.</sub>
</p>

Los snapshots son markdown puro en `.devin/memory/snapshots/` — legibles por ti, por
cualquier agente, y commiteables para que tu equipo (o la sandbox en la nube) también
los reciba.

Funciona en español, inglés y portugués — el agente siempre responde en el idioma en
que escribes.

## Opciones

| Flag | Qué hace |
|---|---|
| `--scope user` | Instala el motor una vez, global, en lugar de por proyecto |
| `--memory user` | Mantiene los datos de memoria fuera del repo (en `~/.devin-memory/`) |
| `--lang en\|pt-BR\|es` | Fija el idioma de los mensajes de terminal |

Ejemplo: `npx devin-memory@latest setup --scope user --lang es`

## Desinstalación

```sh
npx devin-memory@latest uninstall          # quita el sistema, CONSERVA tus snapshots
npx devin-memory@latest uninstall --purge  # quita todo, snapshots incluidos
```

## Bueno saber

- La estimación de uso es heurística (caracteres, no tokens reales) — `/context` sigue
  siendo el número oficial.
- El `/clear` sigue siendo tuyo; el sistema no puede limpiar por ti.
- Ejecuta `setup` en cada máquina — el registro del hook es local a la máquina.

¿Curiosidad por los detalles internos (schema del hook, alcances de instalación, i18n,
peculiaridades del CLI)? Mira la [referencia técnica](docs/TECHNICAL.md) (en inglés).

## Licencia

MIT — ver [LICENSE](LICENSE).
