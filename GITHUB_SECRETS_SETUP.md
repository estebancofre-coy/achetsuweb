# Configuración de GitHub Secrets

## Secreto Configurado ✅

- **Nombre**: `ACHETSU_APPS_SCRIPT_URL`
- **Valor**: Tu URL `/exec` del Apps Script
- **Creado**: 2026-11-02
- **Método**: GitHub CLI (`gh secret set`)

## Cómo Acceder en la UI

Para repos **públicos** en GitHub.com, los secrets no aparecen en la UI tradicional de settings. 

### Opción A: Usar GitHub CLI (Recomendado)
```bash
# Listar secrets
gh secret list

# Actualizar secret
gh secret set ACHETSU_APPS_SCRIPT_URL --body "nueva-url"

# Eliminar secret
gh secret remove ACHETSU_APPS_SCRIPT_URL
```

### Opción B: Acceder por API
```bash
# Listar secrets (sin valores - están encriptados)
gh api repos/estebancofre-coy/achetsuweb/actions/secrets

# Crear/actualizar secret
gh api repos/estebancofre-coy/achetsuweb/actions/secrets/ACHETSU_APPS_SCRIPT_URL \
  --input - <<< '{"encrypted_value": "..."}'
```

### Opción C: Interfaz Web (Para Repos Privados)
Si el repo fuera privado, la URL sería:
```
https://github.com/estebancofre-coy/achetsuweb/settings/secrets/actions
```

Pero como este es público, usa **GitHub CLI** (Opción A).

## Cuándo Actualizar Este Secret

**El secret debe actualizarse después de cada re-deployment del Apps Script:**

1. Haz cambios en `apps-script/Code.gs`
2. Copiam-pégalos manualmente en apps-script-editor.google.com
3. Haz Deploy → New Deployment → Web app → Deploy
4. **Copia la nueva URL `/exec`**
5. Actualiza el secret:
   ```bash
   gh secret set ACHETSU_APPS_SCRIPT_URL --body "nueva-url-aqui"
   ```
6. La siguiente vez que se dispare el workflow (push/PR), usará la nueva URL

## Workflow Afectado

- `.github/workflows/deploy-pages.yml`: Usa `${{ secrets.ACHETSU_APPS_SCRIPT_URL }}` en el paso "Inject Apps Script URL securely"

## Documentación Relacionada

- Ver: `DEPLOY.md` (paso 6 de 10)
- Ver: `SECURITY.md` (estrategia de inyección segura de URLs)
