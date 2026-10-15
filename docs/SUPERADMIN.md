# Superadministrador GALEEN

Ruta de acceso: /login

En Vercel > galeen > Settings > Environment Variables configure:

- SUPERADMIN_USERNAME: nombre de usuario. Valor inicial configurado: superadmin.
- SUPERADMIN_PASSWORD: contraseña en texto normal almacenada en una variable de entorno de tipo Encrypted (solo servidor).
- AUTH_SECRET: secreto aleatorio independiente de 32 bytes o más, usado exclusivamente para firmar cookies de sesión.

Nunca use NEXT_PUBLIC_ para ninguna de las tres variables y nunca suba contraseñas a GitHub.

La aplicación incluye sesiones firmadas HMAC-SHA256 con cookie HttpOnly, Secure en producción y SameSite Strict; expiran a las 8 horas. La contraseña no queda dentro de la cookie. Sin las tres variables, el panel permanece cerrado y el formulario responde con error de configuración.

Si se modifica una variable, haga Redeploy para incorporar las variables al runtime activo.

Seguridad: aplicar reglas de limitación de intentos y bloqueo de automatizaciones para POST /api/admin/login en Vercel Firewall antes de abrir el acceso públicamente. Las cuentas de instituciones y el RBAC todavía no están implementados. El usuario superadmin es la identidad inicial del dueño de la plataforma, no un registro en Neon.
