# Correos de autenticación con Resend

El flujo es **Supabase Auth → hook firmado del LMS → API de Resend → correo**.
Supabase genera y verifica los tokens; la API key de Resend solo sirve para entregar
los mensajes. El hook conserva la marca de la escuela y el idioma del enlace.
No necesitas configurar SMTP ni crear otra Edge Function.

## 1. Configurar las variables

En `.env.local` (desarrollo) y en el entorno del servidor (producción):

```dotenv
RESEND_API_KEY=re_tu_clave_privada
EMAIL_FROM="LMS <noreply@tu-dominio-verificado.com>"
SEND_EMAIL_HOOK_SECRET="v1,whsec_secreto_del_hook"
```

`EMAIL_FROM` debe ser una dirección completa, no solo `tu-dominio.com`. El dominio
se verifica en Resend con sus registros DNS. Una clave con permiso **Sending
access** para ese dominio basta; no hace falta dar acceso de lectura o administración.
Las variables existentes de Supabase, incluida `SUPABASE_SERVICE_ROLE_KEY`, siguen
siendo necesarias: el hook consulta la escuela para renderizar su marca. Todas las
claves privadas quedan en el servidor; nunca llevan el prefijo `NEXT_PUBLIC_`.

Para generar un secreto de firma local si falta y comprobar la configuración:

```bash
npm run email:setup
npm run email:check
```

El comando guarda el secreto en `.env.local` sin mostrarlo. Si `EMAIL_FROM` contiene
solo un dominio, `email:setup` lo convierte en `LMS <noreply@ese-dominio>`.
El diagnóstico comprueba presencia y formato; no demuestra por sí solo que el hook
esté activado o que el dominio esté verificado.

## 2. Desarrollo local con correos reales

Con Docker funcionando y las variables configuradas:

```bash
npm run email:setup -- --local --restart
npm run dev
```

Usa `http://default.lvh.me:3000/es/auth/forgot-password` o el subdominio de tu escuela.
La app debe estar disponible en el puerto **3000**. Supabase llama desde Docker a
`http://host.docker.internal:3000/api/auth/send-email-hook`. En Linux, el host necesita
el alias `host.docker.internal` apuntando al gateway del host.

El comando carga `.env.local` para el CLI, activa temporalmente el bloque del hook y
reinicia Supabase **conservando los datos**. Restaura después la configuración base:
la instancia arrancada mantiene el hook activo, mientras el archivo del repositorio
sigue sirviendo para pruebas sin credenciales. Repite el comando después de parar
Supabase si quieres volver a usar Resend. No reinicies una instancia que esté usando
otro agente o una prueba local.

Cuando el hook está activo, los correos salen por Resend y **no aparecen en Mailpit**.
Para volver al modo de desarrollo sin proveedor externo, arranca Supabase con la
configuración base (hook comentado):

```bash
supabase stop
supabase start
```

Para ver el buzón local, ejecuta `supabase status` y abre su Mailpit URL. No uses
`supabase stop --no-backup` ni `supabase db reset` para cambiar de modo: borrarían datos.

## 3. Activar el hook en Supabase alojado

1. Despliega esta versión de la app con `RESEND_API_KEY` y `EMAIL_FROM`.
2. En Supabase, abre **Authentication → Hooks → Send Email** y crea un hook HTTP:
   `https://tu-dominio-publico.com/api/auth/send-email-hook`.
3. Configura el secreto del hook y `SEND_EMAIL_HOOK_SECRET` del servidor con **el
   mismo valor** `v1,whsec_...`. Si el panel genera otro secreto, usa ese valor en el
   despliegue. El secreto local no configura automáticamente el proyecto alojado.
4. Reinicia o vuelve a desplegar la app con ese secreto y habilita el hook. La URL debe
   ser accesible desde Supabase, sin un login adicional del proxy/CDN.
5. Mantén habilitado el proveedor **Email** en Supabase Auth. Con el hook activo,
   Supabase usa el hook y no usa SMTP; las plantillas se renderizan en este repo.
6. En **Authentication → URL Configuration**, configura la Site URL pública y permite
   las URLs de recuperación de las escuelas, incluyendo los prefijos `/es/` y `/en/`.
   Para una plataforma que administra subdominios, permite solo sus propios hosts,
   por ejemplo `https://*.tu-plataforma.com/**`. Añade los dominios personalizados de
   escuelas explícitamente. No permitas destinos externos arbitrarios.
7. En **Authentication → Rate Limits**, ajusta el límite de correos al volumen que
   permita tu plan de Resend. El límite del proveedor incluido de Supabase (2/hora)
   se puede configurar con SMTP propio **o con Send Email Hook**. Mantén límites por
   usuario/IP para evitar abuso; las cuotas de Resend también siguen aplicando.

No pongas el secreto de firma en la URL ni envíes la API key de Resend a Supabase:
Supabase solo necesita la URL del hook y el secreto de firma. La API key está en la app.

## 4. Comprobar el envío

Prueba del transporte usando una dirección oficial de pruebas de Resend:

```bash
npm run email:check -- --to delivered@resend.dev
```

Esta dirección permite probar la API sin enviar a una persona. Para comprobar la
llegada a tu bandeja, usa una dirección tuya:

```bash
npm run email:check -- --to tu-correo@ejemplo.com
```

Prueba del flujo real de recuperación para una cuenta existente:

```bash
npm run email:check -- --recovery tu-correo@ejemplo.com --origin https://tu-escuela.tu-plataforma.com
```

En local, sustituye el origen por `http://default.lvh.me:3000`. Abre el correo más
reciente y cambia la contraseña; luego comprueba el inicio de sesión con ella.
Los enlaces del hook usan `/es/auth/confirm?token_hash=...&type=recovery`, crean la
sesión y abren el formulario de contraseña en la misma escuela. También se pueden
abrir en otro navegador: no dependen de un verificador PKCE guardado en el navegador
que pidió la recuperación.

La respuesta exitosa de Supabase no revela si una cuenta existe. Un correo sin
cuenta asociada no produce un envío. Los registros `[email] Resend accepted the
message` incluyen el ID del proveedor y demuestran **aceptación**, no entrega final.
En el panel de Resend, revisa `Delivered`, `Bounced`, `Failed` o `Suppressed`, además
de la bandeja y spam. Una clave solo de envío no permite consultar estos registros
por API. Desactiva el seguimiento de enlaces para los correos de autenticación si
lo habilitaste: puede modificar los enlaces de verificación.

## Errores frecuentes

| Síntoma | Qué revisar |
| --- | --- |
| Resend rechaza el envío | Dominio verificado, remitente completo, permisos de API key y cuota. |
| Firma inválida / HTTP 401 | Mismo `SEND_EMAIL_HOOK_SECRET` en el hook y el servidor; formato `v1,whsec_...`. |
| Timeout del hook | App accesible desde Supabase/Docker; puerto 3000; proxy/CDN; latencia de base de datos o proveedor. |
| La solicitud funciona pero no hay envío en Resend | Cuenta inexistente, hook deshabilitado o solicitud contra otro proyecto de Supabase. |
| Llega el correo pero vuelve a otro dominio | Site URL y lista permitida de redirects; la URL de recuperación debe pertenecer a la escuela. |
| Enlace vencido o usado | Pide uno nuevo desde la pantalla de recuperación y usa el correo más reciente. |
| Correo aceptado pero no aparece | Revisa entrega/rebote/supresión en Resend y la carpeta spam. |

El hook verifica la firma antes de enviar. Si el proveedor falla, devuelve un error a
Supabase, para que el formulario no prometa un envío que no ocurrió. Las claves de
idempotencia evitan duplicados al reintentar el mismo mensaje, incluidos los cambios
de correo que necesitan enviar a dos direcciones. Los logs no imprimen API keys,
OTP, token hashes, payloads completos ni cuerpos de error del proveedor.

Referencias oficiales:

- [Send Email Hook y ejemplo con Resend](https://supabase.com/docs/guides/auth/auth-hooks/send-email-hook)
- [Rate limits de Supabase Auth](https://supabase.com/docs/guides/auth/rate-limits)
- [API de envío de Resend](https://resend.com/docs/api-reference/emails/send-email)
- [URLs de retorno de Supabase](https://supabase.com/docs/guides/auth/redirect-urls)
