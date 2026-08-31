# Seguridad de 787 Barber Studio

El sistema aplica defensa en profundidad, pero ningún sistema puede prometer riesgo cero. Este documento describe los controles implementados y los requisitos operativos que no deben relajarse al publicar.

## Fronteras de confianza

- El panel administrativo confía únicamente en la sesión verificada en servidor. No acepta un usuario, email, negocio ni rol enviados por el cliente.
- La autorización se vuelve a comprobar en el servidor para cada API administrativa.
- Todas las consultas privadas incluyen `business_id`; los `JOIN` también verifican el mismo negocio.
- La reserva pública solo expone catálogo y disponibilidad. La API administrativa, que contiene datos personales, exige identidad y rol.

## Controles implementados

- Autenticación propia sobre Workers y D1: contraseñas guardadas como hash con sal única, sin proveedores externos de identidad.
- Roles base: propietario, administrador, recepción y profesional.
- Accesos creados por el propietario con contraseña temporal de un solo uso.
- Bootstrap atómico: solo el primer usuario registrado de una instalación vacía puede convertirse en propietario.
- Protección de mismo origen para mutaciones contra CSRF.
- Validación estricta de formato, longitud, tipo de contenido y tamaño del cuerpo.
- Rate limiting persistente por identidad, IP seudonimizada y email seudonimizado.
- Honeypot y tiempo mínimo de interacción en la reserva pública.
- Idempotencia para impedir duplicados por reintentos.
- Bloqueos atómicos de agenda en intervalos de cinco minutos para evitar carreras y solapamientos.
- Auditoría de altas de propietario, citas, invitaciones y cambios de permisos.
- Respuestas de error genéricas; los detalles internos no se devuelven al navegador.
- Cabeceras CSP, HSTS, `nosniff`, `DENY` para iframes, política de referencias y permisos restrictivos.
- API antigua que exponía citas retirada con HTTP 410.

## Reglas de operación

1. Mantener el panel en un despliegue privado. Si la reserva debe ser pública, separarla en otro Site o configurar una política que exponga únicamente esa superficie.
2. El primer acceso al despliegue nuevo debe hacerlo el propietario real. Después, verificar el evento `security.owner_bootstrapped` en el Centro de seguridad.
3. Invitar empleados desde Usuarios y roles; nunca compartir una cuenta.
4. Asignar el rol mínimo necesario y suspender accesos al terminar una relación laboral.
5. Configurar copias de seguridad y retención de D1 en la plataforma. El código no puede garantizar por sí solo una copia externa.
6. Revisar periódicamente auditoría, dependencias, alertas de la plataforma y políticas de acceso.
7. Para pagos, mensajería o archivos futuros, usar proveedores especializados; no guardar tarjetas, tokens o secretos en D1 ni en el repositorio.

## Respuesta a incidentes

Ante un acceso sospechoso: restringir el despliegue, suspender al miembro afectado, revisar auditoría, rotar credenciales de integraciones, conservar evidencia y notificar a las personas afectadas según la normativa aplicable. No borrar registros antes de completar la investigación.
