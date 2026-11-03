# Política de Seguridad — ACHETSU

## Reporte de Vulnerabilidades

Si descubre una vulnerabilidad de seguridad, **no** la publique en un issue público. En su lugar, envíe un correo privado a **contacto@achetsu.cl** con:

- Descripción detallada de la vulnerabilidad
- Pasos para reproducirla
- Impacto potencial
- Sugerencias de remediación (si las tiene)

Haremos nuestro mejor esfuerzo para responder en 48 horas.

---

## Auditoría de Seguridad 2026

### Hallazgos Corregidos

#### 1. ✅ Exposición de URL del Apps Script (CRÍTICO)
**Problema:** La URL pública del Apps Script estaba hardcodeada en `assets/apps-script-config.js`, expuesta en GitHub Pages.

**Solución implementada:**
- Removida la URL del archivo versionado
- Creado mecanismo de inyección en deploy (GitHub Actions)
- URL ahora se inyecta desde `ACHETSU_APPS_SCRIPT_URL` (GitHub Secret)
- El archivo público solo declara la variable sin asignar valor

**Configuración requerida:**
1. Ir a: https://github.com/estebancofre-coy/achetsuweb/settings/secrets/actions
2. Crear secret: `ACHETSU_APPS_SCRIPT_URL`
3. Pegar la URL completa del `/exec` deployment

#### 2. Compatibilidad de HtmlService y límites de headers
**Corrección:** Se retiró `applySecurityHeaders_()`: utilizaba enums inexistentes
(`DENY`, `SAMEORIGIN`) y nombres de meta tags no permitidos, causando errores al abrir la aplicación.

- Admin, intake y la página inicial conservan el modo `DEFAULT` de Google.
- Solo directory utiliza `ALLOWALL` para permitir el padrón embebido. Este modo
  elimina el header `X-Frame-Options`; no restringe qué sitios pueden embeberlo.
- `addMetaTag()` no permite configurar CSP ni headers HTTP arbitrarios.
- No se ha implementado CSP personalizada, `nosniff` ni `Referrer-Policy`.
  Su configuración requiere una arquitectura compatible y queda pendiente.

Referencias oficiales:
[XFrameOptionsMode](https://developers.google.com/apps-script/reference/html/x-frame-options-mode)
y [HtmlOutput.addMetaTag](https://developers.google.com/apps-script/reference/html/html-output#addMetaTag(String,String)).

#### 3. ✅ Removida URL hardcodeada de Code.gs (CRÍTICO)
**Problema:** `CONFIG.publicWebAppUrl` contenía URL del Apps Script.

**Solución implementada:**
- Removida propiedad de CONFIG
- `publicAppUrl_()` ahora solo busca en Properties o usa fallback seguro
- No hay URL hardcodeada en el código fuente

---

### Hallazgos Pendientes de Revisión

#### 4. ⚠️ Inyección de HTML sin sanitización (ALTO)
**Ubicación:** `index.html:1114-1172`  
**Descripción:** La función `renderRecord()` construye HTML dinámicamente. Aunque usa `textContent` (seguro), se recomienda validación explícita en origen.

**Recomendación:**
- Implementar validador de datos en Code.gs
- Usar DOMPurify si se habilita HTML rico en futuro
- Audit adicional en la sección de Intake

#### 5. ⚠️ XSS en construcción de emails (ALTO)
**Ubicación:** `apps-script/Code.gs:152-163`  
**Descripción:** Email HTML construido por concatenación de strings. Actualmente seguro (no usa input de usuario), pero anti-patrón.

**Recomendación:**
- Usar template engine para emails
- Documentar que `verificationCode` es server-generated

#### 6. ⚠️ Validación débil de tokens admin (MEDIO)
**Ubicación:** `apps-script/Code.gs:823-837`  
**Descripción:** Token validado solo por longitud y presencia en cache.

**Recomendación:**
- Implementar validación de formato
- Usar HMAC para integridad del token
- Considerar token de CSRF adicional

#### 7. ⚠️ Credenciales admin en texto plano durante setup (MEDIO)
**Ubicación:** `apps-script/Code.gs:758-774`  
**Descripción:** Contraseña debe estar en texto plano en Properties antes de hashear.

**Recomendación:**
- Usar mecanismo de setup seguro (no requiera texto plano)
- Validar fortaleza de contraseña (mayúsculas, números, símbolos)

#### 8. ⚠️ Parámetros sin validación en templates (MEDIO)
**Ubicación:** `apps-script/Code.gs:43-51`  
**Descripción:** Parámetros directamente desde `event.parameter` sin whitelist.

**Recomendación:**
- Validar contra whitelist de valores permitidos
- No confiar en validación del cliente

#### 9. ℹ️ Validación superficial de archivos adjuntos (BAJO)
**Ubicación:** `apps-script/Code.gs:862-903`  
**Descripción:** Solo valida extensión/MIME, no contenido.

**Recomendación:**
- Considerar integración con VirusTotal o ClamAV para futuro
- Revalidar MIME type con herramientas del sistema
- Para PDFs, considerar conversión a imagen

#### 10. ℹ️ Email del admin hardcodeado (BAJO)
**Ubicación:** `apps-script/Code.gs:16`  
**Descripción:** Email `esteban.cofre@uaysen.cl` expuesto en código.

**Recomendación:**
- Almacenar en Properties del Script
- Permitir actualización sin cambiar código
- Usar lista de distribución si es posible

---

## Mejores Prácticas Implementadas ✓

- ✅ Validación de input con `cleanText_()` y límites de longitud
- ✅ Rate limiting en intentos de códigos de verificación
- ✅ Contraseñas hasheadas con SHA-256 (iteraciones)
- ✅ Comparación segura de tokens con `constantTimeEquals_()`
- ✅ Validación de adjuntos (tamaño, MIME, extensión)
- ✅ Sesiones con expiración
- ✅ Uso de `textContent` en lugar de `innerHTML`
- ✅ Inyección segura de URLs sensitivas via GitHub Secrets
- ✅ Modo de framing predeterminado de Google; excepción `ALLOWALL` solo para directory

---

## Testing de Seguridad

Para validar estos cambios localmente:

```bash
# Verificar que apps-script-config.js NO contiene URLs reales
grep -v "^//" assets/apps-script-config.js | grep -c "script.google.com"
# Esperado: 0 coincidencias

# Verificar que Code.gs NO tiene URLs hardcodeadas
grep "publicWebAppUrl" apps-script/Code.gs
# Esperado: 0 coincidencias

# Verificar que deploy inyecta la URL correctamente
cat .github/workflows/deploy-pages.yml | grep -A5 "Inject Apps Script"
```

---

## Próximos Pasos Recomendados

1. **✅ Configurar el GitHub Secret** (`ACHETSU_APPS_SCRIPT_URL`) antes de hacer deploy
2. **⏳ Auditoría de Code.gs adicional** para validación de tokens y setup seguro
3. **⏳ Implementar 2FA** para acceso administrativo
4. **⏳ Rotación de credenciales** periódica (trimestral)
5. **⏳ Considerar escaneo de malware** para adjuntos (VirusTotal API)

---

## Referencias

- [OWASP Top 10 2021](https://owasp.org/Top10/)
- [Google Apps Script Security Best Practices](https://developers.google.com/apps-script/overview)
- [GitHub Secret Management](https://docs.github.com/en/actions/security-guides/encrypted-secrets)
- [MDN Web Security Guide](https://developer.mozilla.org/en-US/docs/Web/Security)
- [OWASP Content Security Policy](https://owasp.org/www-community/attacks/CSP)

---

**Última auditoría:** 2026-10-29  
**Última corrección:** 2026-11-02  
**Próxima revisión recomendada:** 2026-12-29
