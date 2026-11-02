# Instrucciones de Deploy — ACHETSU 2026

Esta guía documenta cómo desplegar ACHETSU con las nuevas mejoras de seguridad y la landing page de mantenimiento.

## Requisitos Previos

- GitHub CLI (`gh`) instalado y configurado
- Acceso administrativo a ambos repositorios:
  - `estebancofre-coy/achetsuweb` (sitio institucional)
  - `estebancofre-coy/achetsu-elecciones` (portal de elecciones)
- Acceso administrativo a Google Apps Script (script.google.com)

## 1. Configurar GitHub Secret para Apps Script URL

**IMPORTANTE:** Este paso debe completarse ANTES de hacer merge a `main`.

### Pasos:

1. Abre: https://github.com/estebancofre-coy/achetsuweb/settings/secrets/actions

2. Clic en **"New repository secret"**

3. Nombre: `ACHETSU_APPS_SCRIPT_URL`

4. Valor: Tu URL de deploy del Apps Script
   - Ejemplo: `https://script.google.com/macros/s/AKfycbxFIVmTqaf-Yh2VjiN41Wq-AuvcolZjyGKBC5h23KVBnWyof4KJssll97ZrAI5f1lJY/exec`
   - Encontrar en: script.google.com → Proyecto ACHETSU → Deploy → New deployment → Tipo: Web app → Copy URL

5. Clic en **"Add secret"**

### Verificación:

```bash
# Ver que el secret está registrado (no muestra valor)
gh secret list --repo estebancofre-coy/achetsuweb | grep ACHETSU_APPS_SCRIPT_URL
```

## 2. Actualizar Assets en Repositorio de Elecciones

El padrón en `achetsu-elecciones` debe sincronizarse con `achetsuweb` en deploy.

### Verificación automática:

El workflow `.github/workflows/deploy-pages.yml` en ambos repos contiene:
- Paso "Prepare public site only" que copia archivos públicos
- Paso "Inject Apps Script URL securely" que inyecta el secret

No requiere configuración adicional.

## 3. Hacer Merge de la Rama de Desarrollo

### Opción A: Usar GitHub Web UI

1. Ve a: https://github.com/estebancofre-coy/achetsuweb/pull (busca la rama `estebancofre-coy-canal-actualizacion-registro`)

2. Abre el Pull Request

3. Verifica que los checks hayan pasado (GitHub Pages deploy)

4. Clic en **"Merge pull request"**

5. Selecciona **"Squash and merge"** (recomendado para mantener history limpio)

6. Clic en **"Confirm squash and merge"**

### Opción B: Usar GitHub CLI

```bash
# Listar PRs
gh pr list --repo estebancofre-coy/achetsuweb

# Hacer merge de PR específico (reemplaza <number> con el número)
gh pr merge <number> --squash --auto
```

## 4. Verificar Deployments

### GitHub Pages deployment (automático)

Después del merge, GitHub Actions inicia automáticamente:

```bash
# Ver estado del workflow
gh run list --repo estebancofre-coy/achetsuweb --workflow deploy-pages.yml --limit 5
```

Espera a que el workflow "Deploy ACHETSU to GitHub Pages" complete (verifica en Actions tab).

### Verificar sitios en vivo

1. **Sitio institucional en mantenimiento:**
   - URL: https://achetsu.cl/maintenance.html (o configurar como landing default)
   - Debe mostrar: "Estamos trabajando para usted"

2. **Portal de elecciones:**
   - URL: https://elecciones.achetsu.cl
   - Debe funcionar normalmente (sin cambios en esta rama)

3. **Apps Script activo:**
   - URL: https://script.google.com/macros/s/.../exec?view=directory
   - Debe cargar directorio de miembros

## 5. Actualizar Apps Script (Manual)

Los cambios en `apps-script/Code.gs` requieren sincronización manual:

### Paso 1: Copiar cambios

1. Abre el archivo actualizado: `apps-script/Code.gs` en GitHub
2. Selecciona el contenido completo (Ctrl+A)
3. Copia (Ctrl+C)

### Paso 2: Pegar en Apps Script Editor

1. Ve a: https://script.google.com
2. Abre el proyecto ACHETSU
3. Haz clic en `Code.gs` en el panel lateral
4. Selecciona todo el contenido (Ctrl+A)
5. Pega el nuevo contenido (Ctrl+V)
6. Clic en **"Save"** (Ctrl+S)

### Paso 3: Deploy nuevo

1. Clic en **"Deploy"** → **"New Deployment"**
2. Tipo: **"Web app"**
3. Execute as: **(tu cuenta)**
4. Execute as: **Anyone** (para acceso público)
5. Clic en **"Deploy"**
6. Copia la URL `/exec` del nuevo deployment (será similar pero diferente)

### Paso 4: Actualizar GitHub Secret

1. Ve a: https://github.com/estebancofre-coy/achetsuweb/settings/secrets/actions
2. Haz clic en `ACHETSU_APPS_SCRIPT_URL`
3. Clic en **"Update"**
4. Pega la NUEVA URL del deployment
5. Clic en **"Update secret"**

## 6. Verificar Seguridad Post-Deploy

```bash
# Verificar que NO hay URLs hardcodeadas públicamente
curl https://estebancofre-coy.github.io/achetsuweb/assets/apps-script-config.js \
  | grep -c "script.google.com"
# Esperado: 0 (no debe encontrar URLs)

# Verificar que el workflow inyectó correctamente
curl https://estebancofre-coy.github.io/achetsuweb/assets/apps-script-config.js \
  | grep "ACHETSU_APPS_SCRIPT_URL"
# Debe mostrar: window.ACHETSU_APPS_SCRIPT_URL = "https://...";
```

## 7. Cambios en esta Iteración

### Landing Page de Mantenimiento
- Nuevo archivo: `maintenance.html`
- Mensaje: "Estamos trabajando para usted"
- Accesible en: `/maintenance.html` (o configurar redirección en index.html)

### Seguridad Mejorada

**En Frontend (index.html, elecciones.html):**
- ✅ URL del Apps Script no está hardcodeada
- ✅ Se inyecta en deploy desde GitHub Secret
- ✅ Fallback seguro sin exposición

**En Backend (Code.gs):**
- ✅ Headers HTTP de seguridad (X-Frame-Options, X-Content-Type-Options, etc.)
- ✅ Removida configuración hardcodeada de URLs
- ✅ Función `applySecurityHeaders_()` centralizada

**En Workflow (.github/workflows/deploy-pages.yml):**
- ✅ Paso "Inject Apps Script URL securely" usa GitHub Secrets
- ✅ Inyección via `sed` en build time (no en runtime)

## 8. Pruebas de Regresión Recomendadas

Después de deploy, verifica:

### Funcionalidad del Directorio
```bash
# Acceder a padrón público
curl "https://script.google.com/macros/s/.../exec?view=directory" \
  | grep -q "Consulta del padrón"
echo $?
# Esperado: 0 (found)
```

### Panel Administrativo
```bash
# Verificar que panel carga (requiere autenticación)
# Navega a: https://script.google.com/macros/s/.../exec?view=admin
# Debe solicitar contraseña
```

### Formulario de Solicitudes
```bash
# Verificar que forma carga con parámetros
# Navega a: https://script.google.com/macros/s/.../exec?view=intake&requestType=rectificacion
# Debe cargar formulario de solicitud
```

### Landing de Mantenimiento
```bash
# Verificar que se carga
curl https://achetsu.cl/maintenance.html | grep -q "Estamos trabajando"
echo $?
# Esperado: 0 (found)
```

## 9. Rollback (si es necesario)

Si encontras problemas post-deploy:

### Opción 1: Revertir Merge en GitHub
```bash
gh pr merge <pr_number> --revert
```

### Opción 2: Revert Manual
```bash
git revert <commit_hash> -m 1
git push origin main
```

### Opción 3: Restaurar Apps Script anterior
1. Google Apps Script → Deployment history
2. Busca deployment anterior
3. Copia URL y actualiza GitHub Secret

## 10. Próximos Pasos Recomendados

1. **✅ Configurar GitHub Secret** (paso 1 arriba)
2. **⏳ Hacer merge a main** (paso 3)
3. **⏳ Actualizar Apps Script manualmente** (paso 5)
4. **⏳ Verificar todos los tests** (paso 8)
5. **⏳ Implementar 2FA** para acceso administrativo (futuro)
6. **⏳ Configurar CNAME DNS** si no está activo (futuro)

## Documentación de Referencia

- [SECURITY.md](./SECURITY.md) — Hallazgos de auditoría y fixes implementados
- [README.md](./README.md) — Descripción general del proyecto
- [.env.example](./.env.example) — Template de configuración de secrets

---

**Última actualización:** 2026-11-02  
**Estado:** Listo para deploy  
**Responsable:** Copilot App
