# Corteza: contexto maestro, relevamiento de Nexora y plan de producto

> Documento de continuidad para nuevas sesiones. Debe leerse antes de modificar el proyecto.

## 1. Resumen ejecutivo

El objetivo es construir un SaaS para barberías inspirado funcionalmente en el sistema observado en Nexora Barber, sin copiar su marca, código, textos propietarios ni recursos visuales. El producto propio se llama provisionalmente **Corteza**.

Se estudiaron dos superficies del sistema de referencia:

- Panel administrativo: `https://barber.nexorasoft.site/auth`
- Catálogo y reserva pública: `https://barber.nexorasoft.site/reservar/dayz`

La cuenta analizada pertenecía al negocio de demostración **Dayz**, con plan Free. Las credenciales no se guardan en este documento por seguridad.

Estado de Corteza al 1 de agosto de 2026:

- Existe una primera versión funcional y desplegada de forma privada.
- El flujo de creación de citas persiste datos en Cloudflare D1.
- Hay protección contra reservar dos citas en el mismo horario para el mismo profesional.
- El panel, la navegación y la reserva pública son responsive.
- Muchos módulos avanzados están representados visualmente, pero todavía no tienen backend completo.
- La primera dirección visual beige/terracota fue rechazada por el usuario.
- Nueva dirección visual aprobada como supuesto de trabajo: **blanco, grafito, grises fríos y azul eléctrico**, sin beige.

## 2. Principios del proyecto

1. Replicar capacidades y flujos, no identidad visual ni código de Nexora.
2. Diseñar para múltiples barberías desde el modelo de datos.
3. Mantener separados el panel privado y la reserva pública.
4. Todas las fechas y disponibilidades deben usar la zona horaria del negocio, no la del navegador.
5. La cita, el cliente, el cobro y el profesional deben estar relacionados.
6. Las acciones que afecten dinero, permisos o comunicaciones deben generar auditoría.
7. El diseño debe sentirse contemporáneo y profesional, sin beige ni estética genérica de plantilla.

## 3. Alcance observado en Nexora

### 3.1 Autenticación

Ruta observada: `/auth`

Funciones:

- Inicio de sesión con email y contraseña.
- Registro de cuenta.
- Recuperación de contraseña.
- Mensaje de contraseña mínima de ocho caracteres.
- Aceptación de términos y privacidad.
- Redirección al dashboard después del acceso.

Implicaciones para Corteza:

- Autenticación de propietarios y empleados.
- Recuperación segura de contraseña.
- Verificación de email.
- Sesiones y cierre de sesión.
- Separación estricta por negocio (`business_id`).
- Autorización según rol, no solo autenticación.

### 3.2 Navegación general del panel

#### Principal

- `/dashboard` — Dashboard
- `/turno` — Turno del Día
- `/calendar` — Agenda
- `/appointments` — Citas
- `/clients` — Clientes
- `/caja` — Caja

#### Gestión

- `/services` — Servicios
- `/professionals` — Profesionales
- `/schedule` — Horarios
- `/resources` — Estaciones o recursos

#### Reportes

- `/reports` — Reportes generales
- `/income-reports` — Reporte de ingresos
- `/commissions` — Comisiones

#### Marketing

- `/integrations` — Integraciones
- `/promotions` — Promociones
- `/loyalty` — Fidelización
- `/gallery` — Galería
- `/resenas` — Reseñas

#### Sistema

- `/users-roles` — Usuarios y roles
- `/settings` — Configuración
- `/booking-settings` — Link de reservas
- `/waitlist` — Lista de espera
- `/support` — Soporte

### 3.3 Dashboard

Elementos observados:

- Saludo contextual y fecha del negocio.
- Indicador del plan actual.
- Alerta de plan Free con días restantes y citas disponibles.
- Acciones rápidas:
  - Nueva cita.
  - Registrar cobro.
  - Ver turno.
  - Clientes.
  - Link de reservas.
  - Reportes.
  - Servicios.
- Indicadores:
  - Citas de hoy.
  - Citas por confirmar.
  - Citas completadas.
  - Ingresos de hoy.
- Gráficas de ingresos y citas con filtros día, semana y mes.
- Servicios populares.
- Próximas citas.

Reglas inferidas:

- Los datos del dashboard se agregan por zona horaria del negocio.
- Los indicadores dependen del estado de la cita y de los cobros registrados.
- El plan limita el número de citas o profesionales.

### 3.4 Turno del Día

Ruta: `/turno`

Secciones observadas:

- Resumen del día.
- En atención.
- En espera.
- Total de clientes del día.
- Recordatorios enviados.
- Walk-ins o clientes sin cita.
- Cola de espera.
- Recordatorios para mañana.
- Botón para agregar un walk-in.

Requisitos funcionales:

- Registrar llegada del cliente.
- Cambiar estados: esperando, en atención, finalizado.
- Reordenar cola.
- Convertir walk-in en cita o venta.
- Mostrar tiempo de espera estimado.
- Identificar citas del día siguiente con teléfono disponible.

### 3.5 Agenda

Ruta: `/calendar`

Funciones observadas:

- Vista semanal de calendario.
- Alternancia día, semana y mes.
- Navegación por períodos y botón Hoy.
- Filtros:
  - Profesional.
  - Servicio.
  - Estado.
  - Solo citas pendientes de revisar.
- Color por servicio.
- Contadores de citas, confirmadas y completadas.
- Estados visuales:
  - Programada.
  - Confirmada.
  - En progreso.
  - Completada.
  - Cancelada.
  - No asistió.
- Menú Nuevo:
  - Nueva cita.
  - Bloquear tiempo.

Formulario de nueva cita observado:

- Fecha.
- Hora de inicio.
- Hora de fin.
- Servicio obligatorio.
- Profesional obligatorio.
- Cliente existente o nuevo cliente.
- Nombre obligatorio.
- Teléfono opcional en el panel.
- Email opcional en el panel.
- Notas opcionales.

Formulario de bloqueo observado:

- Profesional obligatorio.
- Fecha.
- Hora inicial.
- Hora final.
- Motivo opcional.

Reglas necesarias:

- Evitar solapamientos por profesional y recurso.
- Calcular hora final desde la duración del servicio.
- Permitir sobrescribir la duración solo con permiso.
- Respetar horario semanal, descansos y bloqueos.
- Mostrar cambios en tiempo real.

### 3.6 Citas

Ruta: `/appointments`

Funciones observadas:

- Nueva cita.
- Cita recurrente.
- Indicadores de citas del día, pendientes, completadas y pendientes totales.
- Búsqueda.
- Filtros múltiples por estado, servicio y profesional.
- Listado paginado o navegable.

Formulario de cita recurrente:

- Cliente obligatorio.
- Servicio obligatorio.
- Profesional obligatorio.
- Frecuencia.
- Fecha de inicio.
- Fecha final.
- Hora.
- Notas.
- Frecuencia semanal visible como valor inicial.

Funciones aún requeridas:

- Editar cita.
- Reprogramar.
- Cancelar con motivo.
- Marcar confirmada, en progreso, completada o no asistió.
- Historial de cambios.
- Política de cancelación.
- Series recurrentes editables individualmente o completas.

### 3.7 Clientes

Ruta: `/clients`

Funciones observadas:

- Total de clientes.
- Nuevos del mes.
- Clientes activos.
- Búsqueda por nombre, email o teléfono.
- Crear cliente.
- Importar CSV.
- Exportar.

Campos del cliente:

- Nombre obligatorio.
- Email.
- Teléfono.
- Notas.

Importación:

- CSV con columnas Nombre, Email, Teléfono y Notas.
- Descarga de plantilla CSV.

Extensiones recomendadas:

- Historial de citas y consumo.
- Preferencias del cliente.
- Etiquetas.
- Consentimiento de marketing.
- Cumpleaños.
- Saldo o puntos.
- Detección y fusión de duplicados.

### 3.8 Caja, POS, inventario y gastos

Ruta: `/caja`

Estados:

- Caja cerrada.
- Caja abierta.

Apertura de caja:

- Monto inicial en efectivo.
- Hora de apertura.

Pestañas observadas:

- Caja.
- POS.
- Inventario.
- Gastos.

Indicadores:

- Total del día.
- Efectivo.
- Digital o tarjeta.
- Propinas.
- Ticket promedio.
- Balance del día.
- Ingresos.
- Egresos.
- Balance neto.
- Efectivo en caja.

Operación:

- Pendientes de cobro.
- Filtros Hoy, Ayer y Semana.
- Cobros del día.
- Exportación.

Backend faltante para Corteza:

- Apertura y cierre real de caja.
- Movimientos.
- Métodos de pago.
- Propinas.
- Descuentos.
- Productos.
- Inventario y movimientos de stock.
- Gastos con categoría y comprobante.
- Reembolsos.
- Arqueo y diferencia de caja.
- Recibos o facturas.

### 3.9 Servicios

Ruta: `/services`

Funciones observadas:

- Crear y editar servicio.
- Activar o desactivar.
- Buscar.
- Filtrar por categoría y estado.
- Exportar.
- Configurar depósito o apartado.
- Relacionar profesionales capaces de realizarlo.

Campos:

- Nombre obligatorio.
- Categoría.
- Descripción.
- Duración en minutos.
- Precio.
- Imagen de hasta 5 MB.
- Profesionales asociados.
- Estado activo.

Catálogo observado en Dayz:

| Servicio | Categoría | Duración | Precio observado |
|---|---:|---:|---:|
| Afeitado Clásico | Barba | 30 min | $150 |
| Diseño de Barba | Barba | 25 min | $120 |
| Corte + Barba | Combos | 45 min | $250 |
| Corte Clásico | Cortes | 30 min | $150 |
| Corte Infantil | Cortes | 25 min | $120 |
| High Fade | Cortes | 35 min | $180 |
| Low Fade | Cortes | 35 min | $180 |
| Mid Fade | Cortes | 35 min | $180 |
| Skin Fade | Cortes | 40 min | $200 |
| Cejas | Extras | 10 min | $50 |

Estos datos son contexto del sistema de referencia y no deben tratarse como precios definitivos de Corteza.

### 3.10 Profesionales

Ruta: `/professionals`

Funciones observadas:

- Crear, editar, activar, desactivar y eliminar profesional.
- Buscar y filtrar.
- Exportar.
- Pestañas Profesionales y Alquiler de sillas.
- Métricas de equipo.
- Restricción por plan.

Plan observado:

- Free: un profesional.
- Team: hasta cinco profesionales.
- Business: hasta diez profesionales.

Campos del profesional:

- Foto.
- Nombre obligatorio.
- Email.
- Teléfono.
- Descripción o especialidad.
- Requiere apartado.
- Servicios que puede realizar.
- Estado activo.

Perfil observado de demostración:

- Carlos Mendoza.
- Especialidades: fades, diseños y barba.
- Diez servicios asociados.

### 3.11 Horarios y disponibilidad

Ruta: `/schedule`

Flujo:

1. Seleccionar profesional.
2. Administrar horarios semanales.
3. Administrar bloqueos.

Horario observado:

- Lunes a sábado, 09:00 a 19:00.

Formulario de horario:

- Día.
- Hora de inicio.
- Hora final.

Bloqueos:

- Lista de bloqueos por profesional.
- Agregar bloqueo.
- El formulario de bloqueo completo debe considerar fecha, inicio, fin y motivo.

Futuro recomendado:

- Varios tramos por día.
- Descanso de almuerzo.
- Excepciones por fecha.
- Vacaciones.
- Feriados.
- Copiar horario entre profesionales.
- Horarios por sucursal.

### 3.12 Estaciones y recursos

Ruta: `/resources`

Funciones observadas:

- Crear recurso.
- Listar recursos.
- Activar o desactivar.

Campos:

- Nombre obligatorio.
- Tipo, con Sala como valor observado.
- Descripción.
- Estado activo.

Uso esperado:

- Sillas.
- Cabinas.
- Lavacabezas.
- Equipos compartidos.
- Evitar solapamiento de recursos durante reservas.

### 3.13 Reportes generales

Ruta: `/reports`

Indicadores y gráficos observados:

- Total de citas.
- Tasa de citas completadas.
- Clientes totales.
- Estado de citas.
- Citas por servicio.
- Citas por profesional.
- Comisiones pendientes.
- Comisiones pagadas.
- Comisiones por profesional.
- Ingresos por alquiler de sillas.
- Balance neto.
- Filtro de período.
- Exportación.

### 3.14 Reporte de ingresos

Ruta: `/income-reports`

Filtros:

- Hoy.
- Esta semana.
- Este mes.
- Este año.
- Rango personalizado desde/hasta.
- Profesional.
- Servicio.
- Método de pago.

Indicadores:

- Ingresos totales.
- Servicios.
- Productos.
- Gastos totales.
- Ganancia neta.
- Propinas.
- Tendencia de ingresos.
- Distribución por método.
- Ingresos por profesional.
- Alquiler de sillas.
- Ingresos por servicio.
- Top de servicios.

### 3.15 Comisiones

Ruta: `/commissions`

Funciones:

- Configurar comisión.
- Registros.
- Vista por profesional.
- Configuración.
- Filtros.

Columnas observadas:

- Fecha.
- Profesional.
- Precio del servicio.
- Comisión.
- Estado.
- Acciones.

Reglas requeridas:

- Comisión porcentual o fija.
- Comisión por profesional, servicio o categoría.
- Generación al completar y cobrar la cita.
- Estados pendiente y pagada.
- Lotes de pago.
- Auditoría.

### 3.16 Integraciones

Ruta: `/integrations`

Pestañas:

- WhatsApp.
- Email.
- Otras.

Plantillas:

- Recordatorios.
- Confirmación.
- Seguimiento.
- Promociones.

WhatsApp observado:

- Activar integración.
- Número en formato internacional.
- Mostrar botón en la página de reservas.
- Recordatorio un día antes.
- Recordatorio una hora antes.
- Resumen de citas de mañana, citas con WhatsApp, sin teléfono y mensajes enviados.

Pendiente:

- Proveedor real de WhatsApp.
- Plantillas aprobadas.
- Registro de entregas y errores.
- Reintentos.
- Opt-in y opt-out.
- Email transaccional.

### 3.17 Promociones

Ruta: `/promotions`

La ruta fue detectada, pero su contenido no terminó de cargar durante el relevamiento. No se debe inventar su implementación exacta.

Implementación recomendada:

- Código promocional.
- Descuento fijo o porcentual.
- Vigencia.
- Servicios elegibles.
- Límite total y por cliente.
- Solo primera visita o clientes inactivos.
- Activar o desactivar.
- Métricas de uso.

### 3.18 Fidelización

Ruta: `/loyalty`

Funciones observadas:

- Programa de puntos inicialmente desactivado.
- Activar programa.
- Recompensar visitas frecuentes.

Pendiente de definir:

- Regla de acumulación.
- Recompensas.
- Vencimiento.
- Ajustes manuales.
- Historial de movimientos.

### 3.19 Galería

Ruta: `/gallery`

Funciones:

- Agregar imagen.
- Filtrar por servicio.
- Filtrar por profesional.
- Mostrar trabajos en el catálogo público.

Requiere almacenamiento de objetos, compresión, metadatos, orden y control de visibilidad.

### 3.20 Reseñas

Ruta: `/resenas`

Funciones:

- Calificación promedio.
- Total de reseñas.
- Reseñas visibles en catálogo.
- Clientes recientes.
- Configurar URL de Google Business.
- Abrir Google.
- Copiar enlace.
- Agregar reseña manual.
- Elegir cuántas reseñas aparecen públicamente; se observaron hasta tres.
- Solicitar reseña por WhatsApp a clientes recientes.

### 3.21 Usuarios y roles

Ruta: `/users-roles`

Observado:

- Disponible en planes Team y Business.
- El plan Free solo permite un profesional.
- Roles personalizados para empleados.

Roles mínimos recomendados:

- Propietario.
- Administrador.
- Recepción.
- Profesional.
- Caja.
- Solo lectura.

Permisos mínimos:

- Ver o gestionar citas.
- Ver solo agenda propia.
- Gestionar clientes.
- Gestionar caja.
- Ver reportes financieros.
- Gestionar equipo y configuración.
- Gestionar marketing.

### 3.22 Configuración

Ruta: `/settings`

Pestañas observadas:

- General.
- Negocio.
- Facturación.
- Pagos.
- Cancelación.
- WhatsApp.
- Imágenes.

Configuración general observada:

- País.
- Zona horaria.
- Formato de hora.
- Moneda principal.
- Advertencia explícita: el sistema no usa la hora del navegador; todas las citas se manejan en la zona horaria del negocio.

Pendiente por pestaña:

- Datos legales y comerciales.
- Dirección y contacto.
- Impuestos.
- Numeración de recibos.
- Métodos de pago.
- Política y ventana de cancelación.
- Penalización o apartado.
- Imágenes de portada, logo y galería.

### 3.23 Configuración del link de reservas

Ruta: `/booking-settings`

Pestañas observadas:

- Apariencia.
- Bloques.
- Horarios.

Campos observados:

- Link público completo.
- Link acortado.

Funciones esperadas:

- Personalización de portada y colores.
- Selección de secciones públicas.
- Orden del contenido.
- Horarios reservables.
- Anticipación mínima y máxima.
- Intervalos de tiempo.
- Depósitos.
- Políticas.
- Slug por negocio.

El contenido interno de las tres pestañas no fue relevado por completo y debe validarse antes de replicarlo exactamente.

### 3.24 Lista de espera

Ruta: `/waitlist`

Reglas explicadas por Nexora:

- Se agregan clientes cuando no hay disponibilidad.
- Si se libera un espacio, el sistema identifica candidatos elegibles.
- Orden por prioridad y fecha de registro.
- Filtro por fecha preferida y rango horario.

Pendiente:

- Notificación al cliente.
- Tiempo para aceptar.
- Reserva temporal del espacio.
- Siguiente candidato si no responde.

### 3.25 Soporte

Ruta: `/support`

Funciones:

- Contacto por WhatsApp.
- Horario de atención.
- Buzón de sugerencias.

No se debe copiar el número ni la identidad de soporte de Nexora en Corteza.

## 4. Flujo público de reserva observado

Ruta estudiada: `/reservar/dayz`

### 4.1 Catálogo público

- Nombre del negocio.
- Mensaje de reservas online las 24 horas.
- Botón Reservar Ahora.
- Beneficios destacados.
- Servicios agrupados por categoría.
- Imagen, nombre, descripción, duración y precio por servicio.
- Footer del negocio.

### 4.2 Pasos de la reserva

1. Selección de servicio.
2. Selección de fecha.
3. Lectura de disponibilidad por color: alta, media, baja o sin horarios.
4. Selección de hora disponible.
5. Selección de profesional compatible y disponible.
6. Datos del cliente.
7. Resumen y confirmación final.

Campos públicos observados:

- Nombre completo obligatorio.
- WhatsApp o teléfono obligatorio.
- Email obligatorio.
- Notas opcionales.

Resumen observado:

- Negocio.
- Servicio.
- Fecha.
- Rango de hora.
- Profesional.
- Datos del cliente.
- Total a pagar.
- Aceptación de políticas.
- Botón final Confirmar Reserva.

Durante el relevamiento se llegó hasta el resumen usando datos ficticios. No se confirmó ni creó ninguna cita en Nexora.

### 4.3 Motor de disponibilidad necesario

La disponibilidad debe resultar de:

- Servicio activo.
- Duración del servicio.
- Profesionales asociados al servicio.
- Profesional activo.
- Horario semanal.
- Excepciones y bloqueos.
- Citas existentes.
- Recursos necesarios.
- Intervalo configurado.
- Anticipación mínima.
- Límite futuro de reservas.
- Zona horaria del negocio.
- Capacidad del plan.

## 5. Modelo conceptual completo

Entidades recomendadas:

- `businesses`
- `locations`
- `users`
- `memberships`
- `roles`
- `role_permissions`
- `plans`
- `subscriptions`
- `professionals`
- `professional_services`
- `services`
- `service_categories`
- `resources`
- `service_resources`
- `business_hours`
- `professional_hours`
- `schedule_blocks`
- `clients`
- `client_tags`
- `appointments`
- `appointment_events`
- `recurring_appointment_series`
- `waitlist_entries`
- `cash_sessions`
- `payments`
- `expenses`
- `products`
- `inventory_movements`
- `commissions`
- `chair_rentals`
- `promotions`
- `loyalty_accounts`
- `loyalty_movements`
- `reviews`
- `gallery_items`
- `message_templates`
- `message_deliveries`
- `business_settings`
- `booking_page_settings`
- `audit_logs`

## 6. Estados y transiciones

Estados de cita mínimos:

```text
programada -> confirmada -> en_progreso -> completada
programada -> cancelada
confirmada -> cancelada
programada -> no_asistio
confirmada -> no_asistio
```

Reglas:

- Solo una cita completada y cobrada genera ingreso y comisión definitivos.
- Una cita cancelada libera profesional y recursos.
- Un no asistió puede afectar futuras políticas de apartado.
- Cada cambio debe registrar usuario, fecha, estado anterior, nuevo estado y motivo.

Estados de pago:

```text
pendiente -> parcial -> pagado
pagado -> reembolsado_parcial | reembolsado
```

Estados de mensaje:

```text
pendiente -> enviado -> entregado -> leído
pendiente | enviado -> fallido
```

## 7. Estado actual de Corteza

### 7.1 Tecnología

- Vinext y React 19.
- TypeScript.
- Cloudflare Worker.
- Cloudflare D1.
- Drizzle para definición de esquema y migraciones.
- Lucide React para iconografía.
- CSS responsive propio.
- Despliegue con Sites.

### 7.2 Rutas actuales

- `/` redirige a `/dashboard`.
- `/:section` carga las vistas administrativas.
- `/reservar/:slug` carga la experiencia pública.
- `/api/appointments` expone GET y POST.

Slugs administrativos actuales:

- `dashboard`
- `agenda`
- `citas`
- `clientes`
- `caja`
- `servicios`
- `equipo`
- `horarios`
- `estaciones`
- `reportes`
- `marketing`
- `fidelizacion`
- `configuracion`
- `usuarios`

### 7.3 Persistencia implementada

Tablas actuales:

- `businesses`
- `services`
- `professionals`
- `clients`
- `appointments`

Índices:

- Slug único de negocio.
- Email único por negocio.
- Citas por negocio, fecha y hora.
- Citas por profesional, fecha y hora.

Datos iniciales:

- Negocio Corteza Studio.
- Servicios Corte Signature, Barba Ritual y Corte + Barba.
- Profesional Mateo Silva.

### 7.4 API de citas implementada

`GET /api/appointments`

- Inicializa esquema y datos mínimos cuando es necesario.
- Devuelve citas con cliente, servicio y profesional.

`POST /api/appointments`

- Valida campos requeridos.
- Verifica servicio activo.
- Impide colisión exacta para profesional, fecha y hora.
- Crea o actualiza cliente por email.
- Calcula hora final desde la duración.
- Guarda origen `panel` u `online`.

Limitación actual: la prevención de colisiones solo compara la hora inicial exacta. Debe evolucionar a detección de rangos solapados.

### 7.5 Despliegue

- Sitio: `https://corteza-barber.nasmityod.chatgpt.site`
- Estado: desplegado de forma privada.
- Reserva de demostración: `/reservar/demo`.
- El enlace público no puede compartirse con clientes reales mientras el sitio completo siga privado.

## 8. Checklist de relevamiento

### Completado

- [x] Autenticación y registro visibles.
- [x] Navegación completa y rutas.
- [x] Dashboard y acciones rápidas.
- [x] Turno del día.
- [x] Agenda semanal y estados.
- [x] Formulario de cita.
- [x] Formulario de bloqueo.
- [x] Citas recurrentes.
- [x] Clientes e importación CSV.
- [x] Caja y apertura de caja.
- [x] Servicios y sus campos.
- [x] Profesionales y sus campos.
- [x] Límites de profesionales por plan.
- [x] Horarios semanales.
- [x] Recursos.
- [x] Reportes generales.
- [x] Reportes de ingresos.
- [x] Comisiones.
- [x] Integración de WhatsApp y plantillas visibles.
- [x] Fidelización inicial.
- [x] Galería.
- [x] Reseñas.
- [x] Usuarios y roles.
- [x] Configuración general y pestañas.
- [x] Link de reservas y pestañas.
- [x] Lista de espera y reglas explicadas.
- [x] Soporte.
- [x] Flujo público completo hasta el paso final sin confirmar.

### Relevamiento incompleto o por validar

- [ ] Contenido interno de Promociones.
- [ ] Todos los campos de cada pestaña de Configuración.
- [ ] Todos los campos de Apariencia, Bloques y Horarios del link público.
- [ ] Flujo de pago o depósito online.
- [ ] Cierre de caja.
- [ ] Flujo completo del POS.
- [ ] Inventario y gastos en detalle.
- [ ] Edición de una cita existente con datos reales.
- [ ] Reprogramación y cancelación.
- [ ] Detalle de permisos por rol.
- [ ] Flujo de mejora y pago de planes.
- [ ] Comportamiento de notificaciones reales.
- [ ] Exportaciones generadas por el sistema.

## 9. Checklist de implementación de Corteza

### Base técnica y visual

- [x] Proyecto inicial.
- [x] Arquitectura Cloudflare compatible.
- [x] Base D1 conectada.
- [x] Migraciones iniciales.
- [x] Panel responsive.
- [x] Navegación principal.
- [x] Reserva pública responsive.
- [x] Tarjeta social.
- [x] Despliegue privado.
- [x] Pruebas básicas de renderizado.
- [x] Cambio de dirección visual solicitado: eliminar beige.
- [ ] Validación visual final por el usuario.
- [ ] Nombre definitivo y sistema de marca definitivo.
- [ ] Dominio personalizado.

### Citas y agenda

- [x] Crear cita desde panel.
- [x] Crear cita desde reserva pública.
- [x] Persistir cita.
- [x] Crear o reutilizar cliente por email.
- [x] Calcular hora final.
- [x] Evitar duplicado exacto de horario.
- [ ] Solapamiento real por rango de tiempo.
- [ ] Disponibilidad calculada desde horarios.
- [ ] Bloqueos persistentes.
- [ ] Vista diaria y mensual real.
- [ ] Arrastrar y reprogramar.
- [ ] Editar cita.
- [ ] Cancelar con motivo.
- [ ] Estados y transiciones.
- [ ] Citas recurrentes persistentes.
- [ ] Auditoría de cambios.

### Clientes

- [x] Entidad básica y creación automática.
- [x] Vista inicial de clientes.
- [ ] CRUD completo.
- [ ] Historial por cliente.
- [ ] Importación CSV real.
- [ ] Exportación real.
- [ ] Preferencias y etiquetas.
- [ ] Consentimientos.
- [ ] Fusión de duplicados.

### Servicios

- [x] Entidad básica y datos de demostración.
- [x] Vista inicial.
- [ ] CRUD persistente.
- [ ] Categorías persistentes.
- [ ] Imágenes en R2.
- [ ] Relación muchos-a-muchos con profesionales.
- [ ] Activar o desactivar.
- [ ] Apartados por servicio.
- [ ] Variantes de precio o duración.

### Profesionales y horarios

- [x] Entidad básica y perfil de demostración.
- [x] Vista de equipo.
- [x] Vista visual de horario semanal.
- [ ] CRUD persistente.
- [ ] Horario persistente.
- [ ] Bloqueos y vacaciones.
- [ ] Servicios por profesional.
- [ ] Comisiones.
- [ ] Alquiler de silla.
- [ ] Disponibilidad por sucursal.

### Caja y finanzas

- [x] Interfaz inicial de caja.
- [ ] Sesión de caja real.
- [ ] Apertura y cierre.
- [ ] Cobro de cita.
- [ ] Pagos parciales.
- [ ] Métodos de pago.
- [ ] Propinas.
- [ ] Gastos.
- [ ] Productos.
- [ ] Inventario.
- [ ] Reembolsos.
- [ ] Factura o recibo.
- [ ] Exportación financiera.

### Marketing y experiencia pública

- [x] Catálogo público propio.
- [x] Wizard de reserva.
- [x] Página de confirmación.
- [ ] Personalización por negocio.
- [ ] Slug dinámico real.
- [ ] Galería con R2.
- [ ] Reseñas.
- [ ] WhatsApp real.
- [ ] Email transaccional.
- [ ] Recordatorios automáticos.
- [ ] Promociones.
- [ ] Fidelización.
- [ ] Lista de espera.
- [ ] Reprogramación o cancelación por cliente.
- [ ] Depósitos y pagos online.

### Seguridad, SaaS y operación

- [x] Autenticación real para propietarios mediante identidad de Sites.
- [x] Invitación de empleados ligada a email verificado.
- [x] Roles y permisos base aplicados en servidor.
- [x] Aislamiento multi-tenant validado en las APIs implementadas.
- [ ] Planes y límites.
- [ ] Suscripciones y facturación SaaS.
- [x] Auditoría de acciones sensibles implementadas.
- [x] Rate limiting persistente.
- [x] Protección antispam en reservas.
- [ ] Copias de seguridad y retención.
- [ ] Términos y privacidad.
- [ ] Observabilidad y alertas.
- [x] Pruebas de integración de renderizado y fronteras de seguridad.

## 10. Problemas conocidos de la primera versión

1. Algunas métricas y registros visibles son datos de demostración en el cliente.
2. Las citas reales de D1 se mezclan con datos semilla visuales en ciertas vistas.
3. El panel usa autenticación delegada de Sites y roles por negocio; todavía no existe acceso con credenciales propias ni proveedores externos.
4. El despliegue completo es privado; el enlace de reserva aún no es público para clientes.
5. Las fechas visibles de demostración están fijadas en agosto de 2026.
6. Solo el backend de citas está operativo.
7. Los demás botones pueden ser demostrativos.
8. La API usa un negocio fijo `biz_demo`; aún no resuelve el negocio desde slug o sesión.
9. La validación de disponibilidad no comprueba solapamientos por duración.
10. No hay relación persistente muchos-a-muchos entre servicios y profesionales.
11. No hay almacenamiento R2 para imágenes.
12. No hay pagos, caja, mensajes ni exportaciones reales.

La tarjeta social beige de la primera versión fue reemplazada por una variante en grafito, azul, cian, violeta y blanco.

## 11. Nueva dirección visual

Feedback explícito del usuario:

> No le gusta el beige.

Nueva base visual:

- Fondo general: gris muy claro o blanco frío.
- Tarjetas: blanco puro.
- Navegación: grafito o azul noche.
- Texto: grafito profundo.
- Primario: azul eléctrico.
- Secundario: cian.
- Acento complementario: violeta.
- Estados positivos: verde frío.
- Bordes: gris azulado.

Paleta propuesta:

| Uso | Color |
|---|---|
| Fondo | `#F5F7FA` |
| Superficie | `#FFFFFF` |
| Texto | `#111827` |
| Texto secundario | `#64748B` |
| Borde | `#E2E8F0` |
| Sidebar | `#0B1220` |
| Primario | `#2563EB` |
| Primario oscuro | `#1D4ED8` |
| Secundario | `#06B6D4` |
| Acento | `#8B5CF6` |

Evitar:

- Beige.
- Terracota.
- Marrón.
- Crema.
- Texturas de papel cálidas.

## 12. Plan recomendado por fases

### Fase 1: núcleo operativo

- Autenticación.
- Negocios y miembros.
- CRUD de servicios, profesionales y clientes.
- Horarios y bloqueos persistentes.
- Motor de disponibilidad por rangos.
- Agenda y estados de cita.
- Reserva pública por slug.

### Fase 2: operación diaria

- Turno del día.
- Llegada, espera y atención.
- Caja, cobros y cierre.
- Gastos.
- Recibos.
- Reportes reales.

### Fase 3: automatización y crecimiento

- WhatsApp y email.
- Recordatorios.
- Reseñas.
- Galería.
- Promociones.
- Fidelización.
- Lista de espera automática.

### Fase 4: SaaS comercial

- Planes.
- Suscripciones.
- Límites por plan.
- Roles avanzados.
- Varias sucursales.
- Alquiler de sillas.
- Comisiones.
- Dominio personalizado.

## 13. Prioridad inmediata para la próxima sesión

Orden sugerido:

1. Leer este documento completo.
2. Confirmar nombre final y paleta con el usuario.
3. Eliminar definitivamente datos visuales ficticios o marcarlos como demostración.
4. Implementar autenticación y multi-tenancy.
5. Implementar CRUD real de servicios, profesionales y clientes.
6. Implementar horarios y bloqueos persistentes.
7. Reescribir el motor de disponibilidad con detección de rangos solapados.
8. Hacer pública únicamente la ruta de reserva o separar panel y catálogo por políticas de acceso.
9. Integrar estados de cita y cobro.
10. Continuar con caja y mensajería.

## 14. Archivos clave

- `app/components/AdminApp.tsx` — panel y módulos administrativos.
- `app/components/BookingApp.tsx` — catálogo y wizard público.
- `app/api/appointments/route.ts` — lectura y creación de citas.
- `db/schema.ts` — esquema Drizzle actual.
- `db/init.ts` — creación y semillas D1.
- `app/globals.css` — sistema visual completo.
- `app/layout.tsx` — metadata y tarjeta social.
- `.openai/hosting.json` — proyecto y binding D1.
- `drizzle/` — migraciones.
- `tests/rendered-html.test.mjs` — pruebas básicas.

## 15. Comandos de trabajo

```bash
npm install
npm run dev
npm test
npm run build
npm run db:generate
```

## 16. Criterios de finalización del producto

El sistema no debe considerarse listo para producción comercial hasta que:

- [ ] Un negocio pueda registrarse y configurar su cuenta.
- [ ] Pueda invitar empleados con permisos.
- [ ] Pueda crear servicios, profesionales, horarios y bloqueos.
- [ ] Un cliente pueda reservar según disponibilidad real.
- [ ] No existan solapamientos de tiempo ni recursos.
- [ ] La barbería pueda confirmar, atender, completar o cancelar.
- [ ] Pueda cobrar y cerrar caja.
- [ ] Existan reportes basados únicamente en datos reales.
- [ ] Los mensajes tengan consentimiento, trazabilidad y reintentos.
- [ ] Los datos estén aislados por negocio.
- [ ] Existan auditoría, rate limiting y pruebas end-to-end.
- [ ] La reserva pública sea accesible para clientes y el panel permanezca protegido.
