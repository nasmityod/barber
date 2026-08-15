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
8. La autenticación es propia de Corteza sobre Cloudflare Workers y D1. No usar inicio de sesión, OAuth ni identidad de ChatGPT/OpenAI.

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
- Despliegue directo en Cloudflare Workers.

### 7.2 Rutas actuales

- `/` redirige a `/dashboard`.
- `/:section` carga las vistas administrativas.
- `/reservar/:slug` carga la experiencia pública.
- `/api/admin/appointments` gestiona creación, lectura, edición, reprogramación y estados con sesión propia y permisos; su lectura admite rangos de hasta 62 días para la agenda.
- `/api/admin/availability` calcula horarios para editar una cita sin tratar la propia reserva como una colisión.
- `/api/admin/time-blocks` gestiona la edición del horario semanal y los bloqueos persistentes, con validación de citas futuras.
- `/api/admin/cash` gestiona apertura, cobros parciales por método, anulaciones y cierre de caja con arqueo persistente.
- `/api/admin/clients` gestiona el directorio persistente, edición, eliminación segura e historial real por cliente.
- `/api/admin/services` gestiona el catálogo persistente, activación, edición y eliminación segura por negocio.
- `/api/admin/professionals` gestiona el equipo persistente, sus servicios asignados, datos de contacto, activación, métricas y eliminación segura por negocio.
- `/api/public/catalog`, `/api/public/availability` y `/api/public/bookings` sirven la reserva pública.
- `/api/appointments` permanece retirado para proteger la frontera de datos anterior.

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
- `cash_sessions`
- `payments`

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

`GET /api/admin/appointments`

- Inicializa esquema y datos mínimos cuando es necesario.
- Devuelve citas con cliente, servicio y profesional.
- Admite `from` y `to` para cargar únicamente el período visible.

`POST /api/admin/appointments`

- Valida campos requeridos.
- Verifica servicio activo.
- Impide colisión exacta para profesional, fecha y hora.
- Crea o actualiza cliente por email.
- Calcula hora final desde la duración.
- Guarda origen `panel` u `online`.

`PUT /api/admin/appointments`

- Edita cliente, servicio, profesional, fecha, hora y notas.
- Recalcula duración, precio y slots atómicos.
- Rechaza horarios fuera de disponibilidad, bloqueados o solapados.
- Mantiene el aislamiento por negocio y registra el cambio en auditoría.

`PATCH /api/admin/appointments`

- Aplica transiciones de estado permitidas en servidor.
- Exige y persiste un motivo cuando la cita se cancela.
- Libera los slots al cancelar o marcar inasistencia y audita la transición.

La prevención de colisiones valida el rango completo, respeta horarios y bloqueos, y usa guardas atómicas en D1 para impedir carreras entre reservas concurrentes.

La API administrativa de horarios y bloqueos permite editar la semana laboral, crea y elimina ausencias futuras, rechaza cambios que entren en conflicto con citas activas y audita cada cambio.

La API administrativa de clientes lista métricas agregadas desde citas reales, crea y edita perfiles, devuelve el historial individual y solo permite eliminar registros sin citas relacionadas. Las escrituras requieren permiso explícito y quedan auditadas.

La caja administrativa mantiene una única sesión abierta por negocio, vincula cada cobro con su cita y sesión, admite efectivo, tarjeta, transferencia y pago móvil, impide sobrepagos de forma atómica y registra anulaciones y cierres en auditoría.

La API administrativa de profesionales crea perfiles con horarios iniciales y servicios asignados, permite editarlos, activarlos o desactivarlos y calcula sus métricas desde citas reales. Conserva cualquier profesional con citas o bloqueos relacionados y audita todas las escrituras.

El catálogo y la disponibilidad pública solo ofrecen combinaciones válidas entre servicios y profesionales activos. La relación muchos-a-muchos se persiste por negocio y evita asignaciones cruzadas entre negocios.

La agenda administrativa ofrece vistas diaria, semanal y mensual basadas únicamente en citas persistidas. Incluye navegación por períodos, botón Hoy, filtro por profesional, estados visuales, contadores del rango visible y reprogramación por arrastre. Clic o teclado abren el editor como alternativa accesible.

### 7.5 Despliegue

- Sitio: desplegado directamente como Cloudflare Worker.
- Estado: desplegado directamente en Cloudflare Workers.
- Reserva de demostración: `/reservar/demo`.
- El panel queda protegido por credenciales propias y la reserva pública permanece accesible sin sesión.

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
- [x] Despliegue directo en Cloudflare Workers.
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
- [x] Solapamiento real por rango de tiempo.
- [x] Disponibilidad calculada desde horarios.
- [x] Bloqueos persistentes.
- [x] Vista diaria y mensual real.
- [x] Arrastrar y reprogramar.
- [x] Editar cita.
- [x] Cancelar con motivo.
- [x] Estados y transiciones.
- [x] Citas recurrentes persistentes, con frecuencias semanal, quincenal y mensual.
- [x] Auditoría de cambios.

### Clientes

- [x] Entidad básica y creación automática.
- [x] Vista inicial de clientes.
- [x] CRUD completo.
- [x] Historial por cliente.
- [ ] Importación CSV real.
- [ ] Exportación real.
- [ ] Preferencias y etiquetas.
- [ ] Consentimientos.
- [ ] Fusión de duplicados.

### Servicios

- [x] Entidad básica y datos de demostración.
- [x] Vista inicial.
- [x] CRUD persistente.
- [ ] Categorías persistentes.
- [ ] Imágenes en R2.
- [x] Relación muchos-a-muchos con profesionales.
- [x] Activar o desactivar.
- [ ] Apartados por servicio.
- [ ] Variantes de precio o duración.

### Profesionales y horarios

- [x] Entidad básica y perfil de demostración.
- [x] Vista de equipo.
- [x] Vista visual de horario semanal.
- [x] CRUD persistente.
- [x] Horario persistente.
- [x] Edición administrativa del horario semanal.
- [x] Bloqueos y vacaciones.
- [x] Servicios por profesional.
- [ ] Comisiones.
- [ ] Alquiler de silla.
- [ ] Disponibilidad por sucursal.

### Caja y finanzas

- [x] Interfaz inicial de caja.
- [x] Sesión de caja real.
- [x] Apertura y cierre.
- [x] Cobro de cita.
- [x] Pagos parciales.
- [x] Métodos de pago.
- [x] Propinas.
- [x] Gastos.
- [x] Productos.
- [x] Inventario.
- [x] Reembolsos.
- [x] Factura o recibo.
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

- [x] Autenticación propia con contraseña, sesión segura y cambio obligatorio de clave temporal.
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

1. El módulo de clientes y sus métricas ya usan D1; otras vistas comerciales todavía conservan datos de demostración.
2. Las vistas operativas de agenda y citas ya usan D1; algunos módulos futuros todavía muestran estructuras demostrativas.
3. El acceso usa credenciales propias de Corteza; todavía no existe recuperación automática por email.
4. La reserva pública y el panel se sirven desde el mismo Worker, con autorización aplicada solo al panel y sus APIs.
5. La agenda ya calcula sus períodos desde la fecha y zona horaria del negocio.
6. Autenticación, miembros, citas, clientes, servicios, profesionales, disponibilidad, horarios y bloqueos tienen backend operativo; otros módulos comerciales siguen pendientes.
7. Los demás botones pueden ser demostrativos.
8. Las APIs administrativas resuelven el negocio desde la sesión; el catálogo público lo resuelve por slug.
9. Los horarios persistentes se leen y editan desde D1; cualquier cambio que deje citas futuras fuera del horario se rechaza.
10. Los servicios por profesional se persisten como relación muchos-a-muchos y se aplican al catálogo, la disponibilidad y los formularios de citas.
11. No hay almacenamiento R2 para imágenes.
12. Pagos, caja, propinas, gastos, POS, inventario, reembolsos y recibos ya son persistentes; mensajería y exportaciones financieras reales siguen pendientes.

La tarjeta social beige de la primera versión fue reemplazada por una variante en grafito, azul, cian, violeta y blanco.

## 11. Dirección visual — barbería en negro y oro

Feedback explícito del usuario:

> No le gusta el beige. El panel no tenía negro y no se sentía como una barbería.

Identidad visual de producción:

- Negro verdadero en sidebar, topbar, login y reserva pública (`#000000` / `#050505`).
- Oro de barbería como acción primaria (`#C6A15B`).
- Acento de poste de barbero en rojo (`#C41E3A`) para la marca y alertas.
- Superficies operativas blancas o hueso frío para leer números, caja y reportes.
- Tipografía de titular: Playfair Display. Cuerpo: Geist.
- Evitar beige, terracota, azul eléctrico de plantilla y fondos crema.

Paleta:

| Uso | Color |
|---|---|
| Vacío / sidebar | `#000000` |
| Fondo de trabajo | `#F3F3F4` |
| Superficie | `#FFFFFF` |
| Texto | `#0A0A0A` |
| Primario | `#C6A15B` |
| Poste | `#C41E3A` |
| Positivo | `#1F7A4D` |

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
5. CRUD real de servicios, clientes y profesionales, incluyendo servicios por profesional, completado.
6. Edición administrativa de horarios persistentes y gestión de bloqueos completadas.
7. Reprogramación, edición, cancelación con motivo y citas recurrentes completadas.
8. Hacer pública únicamente la ruta de reserva o separar panel y catálogo por políticas de acceso.
9. Estados de cita y cobro, pagos parciales y apertura/cierre de caja completados.
10. Continuar con gastos y mensajería.

## 14. Archivos clave

- `app/components/AdminApp.tsx` — panel y módulos administrativos.
- `app/calendar.ts` — cálculos de fechas y rangos para la agenda.
- `app/components/BookingApp.tsx` — catálogo y wizard público.
- `app/api/admin/appointments/route.ts` — lectura por rango, creación, edición, reprogramación y estados de citas protegidas.
- `app/api/admin/cash/route.ts` — apertura, cobros, anulaciones y cierre de caja protegidos.
- `app/components/CashManager.tsx` — operación diaria y arqueo de caja.
- `app/api/admin/commerce/route.ts` — productos, POS, inventario, gastos y reembolsos protegidos.
- `app/api/admin/receipts/route.ts` — recibos HTML imprimibles para citas y ventas POS.
- `app/components/CommerceManager.tsx` — pestañas de POS, inventario, gastos, reembolsos y recibos.
- `app/api/admin/professionals/route.ts` — CRUD persistente del equipo, activación, métricas y eliminación protegida.
- `db/schema.ts` — esquema Drizzle actual.
- `db/init.ts` — creación y semillas D1.
- `app/globals.css` — sistema visual completo.
- `app/layout.tsx` — metadata y tarjeta social.
- `wrangler.jsonc` — Worker, assets, observabilidad y binding D1.
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
- [x] Pueda invitar empleados con permisos.
- [x] Pueda crear servicios, profesionales, horarios y bloqueos.
- [x] Un cliente pueda reservar según disponibilidad real.
- [x] No existan solapamientos de tiempo ni recursos.
- [x] La barbería pueda confirmar, atender, completar o cancelar.
- [x] Pueda cobrar y cerrar caja.
- [x] Existan reportes basados únicamente en datos reales.
- [ ] Los mensajes tengan consentimiento, trazabilidad y reintentos.
- [x] Los datos estén aislados por negocio.
- [ ] Existan auditoría, rate limiting y pruebas end-to-end.
- [x] La reserva pública sea accesible para clientes y el panel permanezca protegido.

## 17. Auditoría integral adicional — 7 de agosto de 2026

Esta sección actualiza el checklist anterior con evidencia del repositorio actual y de una revisión navegable de la aplicación desplegada. No contiene credenciales.

### 17.1 Alcance y evidencia

- Se inició sesión en `https://app.nexorabarber.com/auth` con la cuenta proporcionada y se recorrieron las rutas visibles del panel: Dashboard, Turno del Día, Agenda, Citas, Clientes, Caja, Servicios, Profesionales, Horarios, Recursos, Reportes, Reporte de ingresos, Comisiones, Integraciones, Promociones, Fidelización, Galería, Reseñas, Usuarios y roles, Configuración, Link de reservas, Lista de espera y Soporte.
- Se abrieron los formularios y pestañas no destructivos de citas, citas recurrentes, bloqueos, clientes, importación, servicios, profesionales, horarios, recursos, caja, POS, inventario, promociones, tarjetas de regalo, fidelización, galería, reseñas, integraciones, configuración, métodos de pago, cancelación y link público.
- La cuenta auditada estaba vacía de operación: 0 citas, 0 clientes, 0 ventas y 0 cobros. No se crearon citas, clientes, cobros, productos ni archivos.
- Durante la inspección se activó accidentalmente el programa de fidelización al pulsar un control que era una acción inmediata; se desactivó y se guardó el estado original. No quedó ese cambio en la cuenta.
- En el repositorio local, `npm test` terminó con 29 pruebas aprobadas, `npm run lint` terminó sin errores y `npm run build` terminó correctamente.

### 17.2 Estado confirmado del repositorio local

Implementado y persistente en D1:

- Autenticación propia, registro de negocio, sesiones, cambio obligatorio de contraseña temporal, recuperación por token, roles base y aislamiento por negocio.
- Citas desde panel y reserva pública, disponibilidad por horario, bloqueos, solapamientos atómicos, edición, reprogramación, estados, motivos de cancelación, auditoría y series recurrentes semanal/quincenal/mensual.
- Clientes con CRUD, historial, importación CSV real, exportación CSV real y protección de eliminación.
- Servicios con CRUD, categorías como texto, activación, duración, precio y relación muchos-a-muchos con profesionales.
- Profesionales con CRUD, servicios asignados, métricas, horarios iniciales, activación y protección de eliminación.
- Caja con apertura, cobros parciales, métodos de pago, propinas, anulaciones, cierre y arqueo.
- POS, productos, SKU, inventario, ajustes de stock, gastos, reembolsos y recibos HTML imprimibles.
- Promociones básicas, puntos de fidelización manuales, reseñas manuales con moderación, galería basada en URLs HTTPS, lista de espera básica, cola de mensajes y solicitudes de depósito manuales.
- Registro manual de planes y suscripciones, límite de miembros por plan, copias JSON por negocio, rate limiting, cabeceras de seguridad, auditoría y observabilidad configurada en Wrangler.

### 17.3 Pendientes confirmados para implementar

Ordenados por impacto y dependencia:

#### P0 — cerrar módulos operativos que hoy son incompletos

- [x] Configuración persistente del negocio: datos comerciales, país, zona horaria, formato horario, moneda, métodos de pago, política de cancelación, WhatsApp, imágenes y preferencias. Existe `/api/admin/settings` protegido por `settings.write`, con persistencia 1:1 en `business_settings`; las imágenes se guardan como URLs HTTPS hasta implementar almacenamiento gestionado.
- [x] Estaciones y recursos: crear, editar, activar/desactivar y eliminar recursos; relacionarlos con servicios o profesionales; bloquear solapamientos por recurso. Existe `/api/admin/resources`, la vista `/estaciones`, auditoría, aislamiento por negocio y trigger `resource_time_overlap` para citas con recurso.
- [x] Turno del día: walk-ins, llegada, cola, estados esperando/en atención/finalizado, reordenamiento, tiempo de espera, conversión a cita/venta y preparación idempotente de recordatorios de mañana. El envío externo queda pendiente en mensajería P1.
- [x] Reportes reales de negocio: filtros por periodo, profesional, servicio y método de pago; ingresos, productos, gastos, ganancia neta, propinas y datos derivados directamente de pagos, POS, gastos, reembolsos y comisiones. Existe `/api/admin/reports`, exportación CSV y el módulo `/reportes`.
- [x] Comisiones: esquema, reglas porcentuales/fijas, prioridad por profesional/servicio/categoría, generación al completar y cobrar, estados pendiente/pagada, lotes, historial y auditoría.

#### P1 — completar crecimiento y experiencia pública

- [ ] Mensajería real: proveedor de WhatsApp, proveedor de email, plantillas, consentimiento, opt-in/opt-out, reintentos, entregas/errores y cron o cola Worker que procese `message_logs`. Hoy solo se encolan mensajes; no hay envío externo ni handler `scheduled`.
- [ ] Recordatorios y seguimiento automáticos: ejecución programada, confirmaciones al reservar, seguimiento post-cita, enlaces de reprogramación/cancelación y trazabilidad por mensaje.
- [ ] Galería e imágenes gestionadas: subida segura, R2 o almacenamiento equivalente, compresión, validación de tamaño/tipo, eliminación y metadatos para servicios/profesionales. Hoy la galería solo guarda una URL HTTPS escrita manualmente.
- [ ] Personalización real del link de reservas: logo, portada, datos comerciales, estilos, bloques visibles, horarios, anticipación, días máximos, precios/duración, políticas y persistencia por negocio. El booking local solo usa slug, catálogo, profesionales, horarios y disponibilidad persistentes.
- [ ] Portal del cliente: consultar, confirmar, reprogramar y cancelar usando un token seguro, con política y límites aplicados. Actualmente no hay flujo público de gestión de citas.
- [ ] Depósitos y pagos online conectados: Stripe/Mercado Pago/PayPal o proveedor elegido, webhooks, conciliación, expiración, reembolso y aplicación del depósito al pago/caja/cita. Hoy la solicitud genera un enlace y recibe una referencia manual, pero confirmar el depósito no crea un `payment` ni concilia caja.
- [ ] Promociones completas: aplicar códigos a la reserva/POS, límites por cliente, servicios elegibles, primera visita/inactividad, tarjetas de regalo, métricas y auditoría de uso. El CRUD básico ya existe, pero no se aplica al checkout.
- [ ] Fidelización completa: regla automática al cobrar, recompensas/canje, vencimiento, ajustes con historial visible y conexión con pagos. Hoy solo existe ajuste manual de puntos.
- [ ] Lista de espera automática: preferencias de fecha/hora/servicio/profesional, detección de huecos liberados, prioridad, reserva temporal, vencimiento de aceptación y siguiente candidato.
- [ ] Reseñas completas: vincular a cita/cliente, solicitud por email/WhatsApp, enlace de Google Business, consentimiento y publicación configurable. El CRUD manual y la publicación básica ya existen.

#### P1 — seguridad, SaaS y operación comercial

- [ ] Autorización por módulo: separar permisos de agenda, clientes, finanzas, marketing, configuración y auditoría. Actualmente hay cuatro roles fijos, pero la página administrativa exige `appointments.read` como permiso base y no existe un editor de permisos personalizados.
- [ ] Límites de plan completos: aplicar `max_appointments` y demás entitlements en todas las rutas; estados trialing/active/past_due/cancelled; renovación, cancelación, facturación real, webhooks y portal de suscripción. Actualmente el cambio de plan es manual y solo se aplica de forma visible al límite de miembros.
- [ ] Alertas del panel: conectar `/api/admin/alerts` con el botón de notificaciones, contador, listado, marcar como leídas y eventos de bienvenida/plan/operación.
- [ ] Copias de seguridad operativas: descarga ya disponible; falta programar backups automáticos, retención, restauración verificada, cifrado/almacenamiento externo y alertas de fallo.
- [ ] Sucursales y recursos multiubicación: `locations`, configuración por sucursal, horarios, catálogo, caja, reportes y slug/URL por ubicación.
- [ ] Alquiler de sillas: contratos, periodos, cobros, vencimientos, reportes y relación con profesionales/sucursales.
- [ ] Observabilidad de producto: métricas de errores y latencia por endpoint, alertas accionables, trazas de mensajes/pagos y panel de salud. Wrangler tiene observabilidad, pero no existe aún una capa funcional de alertas de negocio.

#### P2 — calidad y acabado de producción

- [ ] Pruebas end-to-end reales para autenticación, permisos, reserva pública, CRUD, caja, POS, pagos, reportes y flujos de error; las pruebas actuales cubren renderizado, seguridad y lógica de servidor, no una sesión completa de navegador.
- [ ] Pruebas de concurrencia y recuperación para D1/Worker en reservas, caja, inventario, reembolsos, idempotencia y procesos programados.
- [ ] Validación visual responsive de todos los módulos y eliminación de textos de demostración, datos ficticios y problemas de codificación de caracteres visibles.
- [ ] Accesibilidad completa: foco de modales, teclado en calendario/drag-and-drop, nombres accesibles de icon-only buttons, contraste y lectura con lector de pantalla.
- [ ] Dominio personalizado, branding definitivo, SEO por negocio, política de privacidad/terminos versionada y consentimiento de marketing.

### 17.4 Diferencias críticas entre el sistema observado y Corteza local

| Área | Observado en Nexora | Estado local de Corteza | Pendiente |
|---|---|---|---|
| Turno del día | Walk-ins, cola y atención | `/api/admin/day` y `/turno` persistentes | Recordatorios externos P1 |
| Recursos | Estaciones y recursos | CRUD, asociaciones y guardas de solapamiento persistentes | Exportación y asignación pública avanzada |
| Configuración | General, negocio, pagos, cancelación, WhatsApp e imágenes | Settings persistentes con API administrativa | Almacenamiento gestionado y consumo completo en link público |
| Reportes | Ingresos, gastos, productos, comisiones y filtros | API, panel y exportación CSV con datos reales | Portal y personalización pública |
| Mensajes | Integraciones, plantillas y recordatorios | Cola D1 sin transportes | Implementar P1 |
| Galería | Carga de imagen | URL HTTPS manual | Implementar almacenamiento P1 |
| Link público | Apariencia, bloques y horarios configurables | Reserva pública fija por slug | Implementar settings P1 |
| Portal cliente | Gestión pública de citas | No existe | Implementar P1 |
| Pagos | Depósitos y métodos visibles | Solicitud/manual sin conciliación | Implementar P1 |
| Planes | Upgrade por plan | Cambio manual sin proveedor | Implementar P1 |

### 17.5 Corte implementado — 8 de agosto de 2026

- Se añadió la migración `0016_business_settings_resources.sql` y el soporte equivalente en `db/init.ts` para instalaciones existentes.
- La configuración ahora se carga y guarda desde el panel con validación de zona horaria, moneda, teléfonos, correo, URLs HTTPS, métodos de pago y límites de reserva/cancelación.
- Recursos y estaciones tienen CRUD, asociaciones persistentes, activación, auditoría, protección de eliminación y guardas D1 contra solapamientos de citas del mismo recurso.
- Los reportes leen pagos, ventas POS, gastos y reembolsos; calculan bruto, neto, propinas y filtros operativos sin datos ficticios.
- Se ampliaron las citas para aceptar un recurso opcional y consultar disponibilidad considerando ese recurso.
- Verificación local: `npm run lint`, `npx tsc --noEmit`, `npx drizzle-kit check`, `npm run build` y `npm test` pasan; la suite queda en 31 pruebas aprobadas.

### 17.6 Siguiente orden de ejecución

1. Implementar Turno del día y conectar sus estados con citas, caja y reportes.
2. Crear el modelo de comisiones y exportación de reportes.
3. Completar personalización del link público y portal de cliente.
4. Integrar mensajería programada y pagos con proveedor/webhooks.
5. Completar límites de plan, alertas, backups automáticos y permisos por módulo.
6. Añadir E2E, accesibilidad, pruebas de concurrencia y validación visual final.

### 17.7 Corte implementado — Turno del día

- Se añadió la migración `0017_day_queue.sql`, la tabla `day_queue_entries`, sus índices de negocio y su inclusión en las copias JSON.
- Se implementó `/api/admin/day` con aislamiento por negocio y auditoría para walk-ins, llegada de citas, estados esperando/en atención/finalizado/no llegó/cancelado, reordenamiento y cálculo de espera.
- La vista `/turno` permite registrar walk-ins, registrar llegadas, atender, finalizar, reordenar, convertir una llegada en cita y registrar una venta rápida enlazada con caja, POS, reportes y recibos.
- Se añadió la preparación idempotente de recordatorios para el día siguiente en `message_logs`; el envío externo queda en el pendiente P1 de mensajería.
- Verificación local: `npm run lint`, `npx tsc --noEmit`, `npx drizzle-kit check` y `npm test` pasan; la suite queda en 33 pruebas aprobadas.

### 17.8 Siguiente orden de ejecución actualizado

1. Completar personalización del link público y portal de cliente.
2. Integrar mensajería programada y pagos con proveedor/webhooks.
3. Completar límites de plan, alertas, backups automáticos y permisos por módulo.
4. Añadir E2E, accesibilidad, pruebas de concurrencia y validación visual final.

### 17.9 Corte implementado — Comisiones y exportación de reportes

- Se añadió `0018_commissions.sql` y el soporte equivalente en `db/init.ts` para reglas, comisiones y lotes, con índices, validaciones e idempotencia por cita y negocio.
- `/api/admin/commissions` permite crear/editar/activar reglas generales, por profesional, servicio o categoría; aplicar porcentajes o montos fijos; ordenar por prioridad; consultar pendientes/pagadas y liquidar lotes con auditoría.
- Las comisiones se generan automáticamente una sola vez cuando una cita queda completada y totalmente cobrada, tanto al cambiar el estado como al registrar el cobro final.
- El módulo `/comisiones` muestra reglas, liquidaciones, lotes e historial; las comisiones se descuentan del ingreso neto y aparecen en reportes.
- `/api/admin/reports?format=csv` exporta el periodo y filtros actuales con resumen, servicios, profesionales, métodos, productos y comisiones; el panel incluye el botón de descarga.
- Se añadieron pruebas de aislamiento, prioridad, unicidad e idempotencia de comisiones y liquidación por lotes.
- Verificación local: `npm run lint`, `npx tsc --noEmit`, `npx drizzle-kit check`, `npm run build` y `npm test` pasan; la suite queda en 35 pruebas aprobadas.
### 17.10 Corte implementado — personalización pública y portal de cliente

- Se añadió `0019_naive_leper_queen.sql` con `booking_page_settings` y `appointment_portal_tokens`; `db/init.ts` también crea estas tablas para instalaciones existentes.
- La configuración del negocio ahora persiste titular, descripción, color principal, nota pública y bloques visibles de servicios, profesionales, contacto y políticas, además de los campos comerciales, imágenes, precios, galería y reseñas ya existentes.
- `/reservar/:slug` consume la configuración real del negocio, muestra los bloques públicos activos, respeta formato horario, precios, anticipación mínima y horizonte máximo, y devuelve un enlace seguro de gestión después de reservar.
- Las reservas públicas usan `require_confirmation` para iniciar como `programada` o `confirmada`, y la disponibilidad filtra horarios pasados o fuera de los límites configurados.
- Se implementó `/cita/:token` y `/api/public/appointments/:token` para consultar, confirmar, reprogramar y cancelar con token hash, expiración, rate limiting, validación de disponibilidad, política de cancelación y auditoría sin sesión administrativa.
- Se añadieron pruebas de migración, aislamiento del token por cita y unicidad del portal; `npm run lint`, `npx tsc --noEmit`, `npx drizzle-kit check`, `npm run build` y `npm test` pasan; la suite queda en 36 pruebas aprobadas.

### 17.11 Corte de producción — identidad de barbería, analítica y cierre de caja

- Identidad visual negra y oro: sidebar `#000`, poste de barbero en la marca, CTAs `#C6A15B`, acento `#C41E3A`. Se eliminó el azul de plantilla en panel, login y reserva pública.
- Tipografía operativa ampliada: el panel ya no usa textos de 7–10 px. Cuerpo 15 px, títulos de página ~38 px, métricas 28 px, botones e inputs de 42–44 px.
- Reportes reales con periodos rápidos, comparación vs periodo anterior, tendencia diaria, embudo, ocupación por día/hora, ranking de servicios, equipo, medios y clientes top.
- Cierre de caja con mix de cobro, conteo opcional por billete, diferencia de arqueo, recibo imprimible, detalle de cierres anteriores y CSV de la sesión.
- Dashboard con pulso del piso, alertas reales y atajos a turno, caja y analítica. Color público por defecto `#C6A15B`.
- Las pruebas HTML de renderizado usan el puerto 3210 para no chocar con otro servidor local en 3000.

Pendientes P1 que continúan:

- Mensajería externa con proveedor (WhatsApp/email). El cron ya encola recordatorios.
- Almacenamiento gestionado de imágenes (R2) y pagos online con webhooks/conciliación.
- Sucursales, planes con facturación real y E2E de navegador.
