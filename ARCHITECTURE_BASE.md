# Arquitectura Base y Guía de Construcción de Proyectos (Blueprint Oficial)

> **Propósito de este documento:**  
> Esta guía define la arquitectura estructural, patrones de diseño, estándares de código, convenciones de base de datos y flujos de trabajo probados en este proyecto. Cualquier nuevo proyecto o agente de IA que construya sobre esta base debe seguir estrictamente estas directrices para garantizar consistencia, rendimiento offline-first, seguridad y escalabilidad.

---

## 1. Filosofía y Principios Fundamentales

```
┌────────────────────────────────────────────────────────────────────────┐
│                        ARQUITECTURA DEL SISTEMA                        │
│                                                                        │
│   [ Dispositivo Móvil (React Native) ]                                  │
│   ├── UI Layer (React Components + Glassmorphic Design)                │
│   ├── EventBus (Comunicación reactiva instantánea en memoria)          │
│   ├── Services Layer (Reglas de negocio y orquestación)                │
│   ├── Sync Coordinator (Concurrencia, idempotencia y colas)            │
│   └── SQLite Local DB (Offline-first: Facturas, Pagos, Cajas, Movs)    │
│            ▲                                                           │
│            │ Sincronización Bidireccional Asíncrona (sync.js)          │
│            ▼                                                           │
│   [ Backend Cloud (Supabase PostgreSQL) ]                              │
│   ├── Auth Service (JWT + Refresh Tokens persistentes en AsyncStorage)│
│   ├── Database Triggers & Constraints (Consistencia ACID en nube)     │
│   ├── RPC Functions (SECURITY DEFINER, Transacciones atómicas)         │
│   ├── Row Level Security (RLS por organización y superior_id)          │
│   └── Storage Buckets (Multimedia con URLs firmadas)                  │
└────────────────────────────────────────────────────────────────────────┘
```

1. **Offline-First Absoluto:** La aplicación debe operar sin interrupciones incluso si el usuario pierde conexión a internet en campo. Todas las lecturas críticas se hacen primero contra la base de datos local SQLite.
2. **Dual Storage Reconciliado:** Los datos viven en SQLite local y en PostgreSQL (Supabase). La sincronización es asíncrona, tolerante a fallos y garantiza idempotencia mediante identificadores únicos (`client_uuid`, `temp_id`).
3. **Optimistic UI con Reconciliación Silenciosa:** Las acciones del usuario (crear cliente, cobrar cuota, registrar movimiento) se aplican inmediatamente en SQLite y en la interfaz. Cuando la conexión se restablece, el motor de sincronización sube los cambios en segundo plano.
4. **EventBus Reactivo en Memoria:** Ninguna pantalla debe depender de parámetros volátiles o refrescos forzados para enterarse de que otra pantalla modificó datos. Se utiliza un bus de eventos central (`eventBus.js`) con suscripciones limpias y desuscripciones en ciclo de vida.
5. **Seguridad Transaccional en Base de Datos (RPCs):** Las operaciones críticas que afectan balances, estados de créditos o aperturas de cajas nunca se ejecutan como múltiples llamadas `INSERT`/`UPDATE` sueltas desde el cliente. Se ejecutan como funciones RPC transaccionales en PostgreSQL (`BEGIN ... COMMIT`).
6. **Jerarquía Multinivel Estricta (RBAC):** La estructura organizacional soporta recursividad (`superior_id`), permitiendo que administradores exploren subordinados nivel por nivel sin violar aislamiento ni permisos.

---

## 2. Estructura de Directorios

```
zendapp/
├── src/
│   ├── assets/               # Recursos estáticos
│   │   ├── fonts/            # Tipografías personalizadas
│   │   └── images/           # Logos y fondos institucionales (fondoGeneral.png, fondoApp.png)
│   ├── components/           # Componentes UI reutilizables
│   │   ├── AnimatedSegmentedControl.js # Selector animado de pestañas
│   │   ├── AppAlert.js       # Notificaciones y alertas unificadas
│   │   ├── AppBackground.js  # Fondo institucional unificado con absoluteFill
│   │   ├── AppleButton.js    # Botones con micro-interacciones
│   │   ├── ConceptPickerModal.js # Selector modal del catálogo de conceptos
│   │   ├── PaymentReceiptModal.js # Recibo digital de pagos compartible
│   │   └── Skeleton.js       # Placeholders de carga translúcidos
│   ├── config/               # Variables de entorno seguras
│   │   └── env.js            # SUPABASE_URL, SUPABASE_ANON_KEY
│   ├── context/              # Contextos globales de React
│   │   └── AuthContext.js    # Sesión, perfil de usuario, rol y permisos
│   ├── database/             # Motor local SQLite
│   │   └── db.js             # Conexión, integridad, migraciones y helpers CRUD
│   ├── lib/                  # Clientes de servicios externos
│   │   └── supabase.js       # Inicialización, AsyncStorage y ensureAuthenticatedSession()
│   ├── screens/              # Pantallas divididas por módulos de negocio
│   │   ├── admin/            # Módulo de Administración y Jerarquía
│   │   │   ├── AdminCajas.js
│   │   │   ├── AdminCajaDetalle.js
│   │   │   ├── AdminCartera.js
│   │   │   ├── AdminCarteraDetalle.js
│   │   │   ├── AdminMorosos.js
│   │   │   ├── AdminReportes.js
│   │   │   ├── AdminUsuarios.js
│   │   │   └── components/   # Tarjetas y modales específicos del módulo admin
│   │   │       ├── CajaCard.js
│   │   │       ├── CarteraUserCard.js
│   │   │       ├── HierarchyBreadcrumb.js
│   │   │       ├── OrganizationModal.js
│   │   │       ├── UserCard.js
│   │   │       └── UserModal.js
│   │   ├── caja/             # Módulo de Caja Diaria y Arqueo
│   │   │   └── Caja.js
│   │   ├── createClient/     # Registro y Cotización de Ventas / Créditos
│   │   │   ├── CrearCliente.js
│   │   │   └── CustomPicker.js
│   │   ├── creditDetail/     # Detalle completo de crédito y cronograma de cuotas
│   │   │   └── CreditDetail.js
│   │   ├── movements/        # Ingresos, Gastos, Retiros y Evidencias
│   │   │   └── Movements.js
│   │   ├── payments/         # Ruta de Cartera, Cobros y Clientes del día
│   │   │   ├── Payments.js
│   │   │   └── components/
│   │   │       └── itemPayments.js
│   │   ├── LoginScreen.js    # Autenticación y recuperación de credenciales
│   │   └── Navigation.js     # Configuración de Tabs y Stacks según rol
│   ├── services/             # Capa de lógica de negocio y APIs
│   │   ├── adminService.js   # RPCs de usuarios, jerarquías y reportes
│   │   ├── cajaService.js    # Gestión de caja, apertura, cierre y auditoría
│   │   ├── movementsService.js # Movimientos manuales y trazabilidad
│   │   ├── multimediaService.js # Fotos de documentos y comprobantes (Storage)
│   │   └── services.js       # Servicios generales de créditos y sincronización
│   ├── theme/                # Sistema de Diseño Oficial
│   │   ├── appleTheme.js     # Mapeo retrocompatible de tokens
│   │   └── zendappTheme.js   # Paleta oficial (Rojo Escarlata, Carbón, Glassmorphism)
│   └── utils/                # Utilidades de bajo nivel
│       ├── clearLocal.js     # Depuración de memoria SQLite y caché
│       ├── eventBus.js       # Bus de eventos en memoria
│       ├── sync.js           # Motor de sincronización bidireccional
│       └── utilities.js      # Formateo de moneda, UUIDs, geolocalización y fechas
└── supabase/
    └── migrations/           # Migraciones SQL cronológicas versionadas
```

---

## 3. Capa Supabase (Backend & Cloud DB)

### 3.1 Inicialización del Cliente (`src/lib/supabase.js`)
El cliente Supabase en React Native requiere el polyfill de URL y almacenamiento en `AsyncStorage`:

```javascript
// src/lib/supabase.js
import { createClient } from '@supabase/supabase-js';
import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config/env';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    storage: AsyncStorage,
  },
});
```

### 3.2 Patrón de Sesión Activa Obligatoria (`ensureAuthenticatedSession`)
En dispositivos móviles, cuando la app pasa a segundo plano, el temporizador interno de renovación de token de Supabase se congela. Al volver a abrir la app, el token JWT puede haber expirado, arrojando errores 401.  
**Regla:** *Todos los servicios que consulten Supabase deben invocar `ensureAuthenticatedSession()` antes de realizar la llamada.*

```javascript
export async function ensureAuthenticatedSession() {
  try {
    const isLoggedOut = await AsyncStorage.getItem('app_logged_out');
    if (isLoggedOut === 'true') return null;

    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      const nowSec = Math.floor(Date.now() / 1000);
      // Si expira en menos de 120 segundos, forzar renovación preventiva
      if (session.expires_at && session.expires_at < nowSec + 120) {
        const { data: refreshData, error: refreshErr } = await supabase.auth.refreshSession();
        if (!refreshErr && refreshData?.session) return refreshData.session;
      }
      return session;
    }

    const { data: refreshData, error: refreshErr } = await supabase.auth.refreshSession();
    if (!refreshErr && refreshData?.session) return refreshData.session;
  } catch (err) {
    console.log('ensureAuthenticatedSession error:', err);
  }
  return null;
}
```

### 3.3 Convención de Funciones RPC en PostgreSQL
- Todas las operaciones críticas de negocio se implementan en la base de datos con `SECURITY DEFINER`.
- Cada función verifica internamente el usuario invocador mediante `auth.uid()`.
- Los parámetros llevan el prefijo `p_` (ejemplo: `p_caja_id`, `p_monto`).

```sql
CREATE OR REPLACE FUNCTION public.admin_create_caja_movement(
  p_caja_id uuid,
  p_tipo text,
  p_monto numeric,
  p_descripcion text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_mov_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado';
  END IF;

  INSERT INTO public.cash_movements (caja_id, usuario_id, tipo, monto, descripcion)
  VALUES (p_caja_id, v_user_id, p_tipo, p_monto, p_descripcion)
  RETURNING id INTO v_mov_id;

  RETURN jsonb_build_object('success', true, 'id', v_mov_id);
END;
$$;
```

---

## 4. Almacenamiento Local SQLite (`src/database/db.js`)

### 4.1 Configuración del Driver
Se utiliza `react-native-sqlite-storage` en modo promesas:

```javascript
import { enablePromise, openDatabase } from 'react-native-sqlite-storage';
enablePromise(true);

export const getDbConnection = async () => {
  return openDatabase({ name: 'Zendapp.db', location: 'default' });
};
```

### 4.2 Integridad y Migración Dinámica de Esquema (`ensureColumnExists`)
Para evitar que una actualización de la app rompa bases de datos SQLite locales existentes, se usa el patrón `ensureDatabaseIntegrity`:

```javascript
async function ensureColumnExists(db, table, column, colType = 'TEXT') {
  try {
    const results = await db.executeSql(`PRAGMA table_info(${table})`);
    let exists = false;
    if (results && results.length) {
      results.forEach(res => {
        for (let i = 0; i < res.rows.length; i++) {
          if (res.rows.item(i)?.name?.toLowerCase() === column.toLowerCase()) {
            exists = true;
            break;
          }
        }
      });
    }
    if (!exists) {
      await db.executeSql(`ALTER TABLE ${table} ADD COLUMN ${column} ${colType}`);
    }
  } catch {}
}
```

### 4.3 Helpers CRUD Estándar
- `getData(db, query, params)`: Devuelve un array de objetos JavaScript planos.
- `insertTables(db, tableName, fieldsArray)`: Inserción dinámica limpia de objetos.
- `updateData(db, query, params)`: Ejecución de updates transaccionales.

---

## 5. Motor de Sincronización Asíncrono (`src/utils/sync.js`)

### 5.1 Coordinador de Concurrencia en Memoria
Evita carreras críticas cuando múltiples pantallas o temporizadores solicitan sincronización a la vez:

```javascript
let isSyncing = false;
let hasPendingSync = false;
let activeSyncPromise = null;

export const SyncWithSupabase = async (toast = true, callLoading = () => {}) => {
  if (isSyncing) {
    hasPendingSync = true;
    if (activeSyncPromise) {
      try {
        const res = await activeSyncPromise;
        callLoading(res);
        return res;
      } catch {
        callLoading(false);
        return false;
      }
    }
    return false;
  }

  isSyncing = true;
  hasPendingSync = false;
  activeSyncPromise = (async () => {
    try {
      // 1. Verificar red
      // 2. Subir ventas locales pendientes (estadoMovil = 'pendiente')
      // 3. Subir pagos locales pendientes
      // 4. Subir movimientos de caja locales
      // 5. Descargar datos frescos de la nube hacia SQLite
      // 6. Emitir evento central de sincronización
      eventBus.emit(EVENTS.SYNC_COMPLETED);
      return true;
    } finally {
      isSyncing = false;
      activeSyncPromise = null;
      if (hasPendingSync) {
        hasPendingSync = false;
        SyncWithSupabase(false, () => {});
      }
    }
  })();

  return activeSyncPromise;
};
```

### 5.2 Estrategia de Idempotencia y Estados Móviles
Cada registro que nace en el cliente móvil recibe un UUID local:
- `estadoMovil = 'pendiente'`: Creado offline, pendiente de subir a Supabase.
- `estadoMovil = 'actualizado'`: Modificado en SQLite, requiere sincronizar.
- `estadoMovil = 'sincronizado'`: Confirmado por la nube con su ID definitivo.

---

## 6. Jerarquía Multinivel y Control de Acceso (RBAC)

```
        [ SUPERADMIN ]
              │
        [ ADMINISTRADOR ] ─── (Caja Maestra de Rama)
              │
        [ SUB-ADMIN ]     ─── (Caja de Zona / Supervisor)
              │
        [ VENDEDOR ]      ─── (Caja Operativa Diaria de Ruta)
              │
        [ CLIENTE ]       ─── (Créditos y Cuotas)
```

### 6.1 Estructura en Base de Datos
- `public.profiles`: Contiene la columna `superior_id UUID REFERENCES public.profiles(id)`.
- `public.cajas`: Contiene la columna `admin_caja_id UUID REFERENCES public.cajas(id)`.

### 6.2 Navegación Jerárquica en Frontend (`HierarchyBreadcrumb.js`)
Las vistas de administración de Cartera, Cajas y Usuarios utilizan una pila en memoria (`hierarchyStack`):
1. **Nivel 0:** Cajas o cartera de subordinados directos del administrador logueado.
2. **Nivel 1+:** Al tocar *"Ver equipo"* en una tarjeta, se hace push al stack con `{ id: item.usuario_id, name: item.nombre_usuario }`.
3. El componente `HierarchyBreadcrumb` renderiza la ruta: `Inicio > Zona Norte > Carlos Vendedor`.
4. El botón volver o el botón atrás de hardware hace pop en la jerarquía antes de salir de la pantalla.

---

## 7. Capa de Servicios (`src/services/`)

### 7.1 Reglas para Nuevos Servicios
1. **Nunca** importar `supabase` directamente dentro de un componente o pantalla UI.
2. Toda interacción con datos debe residir en un archivo dentro de `src/services/`.
3. El servicio debe validar parámetros, ejecutar `ensureAuthenticatedSession()` y normalizar la respuesta.
4. Si la operación afecta datos que otras pantallas muestran, el servicio debe emitir el evento correspondiente en `eventBus`.

### 7.2 Plantilla para un Nuevo Servicio
```javascript
// src/services/ejemploService.js
import { supabase, ensureAuthenticatedSession } from '../lib/supabase';
import { getDbConnection, getData } from '../database/db';
import { eventBus, EVENTS } from '../utils/eventBus';

export const registrarTransaccion = async ({ monto, descripcion, metadata = {} }) => {
  // 1. Validaciones previas
  if (!monto || monto <= 0) throw new Error('El monto debe ser superior a cero.');
  if (!descripcion?.trim()) throw new Error('La descripción es obligatoria.');

  // 2. Asegurar token válido
  await ensureAuthenticatedSession();

  // 3. Ejecutar llamada RPC segura
  const { data, error } = await supabase.rpc('crear_transaccion_segura', {
    p_monto: monto,
    p_descripcion: descripcion.trim(),
    p_metadata: metadata,
  });

  if (error) {
    throw new Error(error.message || 'Error registrando la transacción');
  }

  // 4. Guardar espejo en SQLite local si aplica
  const db = await getDbConnection();
  await db.executeSql(
    `INSERT INTO transacciones_locales (id, monto, descripcion, estado) VALUES (?, ?, ?, 'sincronizado')`,
    [data.id, monto, descripcion]
  );

  // 5. Notificar a las vistas que estén escuchando
  eventBus.emit(EVENTS.MOVEMENT_CHANGED, data);

  return data;
};
```

---

## 8. Sistema de Diseño, UI y Glassmorphism

### 8.1 Paleta de Color Institucional (`src/theme/zendappTheme.js`)
- **Brand Red (Primario):** `#EE272D` (Acciones principales, estados de mora, destacados).
- **Carbon Dark (Estructura):** `#1E1E1F` (Títulos, texto principal, elementos de soporte).
- **Verde Éxito:** `#10B981` (Recaudos, cuotas al día, caja abierta).
- **Ámbar Alerta:** `#F59E0B` (Vencimientos próximos, pagos parciales).
- **Fondos Translúcidos (Glassmorphism):**
  - `card`: `'rgba(255, 255, 255, 0.88)'` (Permite ver el fondo institucional con legibilidad perfecta).
  - `surfaceSubtle`: `'rgba(248, 249, 250, 0.75)'` (Contenedores y tablas interiores).
  - `header`: `'rgba(255, 255, 255, 0.90)'` (Encabezados limpios con división sutil).

### 8.2 Regla de Oro para Pantallas con Fondo Institucional
Para que el fondo nunca se pierda en ningún estado (cargando, con datos o lista vacía):
1. Importar `AppBackground`: `import AppBackground from '../../components/AppBackground';`
2. En `styles.root`, siempre definir: `root: { flex: 1, backgroundColor: 'transparent' }`
3. Colocar `<AppBackground />` **inmediatamente como primer hijo** del `<SafeAreaView>` en **todos** los retornos de la pantalla:

```javascript
export default function MiPantalla() {
  if (loading) {
    return (
      <SafeAreaView style={styles.root}>
        <AppBackground />
        <SkeletonList />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root}>
      <AppBackground />
      {/* Contenido de la vista */}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'transparent' },
  // ...
});
```

### 8.3 Diseño de Estados Vacíos (`styles.empty`)
Cuando una lista no tenga elementos, nunca mostrar texto flotando sobre fondos opacos. Se debe enmarcar como una tarjeta translúcida:

```javascript
empty: {
  alignItems: 'center',
  justifyContent: 'center',
  paddingVertical: 36,
  paddingHorizontal: 20,
  marginHorizontal: 16,
  marginTop: 24,
  backgroundColor: 'rgba(255, 255, 255, 0.85)',
  borderRadius: 16,
  borderWidth: 1.2,
  borderColor: 'rgba(216, 220, 228, 0.85)',
}
```

---

## 9. Checklist para Crear un Nuevo Proyecto Basado en este Modelo

Al iniciar un proyecto derivado o un nuevo módulo, sigue este checklist:

- [ ] **1. Configuración de Entorno:**
  - Instalar dependencias base: `@supabase/supabase-js`, `react-native-url-polyfill`, `@react-native-async-storage/async-storage`, `react-native-sqlite-storage`, `react-native-vector-icons`, `react-native-toast-message`.
  - Crear `src/config/env.js` con las llaves de Supabase.

- [ ] **2. Conexión Supabase:**
  - Copiar `src/lib/supabase.js` implementando `ensureAuthenticatedSession()`.

- [ ] **3. Motor Local SQLite:**
  - Crear `src/database/db.js` con `openDatabase` y la función `ensureDatabaseIntegrity`.
  - Implementar los helpers `getData`, `insertTables` y `updateData`.

- [ ] **4. Bus de Eventos y Sincronización:**
  - Instanciar `src/utils/eventBus.js`.
  - Configurar `src/utils/sync.js` con el coordinador de sincronización en memoria.

- [ ] **5. Sistema de Diseño:**
  - Replicar `src/theme/zendappTheme.js` y `src/theme/appleTheme.js` con los tokens de translúcido.
  - Implementar `src/components/AppBackground.js` con `resizeMode="cover"`.

- [ ] **6. Autenticación y Navegación:**
  - Configurar `src/context/AuthContext.js` para proveer sesión, perfil y permisos al árbol.
  - Configurar `src/screens/Navigation.js` con Bottom Tabs condicionales según el rol.

- [ ] **7. Base de Datos Cloud (PostgreSQL Migrations):**
  - Escribir migraciones en `supabase/migrations/` con nombres cronológicos (`YYYYMMDDHHMMSS_*.sql`).
  - Activar Row Level Security (`ENABLE ROW LEVEL SECURITY`) en todas las tablas públicas.
  - Crear RPCs con `SECURITY DEFINER` para operaciones transaccionales complejas.

