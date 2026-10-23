import { Platform, PermissionsAndroid } from 'react-native';
import Geolocation from 'react-native-geolocation-service';
import { request, PERMISSIONS, RESULTS } from 'react-native-permissions';
import { getDbConnection, getData } from '../database/db';
import { SyncWithSupabase } from '../utils/sync';

async function ensureLocationPermission() {
  if (Platform.OS === 'android') {
    const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
    return granted === PermissionsAndroid.RESULTS.GRANTED;
  } else {
    const res = await request(PERMISSIONS.IOS.LOCATION_WHEN_IN_USE);
    return res === RESULTS.GRANTED;
  }
}

export async function getCurrentLocationOrNull() {
  const ok = await ensureLocationPermission();
  if (!ok) return { lat: null, lng: null, denied: true };
  try {
    const pos = await new Promise((resolve, reject) =>
      Geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 10000,
      }),
    );
    return { lat: pos.coords.latitude, lng: pos.coords.longitude, denied: false };
  } catch {
    return { lat: null, lng: null, denied: false };
  }
}

export async function createCashMovement({ cajaId, tipo, descripcion, monto }) {
  if (!['ingreso', 'retiro'].includes(tipo)) throw new Error('Tipo debe ser ingreso o retiro');
  const val = Number(monto);
  if (!val || val <= 0) throw new Error('Monto debe ser > 0');
  if (!cajaId) throw new Error('No hay caja abierta');

  const db = await getDbConnection();
  const tempId = -Date.now();
  const nowIso = new Date().toISOString();

  // Guardar en SQLite local inmediatamente (Offline-First)
  await db.executeSql(
    `INSERT INTO movimientos (id, descripcion, monto, horaDispositivo, tipo, estadoMovil, idCaja, fecha) VALUES (?, ?, ?, ?, ?, 'actualizado', ?, ?)`,
    [tempId, descripcion?.trim() || '', val, nowIso, tipo, cajaId, nowIso]
  );

  // Actualizar saldo_final local de la caja
  try {
    if (tipo === 'ingreso') {
      await db.executeSql(`UPDATE cajas SET saldo_final = COALESCE(saldo_final, 0) + ? WHERE id = ?`, [val, cajaId]);
    } else if (tipo === 'retiro') {
      await db.executeSql(`UPDATE cajas SET saldo_final = COALESCE(saldo_final, 0) - ? WHERE id = ?`, [val, cajaId]);
    }
  } catch {}

  // Intentar sincronización en segundo plano sin bloquear si no hay conexión
  try {
    SyncWithSupabase(false, () => {});
  } catch {}

  return { id: tempId, caja_id: cajaId, tipo, descripcion, monto: val, fecha: nowIso, estadoMovil: 'actualizado' };
}

export async function listMovimientos({ cajaId, limit = 50, offset = 0, search = '' }) {
  const db = await getDbConnection();
  let sql = `SELECT id, tipo, descripcion, monto, COALESCE(horaDispositivo, fecha) AS fecha, idCaja AS caja_id, estadoMovil FROM movimientos WHERE 1=1`;
  const params = [];
  if (cajaId) {
    sql += ` AND idCaja = ?`;
    params.push(cajaId);
  }
  if (search) {
    sql += ` AND descripcion LIKE ?`;
    params.push(`%${search}%`);
  }
  sql += ` ORDER BY COALESCE(horaDispositivo, fecha) DESC LIMIT ? OFFSET ?`;
  params.push(limit, offset);

  try {
    const rows = await getData(db, sql, params);
    return rows || [];
  } catch (err) {
    console.log('listMovimientos error', err);
    return [];
  }
}
