# GALEEN

Plataforma SaaS multiinstitucional BYO para la administraci贸n de capacidad de IA de escuelas, universidades, empresas y organizaciones.

## Estado de esta entrega

El panel Next.js y el endpoint GET /api/health est谩n desplegables. Se presentan exclusivamente valores reales de arranque (cero instituciones, cero usuarios, cero conexiones); ninguna acci贸n de administraci贸n simula persistencia.

**NO es un SaaS listo para producci贸n ni un servicio de inferencia habilitado.** A煤n no existen base de datos vinculada, control de acceso operativo, cifrado de secretos, motor de despacho, pasarela de pagos ni aislamiento probado. Su activaci贸n requiere las siguientes fases:

1. Conectar Neon PostgreSQL y definir migraciones multi-tenant.
2. Implementar sesiones, verificaci贸n de identidad, RBAC y superadmin.
3. Crear una b贸veda segura para las claves API BYO con cifrado y rotaci贸n.
4. Implementar el AI gateway autorizado, medici贸n y reserva at贸mica de cuota.
5. Implementar panel institucional, chat privado, facturaci贸n Stripe, dominios y auditor铆a.
6. Pruebas funcionales, de concurrencia, seguridad, aislamiento y recuperaci贸n.

## BYO y l铆mites del modelo

Cada instituci贸n gestiona sus propias conexiones. 脷nicamente se deben integrar API y servicios cuyo contrato autorice el uso institucional previsto; no presupone que la suscripci贸n personal de ChatGPT/Claude sea redistribuible.

## Arquitectura objetivo

- Next.js / TypeScript alojado en Vercel
- Neon Postg痘玘