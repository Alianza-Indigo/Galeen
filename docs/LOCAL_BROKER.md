# Motor local integrado a GALEEN (experimental)

El módulo vive en **este mismo repositorio Next.js**, reutilizando `app_users`, `organization_members`, `shared_account_resources`, `shared_account_members` y `shared_account_reservations`. No requiere otra cuenta administrativa ni una base de datos separada.

## Activación

1. El proyecto Vercel necesita la migración `007_local_personal_broker.sql` aplicada con el mecanismo habitual de GALEEN.
2. El broker local está integrado y disponible automáticamente en el portal; no necesita una variable de habilitación. La migración 007 debe estar aplicada.
3. En el portal institucional, administra un recurso OpenAI/Anthropic y asigna los usuarios. Actívalo y reserva un turno. En su sección **Agente local GALEEN**, el administrador genera un código de vinculación de 10 minutos.
4. En la computadora del titular instala Codex CLI o Claude Code, inicia sesión con su cuenta personal localmente y ejecuta desde la raíz del repositorio:

```bash
export GALEEN_URL=https://galeen.vercel.app
export GALEEN_PAIRING_CODE=CODIGO_DEL_PORTAL
node broker/agent/runner.mjs pair
GALEEN_AGENT_CONCURRENCY=50 node broker/agent/runner.mjs start
```

En Windows PowerShell usa `$env:GALEEN_URL="..."`, `$env:GALEEN_PAIRING_CODE="..."`, y `$env:GALEEN_AGENT_CONCURRENCY="50"` en vez de `export`.

**La concurrencia técnica máxima es 50**, gobernada por los turnos disponibles de GALEEN y la configuración del agente. Los proveedores pueden imponer límites inferiores. La ejecución real se debe validar con las sesiones instaladas en el equipo; una compilación correcta no demuestra 50 solicitudes concurrentes aceptadas por el proveedor. No almacena credenciales de terceros en Neon. Los resultados sí quedan guardados en Neon.

Esta integración no reemplaza el conector remoto `GALEEN_POOL_ORIGIN`; ambos pueden coexistir. No implementa automáticamente las rutas de protocolos nativos sobre el agente: el envío utiliza la interfaz interna `/api/institution/local-broker`.

No introduzcas en GitHub contraseñas ni archivos `.env` ni el archivo `~/.galeen/broker-agent.json`.

## Verificación funcional

1. Acceder al portal institucional y crear un recurso **OpenAI** o **Anthropic**, asignar al usuario y reservar turno. El recurso debe estar activo.
2. Generar el código temporal de vinculación. Solo dura 10 minutos para el **primer emparejamiento**; el agente guarda posteriormente un token persistente que se puede revocar desde el portal.
3. En la computadora del titular, instalar Codex CLI o Claude Code y verificar que el ejecutable funcione manualmente con una sesión iniciada. No se copian sesiones ni cookies a GALEEN.
4. Ejecutar `node broker/agent/runner.mjs pair` con `GALEEN_URL` y `GALEEN_PAIRING_CODE`. Luego iniciar `node broker/agent/runner.mjs start`.
5. El estado del agente debe mostrar **En línea** en el portal. Enviar un mensaje con turno activo y comprobar el cambio de `queued` a `running` y `completed`, o un error legible si falla el CLI.
6. Comprobar que revocar el agente interrumpe nuevas capturas de trabajos; después repetir con múltiples usuarios para verificar la concurrencia configurada de forma incremental.

Si falla la comunicación con Vercel, el agente reintenta las capturas transitoriamente; errores de autenticación requieren volver a vincularlo. El proceso debe permanecer encendido, por ejemplo, como servicio administrado por el sistema operativo. **50 es el máximo configurado, no una medición de capacidad real.**
