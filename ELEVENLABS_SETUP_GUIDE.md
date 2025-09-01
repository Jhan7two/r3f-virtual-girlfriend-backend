# 🔧 Guía de Configuración de ElevenLabs

## Problema Detectado
Tu API key actual no tiene los permisos necesarios para generar audio.

## Permisos Requeridos

Para que el sistema funcione correctamente, tu API key necesita estos permisos:

### ✅ Permisos Mínimos Necesarios:
- **Text to Speech**: `Acceso` (actualmente: Sin acceso ❌)
- **Voces**: `Leer` (actualmente: Sin acceso ❌)

### 🔧 Cómo Solucionarlo:

#### Opción 1: Actualizar Permisos de la API Key Actual
1. Ve a tu dashboard de ElevenLabs
2. Encuentra tu API key actual
3. Haz clic en "Editar clave de API"
4. Habilita estos permisos:
   - **Text to Speech**: Cambiar a "Acceso"
   - **Voces**: Cambiar a "Leer"
5. Guarda los cambios

#### Opción 2: Crear Nueva API Key (Recomendado)
1. Ve a https://elevenlabs.io/app/speech-synthesis/api-keys
2. Haz clic en "Create API Key"
3. Configura los permisos:
   - **Text to Speech**: ✅ Acceso
   - **Voces**: ✅ Leer
4. Copia la nueva API key
5. Actualiza tu archivo `.env`:
   ```
   ELEVEN_LABS_API_KEY=tu_nueva_api_key_aqui
   ```

## 🧪 Verificación

Después de actualizar los permisos, puedes verificar que funciona:

### 1. Reinicia el servidor:
```bash
npm start
```

### 2. Verifica el estado:
```bash
curl http://localhost:3000/health
```

### 3. Prueba la validación:
```bash
curl http://localhost:3000/elevenlabs/validate
```

### 4. Lista las voces disponibles:
```bash
curl http://localhost:3000/voices
```

## 🎯 Resultado Esperado

Una vez configurado correctamente, deberías ver:
- ✅ ElevenLabs status: "healthy"
- ✅ API connectivity: "Valid"
- ✅ Voice validation: "Valid"
- ✅ Lista de voces disponibles

## 🚨 Notas Importantes

- Los permisos de API key pueden tardar unos minutos en propagarse
- Si usas el plan gratuito, verifica que no hayas excedido los límites
- Guarda tu API key de forma segura y no la compartas

## 🔍 Troubleshooting

Si sigues teniendo problemas:

1. **Verifica tu plan**: Algunos permisos requieren planes de pago
2. **Revisa los límites**: El plan gratuito tiene límites de uso
3. **Contacta soporte**: Si los permisos no se actualizan

## 📱 Impacto en el Frontend

Con los permisos correctos:
- ✅ Audio real generado por ElevenLabs
- ✅ Lipsync preciso basado en audio real
- ✅ Mejor experiencia de usuario
- ✅ Sin fallbacks necesarios