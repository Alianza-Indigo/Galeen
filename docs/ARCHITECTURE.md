# GALEEN: arquitectura y activación

## Estado

La consola Next.js está desplegada. Este repositorio incluye un esquema de base de datos preparado para Neon, pero la migración NO está ejecutada y no existen aún sesiones ni rutas de gestión operativas. Ningún dato de prueba se presenta como real.

## Diseño multiinstitucional BYO

- Organizaciones y membresías independientes.
- Conexiones a APIs autorizadas, propiedad y bajo control de cada institución.
- Separación y cifrado de claves de proveedor. Nunca entregar secretos al navegador.
- Cuotas por institución y opcionalmente por miembro, con contabilidad en micropartes de dólar.
- Conversaciones privadas por usuario, nunca visibles automáticamente para otros integrantes de la organización.
- Licenciamiento de la plataforma con Stripe, independiente de costos de inferencia.

## Despliegue Vercel

- Frontend y API: Next.js en Vercel.
- Persistencia: Neon PostgreSQL. Jamás almacenar cuotas ni claves en estado de memoria o archivos locales de Vercel.
- LLM: API oficial habilitada por el cliente con adaptadores server-side y streaming compatible.
- Adjuntos: Vercel Blob con autorización por tenant.
- Procesamiento asíncrono: colas durables solo si es necesario; no confiar en procesos residentes.

## Seguridad y límites

1. Verificar identidad y organización en el servidor antes de establecer el contexto de tenant.
2. Usar un rol Postgres de aplicación sin permisos de propietario/superusuario/BYPASSRLS.
3. Encapsular la ejecución del query en una transacción que ejecute SET LOCAL galeen.tenant_id después de autorizar al usuario.
4. La política RLS protege límites organizacionales, NO reemplaza controles individuales de propiedad y RBAC.
5. La tabla de credenciales requiere cifrado autenticado, nonce único y versionado de claves; la clave maestra se guarda fuera de Neon.
6. Aplicar reservas transaccionales de cuota con bloqueos/idempotencia, conciliando resultados, fallas y vencimientos. Los límites no están implementados todavía.
7. Ninguna ruta administrativa debe activarse hasta contar con pruebas de aislamiento multi-tenant y privilegios.
8. No habilitar conexiones de cuentas o suscripciones personales sin un mecanismo y autorización adecuados del proveedor.

## Neon

1. Conectar Neon a GALEEN en Vercel y configurar DATABASE_URL por ambiente. No pegar secretos en conversaciones ni en commits.
2. Crear roles distintos para migración y aplicación y revisar privilegios.
3. Ejecutar db/migrations/001_initial.sql únicamente sobre base nueva y autorizada.
4. Agregar autenticación de usuarios y prueba de sesiones, incluyendo permisos administrativos.
5. Probar aislamiento cruzado de tenants; un usuario de institución A no puede leer ni modificar registros de B.
6. Agregar adaptadores de inferencia, cuota transaccional, facturación y administración real.

Nota: la presencia de una variable de entorno no demuestra conectividad. Es necesaria una comprobación real de DB, migraciones y control de acceso.
