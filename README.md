# GALEEN

SaaS multiinstitucional para administrar el acceso de organizaciones a herramientas de inteligencia artificial, desarrollado con Next.js, Neon PostgreSQL y Vercel.

## Dos modalidades, bajo control del cliente

1. **Cuentas y suscripciones**. Tres opciones en el panel de Recursos de IA: (a) cuentas personales compartidas, con asignaciones, disponibilidad, turnos y control concurrente dentro de GALEEN; (b) licencias institucionales, con administración de cupos; (c) conexiones API. El titular aporta la capacidad; la autenticación externa y el uso real de una cuenta personal dependen de un broker o conector compatible. GALEEN no recibe contraseñas ni cookies de dichas cuentas.
2. **API institucional**. La organización proporciona sus propias claves API oficiales. GALEEN las cifra en el servidor, permite probarlas, rotarlas, activarlas o desactivarlas. No se ha habilitado todavía un motor de inferencia.

El cliente es responsable de contratar su capacidad con el proveedor. Compartir una suscripción personal entre múltiples usuarios no se presume permitido ni técnicamente integrado.

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
- Cuentas compartidas: inventario, asignación a múltiples usuarios, concurrencia, reservas temporizadas, liberación y revocación. **Todavía no hay un broker que autentique esas cuentas y envíe solicitudes reales al proveedor.**
- Suscripciones institucionales: inventario y asignaciones internas de cupos; no aprovisionamiento automático.
- ElizaOS Pool: se verificó el código abierto de pool-meter, broker-proxy y codex-proxy. Su account broker central **no está publicado en ese repositorio**, por lo que falta implementar o conectar ese componente para compartir capacidad real.
- Pendientes: integración real del broker y el motor de inferencia, pruebas end-to-end de cuentas reales y aislamiento multiinstitucional, facturación y portal de IA.
- No se debe presentar la asignación de cupos de GALEEN como una licencia confirmada por OpenAI, Anthropic, Google o Microsoft.

## Desarrollo

`npm install` y `npm run dev`. Revisar `db/README.md` y `docs/ARCHITECTURE.md` para esquemas, migraciones y restricciones de seguridad.

Repositorio: `Alianza-Indigo/Galeen`, rama `main`. Proyecto de Vercel: `galeen`.
