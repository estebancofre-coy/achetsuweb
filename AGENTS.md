# AGENTS.md

## Contexto del proyecto

ACHETSU es un sitio institucional estático para presentar información de la asociación, elecciones, membresía, documentos, incorporación y contacto. Incluye una consulta pública del padrón y un backend de Google Apps Script para recibir solicitudes de rectificación e incorporación, guardar adjuntos y permitir su revisión administrativa.

Los cambios en el padrón propuestos mediante solicitudes quedan pendientes hasta que un administrador los aprueba.

## Stack tecnológico

- Lenguaje / runtime: HTML, CSS y JavaScript; Google Apps Script para el backend
- Framework: sin framework de frontend
- Base de datos / ORM: Google Sheets administrado desde Apps Script
- Almacenamiento de adjuntos: Google Drive
- Testing: sin suite automatizada configurada

## Comandos clave

- Levantar en local: abrir `index.html` directamente en un navegador o servir el directorio con un servidor estático local
- Ejecutar tests: no hay comando de tests configurado
- Lint y formato: no hay herramientas de lint o formato configuradas
- Build de producción: no hay build; publicar los archivos estáticos existentes
- Backend: copiar los archivos de `apps-script/` al proyecto de Google Apps Script y crear una nueva versión en el despliegue web

## Estructura del proyecto

- `index.html`: portada institucional y consulta pública del padrón
- `elecciones.html`: detalle del proceso electoral
- `assets/`: estilos, scripts, imágenes y datos estáticos
- `apps-script/`: backend de Google Apps Script
- `apps-script/Code.gs`: lógica de servidor, autenticación, padrón y solicitudes
- `apps-script/Admin.html`: panel administrativo
- `apps-script/Directory.html`: consulta pública del padrón
- `apps-script/Intake.html`: formulario de solicitudes
- `tests/`: pruebas unitarias y de integración, si se agregan en el futuro

## Convenciones de código

- Mantener el sitio compatible con navegadores modernos y con uso móvil.
- Preferir JavaScript sencillo y sin dependencias innecesarias.
- Reutilizar los patrones visuales e institucionales existentes.
- Escribir el HTML y JavaScript de forma legible, consistente y segura.
- Usar nombres descriptivos en español o inglés según el archivo existente.
- Mantener separadas las superficies públicas y administrativas.
- Toda funcionalidad nueva debe incluir pruebas cuando exista una infraestructura adecuada para ellas.
- Toda comunicación nueva debe diferenciar claramente datos confirmados de datos pendientes.

## Flujo de verificación

- Revisar que los cambios funcionen en escritorio y teléfono.
- Verificar los enlaces internos y navegación por anclas.
- Si se modifica Apps Script, revisar búsqueda pública, rectificación, incorporación, adjuntos, aprobación y rechazo.
- Confirmar que sin sesión administrativa no se pueda listar ni revisar solicitudes.
- No considerar actualizado el padrón hasta comprobar que una aprobación aprobada se refleje en Sheets y en la búsqueda pública.

## Restricciones

- No modificar archivos dentro de `migrations/` ya aplicados.
- No commitear archivos `.env` ni credenciales.
- No instalar nuevas dependencias sin consultar antes.
- No escribir contraseñas o secretos en el código.
- No exponer teléfonos, adjuntos, notas de revisión ni datos privados en la superficie pública.
- No modificar el padrón aprobado como parte directa de una solicitud; la modificación debe quedar pendiente y requerir aprobación administrativa.
- No inventar calendarios electorales, canales de pago, datos institucionales, estados de membresía o resultados no confirmados.
- No presentar TOTP como verificación de identidad, titularidad del teléfono o autenticación de identidad; solo corresponde a la verificación temporal del envío.
