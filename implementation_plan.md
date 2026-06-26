# 🚀 Plan Estratégico: ELITE FTNS — Fase 1 Completa

## Contexto y Objetivo

El sistema ya tiene su núcleo técnico implementado (gestión de clientes, rutinas, seguimiento de progreso, valoración antropométrica, nutrición, bitácora diaria). La Fase 1 se divide ahora en dos procesos paralelos y complementarios con un objetivo claro: **validar el producto y definir el modelo de precios mediante datos reales**, antes de cualquier inversión en marketing masivo.

---

## 🔷 PARTE 1 — Beta Cerrada: Sistema Base para Entrenadores Seleccionados

### Objetivo
Lanzar una beta funcional, estable y completa a un grupo reducido y selecto de entrenadores, recopilar feedback de uso real y detectar mejoras antes del lanzamiento público.

### 1.1 — Checklist de Funciones Core (Sistema Base)

Antes de lanzar la beta, verificar que las siguientes funciones estén **100% operativas**:

| # | Módulo | Función | Estado a Verificar |
|---|--------|---------|-------------------|
| 1 | **Autenticación** | Registro/Login entrenador, JWT seguro | ✅ Verificar en producción (Render) |
| 2 | **Clientes** | Crear, editar, eliminar clientes | ✅ Verificar |
| 3 | **Rutinas** | Crear plantillas globales, asignar a clientes, "Cambiar Rutina" unificado | ✅ Verificar |
| 4 | **Progreso** | Registro de pesos/marcas semana a semana, gráficas | ✅ Verificar |
| 5 | **Valoración Antropométrica** | Campos dinámicos por entrenador, ficha custom | ✅ Verificar |
| 6 | **Nutrición** | Planes de alimentación, plantillas globales, asignación a cliente | ✅ Verificar |
| 7 | **Bitácora Diaria** | Checklist de ejercicios + comidas, registro de peso e hidratación | ✅ Verificar |
| 8 | **Vista Cliente** | App móvil / PWA: ver rutina, nutrición, marcar completados | ✅ Verificar |
| 9 | **Multi-tenant** | Aislamiento de datos entre entrenadores | ✅ Crítico |
| 10 | **Seguridad** | Sin SQL injection, endpoints protegidos por JWT | ✅ Crítico |

### 1.2 — Perfil del Entrenador Beta

Criterios de selección para los entrenadores de la beta cerrada:

- Entrenadores personales activos con clientela real (mínimo 3–5 clientes activos)
- Disposición a dar feedback honesto y estructurado
- Preferiblemente tech-friendly (no necesariamente expertos, pero cómodos con apps)
- Diversidad de especialidades: fuerza, calistenia, pérdida de peso, nutrición deportiva
- **Cupos sugeridos: 5 a 10 entrenadores** (manejable para soporte y análisis)

### 1.3 — Proceso de Onboarding de Entrenadores Beta

```
1. Contacto inicial (DM/WhatsApp) con el copy de publicidad aprobado
2. Filtrado: confirmar que cumple el perfil ideal
3. Invitación oficial + envío de URL del sistema (Render)
4. Sesión de onboarding breve (15 min por llamada o video explicativo grabado)
5. Acceso al sistema: registro de cuenta propia
6. Seguimiento semanal: check-in informal de 5 minutos
7. Al final del período beta (4 semanas): encuesta de feedback estructurada
```

### 1.4 — Formulario de Feedback de Funcionamiento (Beta)

**Categorías de preguntas:**

#### Sección A: Experiencia General
- Del 1 al 10, ¿qué tan fácil fue aprender a usar el sistema?
- ¿Qué fue lo primero que usaste? ¿Fue intuitivo?
- ¿Desde qué dispositivo usas más el sistema? (PC / Móvil / Tablet)

#### Sección B: Módulos Específicos
- ¿Usas la gestión de clientes? ¿Qué falta?
- ¿Creas rutinas con el sistema? ¿El flujo es cómodo?
- ¿Has usado el módulo de nutrición? ¿Es suficiente o necesitas más?
- ¿Has registrado progreso de clientes? ¿Las gráficas te ayudan?
- ¿Tus clientes usan la app? ¿Cómo ha sido su experiencia?

#### Sección C: Bugs y Fricciones
- ¿Encontraste algún error o comportamiento extraño? (describir)
- ¿Hay algo que querías hacer y no pudiste?
- ¿Qué función te parece más incompleta o limitada?

#### Sección D: Valor Percibido
- ¿Este sistema te ahorra tiempo en tu trabajo? ¿Cuánto aproximadamente por semana?
- ¿Lo recomendarías a otro entrenador? ¿Por qué?
- ¿Qué es lo que más valoras del sistema?
- ¿Qué es lo más urgente que agregarías o mejorarías?

### 1.5 — Duración de la Beta Cerrada

| Fase | Duración | Actividad |
|------|----------|-----------|
| Onboarding | Semana 1 | Registro, configuración inicial, primera sesión de uso |
| Uso activo | Semanas 2 y 3 | Uso libre con soporte disponible |
| Feedback final | Semana 4 | Encuesta formal + recopilación de comentarios |
| Análisis | Semana 5 | Síntesis de hallazgos, priorización de mejoras |

---

## 🔶 PARTE 2 — Estudio de Mercado: Encuesta + Casa de Calidad (QFD)

### Objetivo
Determinar el **rango de precios óptimo** para la suscripción y entender qué características del sistema son las que más valor generan en el mercado, usando el método **Casa de la Calidad (QFD — Quality Function Deployment)**.

---

### 2.1 — Diseño de la Encuesta de Mercado

> [!IMPORTANT]
> La encuesta NO pregunta directamente "¿cuánto pagarías?". Usa técnicas psicológicas validadas (Van Westendorp Price Sensitivity Meter y escala de valor percibido) para obtener datos de precios confiables y sin sesgo.

**Audiencia objetivo:** Entrenadores personales independientes, coaches de fitness, instructores de gym — que aún NO usen el sistema (muestra externa, no beta).

**Canal:** Google Forms / Typeform enviado por DM en Instagram, grupos de entrenadores en WhatsApp/Telegram, LinkedIn.

**Tamaño de muestra meta:** Mínimo 30 respuestas válidas (idealmente 50+).

---

#### 📋 ESTRUCTURA DE LA ENCUESTA

**Introducción (sin mencionar el sistema ni precio):**
> *"Hola, somos un equipo de desarrollo creando herramientas para entrenadores personales. Tu opinión es clave para nosotros. Esta encuesta es 100% anónima y toma menos de 5 minutos."*

---

**BLOQUE 1: Perfil del Entrenador**
1. ¿Cuántos años llevas como entrenador personal / coach de fitness?
   - [ ] Menos de 1 año
   - [ ] 1–3 años
   - [ ] 3–6 años
   - [ ] Más de 6 años

2. ¿Cuántos clientes activos manejas actualmente?
   - [ ] 1–5 clientes
   - [ ] 6–15 clientes
   - [ ] 16–30 clientes
   - [ ] Más de 30 clientes

3. ¿Cómo gestionas actualmente tu negocio de entrenamiento? (Selección múltiple)
   - [ ] WhatsApp / Telegram
   - [ ] Hojas de Excel / Google Sheets
   - [ ] Aplicación específica de fitness (¿cuál? ___)
   - [ ] No uso ninguna herramienta digital
   - [ ] Otro: ___

4. ¿Cuál es tu mayor dolor de cabeza al gestionar clientes? (Selección múltiple)
   - [ ] Perder historial de progresos
   - [ ] Crear y enviar rutinas tarda mucho
   - [ ] Hacer seguimiento de la nutrición
   - [ ] Comunicación desordenada con el cliente
   - [ ] Olvidar registrar datos de sesiones
   - [ ] No tengo una imagen profesional frente al cliente

---

**BLOQUE 2: Valoración de Características**

*"Imagina una plataforma digital diseñada específicamente para entrenadores. Por favor, califica qué tan importante es para ti cada función (1 = Nada importante, 5 = Imprescindible):"*

| Característica | 1 | 2 | 3 | 4 | 5 |
|----------------|---|---|---|---|---|
| Gestión centralizada de clientes (perfil, datos, historial) | | | | | |
| Creador de rutinas personalizadas y asignables | | | | | |
| Seguimiento de progreso con gráficas (pesos, marcas) | | | | | |
| Planes de nutrición y alimentación personalizados | | | | | |
| App móvil para que tu cliente vea su plan en tiempo real | | | | | |
| Valoración y ficha antropométrica del cliente | | | | | |
| Bitácora diaria del cliente (check de ejercicios y comidas) | | | | | |
| Imagen profesional / branding de tu marca | | | | | |
| Acceso desde cualquier dispositivo (PC, móvil, tablet) | | | | | |
| Seguridad y privacidad de los datos de tus clientes | | | | | |

---

**BLOQUE 3: Percepción de Precio (Van Westendorp — 4 preguntas clave)**

*"Hablando de una plataforma con LAS CARACTERÍSTICAS QUE MARCASTE COMO IMPORTANTES, con acceso ilimitado de clientes, responde lo siguiente:"*

5. ¿A qué precio mensual (en dólares o tu moneda local) considerarías que esta plataforma es **tan barata** que empezarías a dudar de su calidad?
   `$___`

6. ¿A qué precio mensual considerarías que la plataforma tiene un **precio razonable y justo** por lo que ofrece?
   `$___`

7. ¿A qué precio mensual comenzarías a pensar que es **cara**, aunque todavía la considerarías?
   `$___`

8. ¿A qué precio mensual la considerarías **demasiado cara** y definitivamente NO la comprarías?
   `$___`

---

**BLOQUE 4: Disposición de Compra**

9. Si existiera esta plataforma HOY, ¿cuál sería tu reacción?
   - [ ] La usaría inmediatamente si hay versión gratuita o de prueba
   - [ ] La compraría al precio que indiqué como razonable
   - [ ] Primero necesitaría verla funcionando (demo / referidos)
   - [ ] Seguiría con mi método actual

10. ¿Qué modelo de suscripción prefieres?
    - [ ] Mensual (pago mes a mes, mayor flexibilidad)
    - [ ] Anual (descuento por pago adelantado)
    - [ ] Por número de clientes (pago según cuántos clientes manejas)
    - [ ] Plan freemium (gratis con límite, premium sin límite)

11. ¿Qué haría que definitivamente SÍ pagaras por esta plataforma? *(respuesta abierta)*

12. ¿Hay algo que no hemos mencionado y que sería clave para ti? *(respuesta abierta)*

---

### 2.2 — Metodología: Casa de la Calidad (QFD)

La **Casa de la Calidad** nos permitirá traducir las necesidades del cliente (entrenadores) en características técnicas priorizadas del sistema, cruzando la encuesta con los módulos ya construidos.

#### Estructura del QFD para ELITE FTNS

**VOZ DEL CLIENTE (Qué quieren)** → Columna izquierda, extraída de las preguntas de valoración de la encuesta:

| ID | Necesidad del Cliente | Importancia (Encuesta) |
|----|----------------------|----------------------|
| NC1 | Organizar y no perder historial de clientes | Alta |
| NC2 | Crear rutinas rápido y profesional | Alta |
| NC3 | Ver progreso de clientes con datos reales | Alta |
| NC4 | Dar orientación nutricional desde el sistema | Media |
| NC5 | Que el cliente acceda a su plan desde el celular | Alta |
| NC6 | Imagen profesional frente al cliente | Media |
| NC7 | Seguridad y privacidad de datos | Alta |
| NC8 | Ficha de valoración física del cliente | Media |
| NC9 | Que sea fácil de usar sin entrenamiento técnico | Alta |
| NC10 | Acceso desde cualquier dispositivo | Alta |

**CARACTERÍSTICAS TÉCNICAS (Cómo lo hacemos)** → Fila superior, módulos del sistema:

| ID | Característica Técnica |
|----|----------------------|
| CT1 | Base de datos multi-tenant aislada por entrenador |
| CT2 | Editor de rutinas con plantillas globales |
| CT3 | Módulo de progreso con gráficas |
| CT4 | Módulo de nutrición con planes personalizados |
| CT5 | App PWA accesible desde móvil sin instalación |
| CT6 | UI/UX con branding profesional (dark mode + neón) |
| CT7 | JWT + protección de endpoints + sin SQL injection |
| CT8 | Ficha antropométrica con campos dinámicos |
| CT9 | Onboarding guiado + flujos simples |
| CT10 | Deploy en la nube (Render) — responsive design |

**Matriz de Relaciones (9 = Fuerte, 3 = Media, 1 = Débil):**

|     | CT1 | CT2 | CT3 | CT4 | CT5 | CT6 | CT7 | CT8 | CT9 | CT10 |
|-----|-----|-----|-----|-----|-----|-----|-----|-----|-----|------|
| NC1 |  9  |  3  |  9  |  3  |  1  |  1  |  9  |  3  |  1  |  3   |
| NC2 |  1  |  9  |  3  |  1  |  3  |  3  |  1  |  1  |  9  |  1   |
| NC3 |  3  |  3  |  9  |  3  |  9  |  1  |  3  |  3  |  3  |  3   |
| NC4 |  1  |  1  |  3  |  9  |  3  |  1  |  1  |  1  |  3  |  1   |
| NC5 |  1  |  1  |  3  |  1  |  9  |  3  |  3  |  1  |  3  |  9   |
| NC6 |  1  |  3  |  3  |  1  |  3  |  9  |  1  |  1  |  1  |  3   |
| NC7 |  9  |  1  |  1  |  1  |  3  |  1  |  9  |  1  |  1  |  1   |
| NC8 |  3  |  1  |  3  |  3  |  1  |  1  |  3  |  9  |  3  |  1   |
| NC9 |  1  |  3  |  1  |  1  |  3  |  3  |  1  |  1  |  9  |  3   |
| NC10|  1  |  1  |  1  |  1  |  9  |  1  |  1  |  1  |  1  |  9   |

> [!NOTE]
> Esta matriz se **actualizará con los puntajes reales de importancia** una vez tengamos los resultados de la encuesta. Los valores de importancia actuales son estimados basados en la lógica del negocio.

---

### 2.3 — Análisis de Precio con Van Westendorp

Con las 4 preguntas de precio de la encuesta, construiremos 4 curvas de precio:

```
Curva 1: "Demasiado barato" (precio de sospecha de calidad) → línea creciente
Curva 2: "Barato pero aceptable" (precio razonable) → línea creciente
Curva 3: "Caro pero aceptable" → línea decreciente
Curva 4: "Demasiado caro" (precio de rechazo) → línea decreciente

Los 4 puntos clave:
- PME (Punto de Marginal de Economía): intersección curvas 1 y 3
- PMC (Punto de Marginal de Carestía): intersección curvas 2 y 4  
- PPA (Punto de Precio Aceptable): intersección curvas 1 y 4 → PRECIO ÓPTIMO INFERIOR
- PPO (Punto de Precio Óptimo): intersección curvas 2 y 3 → PRECIO ÓPTIMO SUPERIOR
```

**Rango de precios objetivo:** entre PPA y PPO → Es el "Rango de Precios Aceptables" donde la resistencia al precio es mínima.

---

### 2.4 — Entregables del Estudio de Mercado

| Entregable | Descripción |
|-----------|-------------|
| 📊 Reporte de encuesta | Análisis de frecuencias, gráficas de valoración por módulo |
| 💰 Análisis Van Westendorp | Gráfica de las 4 curvas + identificación del rango óptimo de precios |
| 🏠 Casa de la Calidad | Matriz QFD completa con priorización de características técnicas |
| 📋 Recomendaciones de precios | Plan de precios sugerido: mensual / anual / plan básico vs premium |
| 🎯 Backlog priorizado | Lista de mejoras al sistema ordenadas por impacto en el mercado |

---

## 📅 Cronograma General — Fase 1 Completa

```
Semana 1:  ► Verificación técnica del sistema base (checklist de funciones)
           ► Diseño final y lanzamiento de la encuesta de mercado
           ► Contacto y selección de entrenadores beta

Semana 2:  ► Onboarding de entrenadores beta (acceso + sesión explicativa)
           ► Recolección activa de respuestas en la encuesta (push en redes)

Semana 3:  ► Uso activo del sistema por los betas
           ► Cierre de la encuesta de mercado (mínimo 30 respuestas)
           ► Análisis preliminar de la encuesta

Semana 4:  ► Feedback final de entrenadores beta (formulario estructurado)
           ► Análisis completo de encuesta + Van Westendorp

Semana 5:  ► Construcción de la Casa de la Calidad con datos reales
           ► Síntesis de feedback del sistema
           ► Definición del modelo de precios y backlog priorizado
           ► Informe final: decisiones para la Fase 2
```

---

## 🎯 Resultados Esperados al Finalizar la Fase 1

1. ✅ **Sistema validado** en condiciones reales de uso por entrenadores reales
2. ✅ **Lista de bugs y mejoras** priorizadas por impacto real
3. ✅ **Rango de precios óptimo** basado en datos de mercado (Van Westendorp)
4. ✅ **Casa de la Calidad completa** con características priorizadas por el cliente
5. ✅ **Decisiones informadas** para el modelo de suscripción de la Fase 2
6. ✅ **Testimonio y referidos** de los entrenadores beta para usar en marketing

---

## ❓ Preguntas Abiertas

> [!IMPORTANT]
> **Moneda de la encuesta:** ¿Las preguntas de precio serán en USD, COP, MXN, u otra moneda? Depende del mercado target principal. Recomiendo USD con nota de conversión aproximada, o preguntar la moneda al inicio.

> [!IMPORTANT]
> **¿Tenemos ya entrenadores identificados para la beta?** Si hay candidatos del entorno cercano (contactos directos), hay que empezar el proceso de contacto en paralelo al checklist técnico.

> [!IMPORTANT]
> **Canal de la encuesta:** ¿Usamos Google Forms o Typeform? Typeform tiene mejor UX y tasa de completado mayor, pero Google Forms es gratuito. ¿Hay presupuesto para Typeform?

> [!NOTE]
> **Sobre la Casa de la Calidad:** La versión presentada aquí es la estructura base. Una vez tengamos los resultados de la encuesta (puntajes reales de importancia por característica), la matriz QFD se actualizará con datos reales y se calcularán los puntajes de importancia técnica ponderados.
