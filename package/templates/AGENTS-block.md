<!-- BEGIN devin-memory v1 -->
## Persistent memory system (devin-memory)

This project has a custom memory system. Always consider using it.
Always respond to the user in the language they are writing in.

### When the user signals they will clear context or pause
Trigger the **memory-save** skill. Trigger phrases:
- pt-BR: "salva memória", "salvar memória", "salva o contexto", "preciso limpar", "vou dar clear"
- en: "save memory", "save context", "memory save", "i need to clear"
- es: "guardar memoria", "guarda el contexto", "necesito limpiar", "voy a limpiar"

### When the user returns and wants to continue
Trigger the **memory-resume** skill. Trigger phrases:
- pt-BR: "continua de onde paramos", "retoma", "carrega memória"
- en: "continue where we left off", "resume", "restore context", "load memory"
- es: "continúa donde lo dejamos", "retoma", "carga la memoria", "restaurar contexto"

### Automatic hook
A hook monitors estimated context usage on every prompt and injects `<system_guidance>`
past ~75%. **Respect** these injections — proactively remind the user (in their language)
about memory-save.
<!-- END devin-memory v1 -->
