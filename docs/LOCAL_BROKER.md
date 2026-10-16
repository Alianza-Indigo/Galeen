# Motor local integrado a GALEEN (experimental)

El módulo vive en **este mismo repositorio Next.js**, reutilizando \`app_users\`, \`organization_members\`, \`shared_account_resources\`, \`shared_account_members\` y \`shared_account_reservations\`. No requiere otra cuenta administrativa ni una base de datos separada.

## Activación

1. El proyecto Vercel necesita la migración \`007_local_personal_broker.sql\` aplicada con el mecanismo habitual de GALEEN.
2. En Vercel configura \`GALEEN_LOCAL_BROKER_ENABLED=true\` únicamente en el entorno de prueba. El sistema permanece deshabilitado de forma predeterminada.
3. En el portal institucional, administra un recurso OpenAI/Anthropic y asigna los usuarios. Actívalo y reserva un turno. En su sección **Agente local GALEEN**, el administrador genera un código de vinculación de 10 minutos.
4. En la computadora del titular instala Codex CLI o Claude Code, inicia sesión con su cuenta personal localmente y ejecuta desde la raíz del repositorio:

\`\`\`bash
export GALEEN_URL=https://galeen.vercel.app
export GALEEN_PAIRING_CODE=CODIGO_DEL_PORTAL
node broker/agent/runner.mjs pair
GALEEN_AGENT_CONCURRENCY=1 node broker/agent/runner.mjs start
\`\`\`

En Windows PowerShell usa \`$env:GALEEN_URL="..."\`, \`$env:GALEEN_PAIRING_CODE="..."\`, y \`$env:GALEEN_AGENT_CONCURRENCY="1"\` en vez de \`export\`.

**La concurrencia técnica máxima es 50**, gobernada por los turnos disponibles de GALEEN y la configuración del agente. Los proveedores pueden imponer límites inferiores. Las solicitudes con suscripciones reales y el uso por terceros no han sido verificados ni autorizados por el proveedor. No almacena credenciales de terceros en Neon. Los resultados sí quedan guardados en Neon.

Esta integración no reemplaza el conector remoto \`GALEEN_POOL_ORIGIN\`; ambos pueden coexistir. No implementa automáticamente las rutas de protocolos nativos sobre el agente: el envío utiliza la interfaz interna \`/api/institution/local-broker\`.

No introduzcas en GitHub contraseñas ni archivos \`.env\` ni el archivo \`~/.galeen/broker-agent.json\`.
