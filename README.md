# GALEEN

SaaS multiinstitucional para administrar el acceso de organizaciones a herramientas de inteligencia artificial, desarrollado con Next.js, Neon PostgreSQL y Vercel.

## Dos modalidades, bajo control del cliente

1. **Cuentas y suscripciones**. Tres opciones en el panel de Recursos de IA: (a) cuentas personales compartidas, con asignaciones, disponibilidad, turnos y control concurrente dentro de GALEEN; (b) licencias institucionales, con administración de cupos; (c) conexiones API. El titular aporta la capacidad; la autenticación externa y el uso real de una cuenta personal dependen de un broker o conector compatible. GALEEN no recibe contraseñas ni cookies de dichas cuentas.
2. **API institucional**. La organización proporciona sus propias claves API oficiales. GALEEN las cifra en el servidor, permite probarlas, rotarlas, activarlas o desactivarlas. No se ha habilitado todavía un motor de inferencia.

La institución aporta y administra sus propios recursos de IA y responde por su utilización. GALEEN ya incluye un broker local integrado que ejecuta solicitudes a través de agentes; su capacidad real con sesiones personales sigue pendiente de verificarse.

## Rutas actuales

- `/`: entrada general
- `/login`: inicio de sesión del superadministrador
- `/admin`: consola general
- `/admin/manage`: instituciones, usuarios, planes y cuotas
- `/member/login`: inicio de sesión institucional
- `/portal`: portal institucional y sus dos modalidades de recursos de IA

## Persistencia

Las migraciones PostgreSQL viven en `db/migrations` y las aplica `scripts/migrate.mjs` durante el build de producción. El runner registra los checksums y aborta el despliegue si una migración falla.

La conexión de PostgreSQL y los secretos deben gestionarse como variables cifradas de Vercel; jamás en el repositorio ni en el navegador.

## Límites operativos

- Administración institucional, roles, invitaciones, marca blanca y auditoría están implementados en el backend.
- Conexiones API: almacenamiento y verificación de credenciales, pero **sin procesamiento de prompts ni consumo**.
- Cuentas compartidas: inventario, asignación a múltiples usuarios, concurrencia, reservas temporizadas, liberación y revocación. **Existe un broker local integrado que administra trabajos y ejecuta los CLI en el equipo del titular; su funcionamiento con cuentas reales sigue pendiente de prueba.**
- Suscripciones institucionales: inventario y asignaciones internas de cupos; no aprovisionamiento automático.
- ElizaOS Pool: se verificó el código abierto de pool-meter, broker-proxy y codex-proxy. Su account broker central **no está publicado en ese repositorio**, por lo que falta implementar o conectar ese componente para compartir capacidad real.
- Pendientes: pruebas end-to-end con cuentas reales, validación de concurrencia efectiva, inferencia por API, modelos autoalojados y facturación.
- No se debe presentar la asignación de cupos de GALEEN como una licencia confirmada por OpenAI, Anthropic, Google o Microsoft.

## Desarrollo

`npm install` y `npm run dev`. Revisar `db/README.md` y `docs/ARCHITECTURE.md` para esquemas, migraciones y restricciones de seguridad.

Repositorio: `Alianza-Indigo/Galeen`, rama `main`. Proyecto de Vercel: `galeen`.

## Motor ElizaOS Pool para cuentas compartidas

GALEEN puede registrar un origen único del servicio `pool-meter` usando `GALEEN_POOL_ORIGIN=https://pool.tudominio.com`. El administrador institucional guarda su clave de acceso al pool, que se cifra en Neon; los miembros **no** reciben esa clave.

Flujo implementado: guardar clave y modelo, probar acceso a `/meter/me`, activar la cuenta compartida, reservar turno, enviar texto por `/v1/messages` (Anthropic) o `/openai/v1/responses` (OpenAI), registrar el resultado y liberar turno. Existe exclusión de peticiones paralelas por reserva y un límite mensual básico por institución, pero la conciliación completa con el proveedor no está integrada.

El servicio remoto `pool-meter`, sus proxies y el *account broker* que sostiene las cuentas **no** están desplegados por GALEEN. El account broker original de ElizaOS Pool no forma parte del repositorio público; esta integración es un adaptador de protocolo, no una copia ni una instalación de ese componente ausente. Tampoco se sincronizan cuentas personales automáticamente. Para probar inferencia real hacen falta una instancia operativa de ese motor, su broker compatible, una cuenta conectada y una clave de pool válida.

Las conexiones API oficiales, las cuentas con licencias y las cuentas personales compartidas permanecen como opciones independientes. No ingresar contraseñas de los proveedores en GALEEN.
