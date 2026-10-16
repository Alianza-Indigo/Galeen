# Accesos y administración institucional

- La raíz \`/\` es una pantalla de acceso neutral; no revela datos globales ni entra automáticamente en la cuenta superadministradora.
- \`/admin\` y \`/admin/manage\` son exclusivos del superadministrador.
- \`/member/login\` autentica a los usuarios institucionales y \`/portal\` contiene su panel operativo.
- \`/api/institution/data\` y \`/api/institution/action\` validan cada petición contra la membresía vigente y el estado activo de la organización y el usuario.
- Las operaciones institucionales se ejecutan en transacciones con contexto de organización, consultas parametrizadas y eventos de auditoría. Un usuario nunca selecciona un rol global.
- Propietario: marca, usuarios (excepto nombrar o modificar propietarios), cuotas, auditoría.
- Administrador: marca, usuarios subordinados (no propietarios ni otros administradores), cuotas, auditoría.
- Gestor: usuarios de nivel miembro/auditor y cuotas.
- Auditor: lectura de actividad y cuotas.
- Miembro: panel y resumen de la institución.
- Creación de instituciones, estados, planes, precios, límites globales y elección de administradores iniciales quedan en la consola superadministradora.
- Las invitaciones se entregan mediante un enlace de un solo uso, no por envío de correo automático.
- Los límites registrados y las conexiones existentes todavía requieren el servicio de ejecución de inferencias antes de constituir un motor de IA completo.

## Seguridad

Las rutas institucionales verifican membresía y rol en el servidor en cada operación. La ruta global conserva su cookie independiente. El rol institucional no da acceso a \`/admin\`. Cuando se incorporen identidades externas, conectar con autenticación verificada y mantener la vinculación por correo segura.
