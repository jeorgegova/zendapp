import { getDbConnection, getData } from '../database/db';
import AsyncStorage from '@react-native-async-storage/async-storage';

export async function clearAllLocalData() {
  const db = await getDbConnection();
  try {
    // Tablas locales conocidas (SQLite) - borrar pendientes y sincronizados si quieres reinicio total
    const tables = await getData(db, `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'android_%'`);
    const toClear = tables?.map(t => t.name) || ['pagos', 'detallesCaja', 'movimientos', 'facturas', 'clients', 'parametrizacion', 'consecutivoTramitado', 'writeDate', 'cajaDay'];
    for (const tbl of toClear) {
      try { await db.executeSql(`DELETE FROM ${tbl}`); } catch {}
    }
    // Reset contadores
    try { await db.executeSql(`UPDATE consecutivoTramitado SET valor = 0 WHERE id = 1`); } catch {}
    try { await db.executeSql(`UPDATE writeDate SET valor = NULL`); } catch {}
    // AsyncStorage
    await AsyncStorage.clear();
    // Alternativa nuclear: borrar archivo DB (requiere reiniciar app)
    // await db.executeSql(`VACUUM`);
    return true;
  } catch (e) {
    console.log('clearAllLocalData error', e);
    return false;
  }
}

export async function clearOnlyPendingSync() {
  const db = await getDbConnection();
  try {
    await db.executeSql(`DELETE FROM pagos WHERE id < 0 OR estadoMovil = 'actualizado'`);
    await db.executeSql(`DELETE FROM detallesCaja WHERE estado = 'guardado' OR estadoMovil = 'actualizado'`);
    await db.executeSql(`DELETE FROM movimientos WHERE id < 0`);
    // Marcar facturas como sincronizadas para no reintentar
    await db.executeSql(`UPDATE facturas SET estadoMovil = 'sincronizado' WHERE estadoMovil = 'actualizado'`);
    return true;
  } catch (e) { console.log(e); return false; }
}
