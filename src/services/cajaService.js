import NetInfo from '@react-native-community/netinfo';
import { supabase } from '../lib/supabase';
import { getDbConnection, getData } from '../database/db';

export async function saveCajaLocal(db, caja, userId = null) {
  if (!caja || !caja.id) return;
  const uid = userId || caja.usuario_id || null;
  const fecha = caja.fecha_apertura || caja.fecha || new Date().toISOString();
  const estado = caja.estado || 'abierta';
  const saldoIni = Number(caja.saldo_inicial) || 0;
  const saldoFin = caja.saldo_final != null ? Number(caja.saldo_final) : null;
  const fechaCierre = caja.fecha_cierre || null;

  try {
    await db.executeSql(
      `INSERT OR REPLACE INTO cajas (
        id, estado, saldo_inicial, saldo_final, fecha_apertura, fecha_cierre, usuario_id, fecha
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [String(caja.id), estado, saldoIni, saldoFin, fecha, fechaCierre, uid, fecha]
    );
  } catch (err) {
    try {
      await db.executeSql(
        `INSERT OR REPLACE INTO cajas (
          id, estado, saldo_inicial, saldo_final, fecha_apertura, fecha
        ) VALUES (?, ?, ?, ?, ?, ?)`,
        [String(caja.id), estado, saldoIni, saldoFin, fecha, fecha]
      );
    } catch (e2) {
      console.log('saveCajaLocal fallback error:', e2);
    }
  }
}

export async function saveMovimientoLocal(db, m, cajaId = null, estadoMovil = 'sincronizado') {
  if (!m || !m.id) return;
  const targetCajaId = cajaId || m.caja_id || m.idCaja || null;
  const fecha = m.fecha || m.horaDispositivo || new Date().toISOString();
  const cid = targetCajaId ? String(targetCajaId) : null;
  const tipo = m.tipo || 'ingreso';
  const desc = m.descripcion || '';
  const monto = Number(m.monto != null ? m.monto : m.valor) || 0;

  try {
    await db.executeSql(
      `INSERT OR REPLACE INTO movimientos (
        id, tipo, descripcion, monto, fecha, horaDispositivo, idCaja, caja_id, estadoMovil
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [String(m.id), tipo, desc, monto, fecha, fecha, cid, cid, estadoMovil]
    );
  } catch (err) {
    try {
      await db.executeSql(
        `INSERT OR REPLACE INTO movimientos (
          id, tipo, descripcion, monto, horaDispositivo, idCaja, estadoMovil
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [String(m.id), tipo, desc, monto, fecha, cid, estadoMovil]
      );
    } catch (e2) {
      console.log('saveMovimientoLocal fallback error:', e2);
    }
  }
}

async function getCajaActualLocal(db) {
  try {
    let userId = null;
    try {
      const p = await getData(db, `SELECT valor FROM parametrizacion WHERE id = 5 LIMIT 1`);
      userId = p?.[0]?.valor || null;
    } catch {}

    let rows = [];
    if (userId) {
      try {
        rows = await getData(
          db,
          `SELECT * FROM cajas WHERE estado = 'abierta' AND (usuario_id = ? OR usuario_id IS NULL OR usuario_id = '') ORDER BY COALESCE(fecha_apertura, fecha) DESC LIMIT 1`,
          [userId]
        );
      } catch {}
    }
    if (!rows || rows.length === 0) {
      try {
        rows = await getData(
          db,
          `SELECT * FROM cajas WHERE estado = 'abierta' ORDER BY COALESCE(fecha_apertura, fecha) DESC LIMIT 1`
        );
      } catch {}
    }
    if (rows && rows.length > 0) {
      return rows[0];
    }
  } catch (err) {
    console.log('getCajaActualLocal error:', err);
  }
  return null;
}

export async function getCajaActual() {
  const db = await getDbConnection();

  // 1. Si no hay conexión (Offline-First), consultar SQLite de inmediato sin tocar Supabase
  try {
    const net = await NetInfo.fetch();
    if (!net.isConnected) {
      return await getCajaActualLocal(db);
    }
  } catch {}

  // 2. Si hay conexión, consultar Supabase
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id;
    if (userId) {
      const { data, error } = await supabase
        .from('cajas')
        .select('*')
        .eq('usuario_id', userId)
        .eq('estado', 'abierta')
        .order('fecha_apertura', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!error) {
        if (data) {
          await saveCajaLocal(db, data, userId);
          return data;
        } else {
          // Servidor confirma que no hay caja abierta
          try {
            await db.executeSql(`UPDATE cajas SET estado = 'cerrada' WHERE usuario_id = ?`, [userId]);
          } catch {}
          return null;
        }
      }
    }
  } catch (err) {
    console.log('getCajaActual: red o servidor error, usando fallback SQLite local:', err);
  }

  // 3. Fallback a SQLite local si la consulta a red falló
  return await getCajaActualLocal(db);
}

export async function getHistorialCajas(limit = 20, offset = 0) {
  const db = await getDbConnection();

  try {
    const net = await NetInfo.fetch();
    if (net.isConnected) {
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      if (userId) {
        const { data, error } = await supabase
          .from('cajas')
          .select('id, estado, saldo_inicial, saldo_final, fecha_apertura, fecha_cierre')
          .eq('usuario_id', userId)
          .order('fecha_apertura', { ascending: false })
          .range(offset, offset + limit - 1);

        if (!error && data) {
          for (const c of data) {
            await saveCajaLocal(db, c, userId);
          }
          return data;
        }
      }
    }
  } catch (err) {
    console.log('getHistorialCajas: error servidor, usando fallback SQLite:', err);
  }

  // Fallback offline desde SQLite local
  try {
    const rows = await getData(
      db,
      `SELECT id, estado, saldo_inicial, saldo_final, COALESCE(fecha_apertura, fecha) AS fecha_apertura, fecha_cierre FROM cajas ORDER BY COALESCE(fecha_apertura, fecha) DESC LIMIT ? OFFSET ?`,
      [limit, offset]
    );
    return rows || [];
  } catch {
    try {
      return (await getData(
        db,
        `SELECT id, estado, saldo_inicial, saldo_final, fecha_apertura FROM cajas ORDER BY fecha_apertura DESC LIMIT ? OFFSET ?`,
        [limit, offset]
      )) || [];
    } catch {
      return [];
    }
  }
}

export async function abrirCaja(saldoInicial = 0) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('No autenticado');
  const userId = session.user.id;

  // validar no haya abierta
  const abierta = await getCajaActual();
  if (abierta) throw new Error('Ya existe una caja abierta');

  const { data, error } = await supabase
    .from('cajas')
    .insert([{ usuario_id: userId, estado: 'abierta', saldo_inicial: Number(saldoInicial) || 0 }])
    .select()
    .single();
  if (error) throw error;

  // Guardar inmediatamente en SQLite local con estado 'abierta'
  if (data) {
    const db = await getDbConnection();
    await saveCajaLocal(db, data, userId);
  }

  return data;
}

export async function cerrarCaja(cajaId) {
  const { data: movements, error: movErr } = await supabase
    .from('cash_movements')
    .select('monto, tipo')
    .eq('caja_id', cajaId);
  if (movErr) throw movErr;

  // regla única: ingreso/pago suman, retiro/venta restan
  let saldoCalculado = 0;
  for (const m of movements || []) {
    const v = Number(m.monto) || 0;
    if (m.tipo === 'ingreso' || m.tipo === 'pago') saldoCalculado += v;
    else if (m.tipo === 'retiro' || m.tipo === 'venta') saldoCalculado -= v;
    else saldoCalculado += v;
  }

  const { data: caja } = await supabase.from('cajas').select('saldo_inicial').eq('id', cajaId).single();
  const saldoFinal = Number(caja?.saldo_inicial || 0) + saldoCalculado;

  const { data, error } = await supabase
    .from('cajas')
    .update({ estado: 'cerrada', fecha_cierre: new Date().toISOString(), saldo_final: saldoFinal })
    .eq('id', cajaId)
    .eq('estado', 'abierta')
    .select()
    .single();
  if (error) throw error;
  if (!data) throw new Error('Caja no encontrada o ya cerrada');

  // Actualizar inmediatamente en SQLite local con estado 'cerrada'
  try {
    const db = await getDbConnection();
    await db.executeSql(
      `UPDATE cajas SET estado = 'cerrada', fecha_cierre = ?, saldo_final = ? WHERE id = ?`,
      [data.fecha_cierre || new Date().toISOString(), saldoFinal, String(cajaId)]
    );
  } catch (e) {
    console.log('Error actualizando cierre de caja local:', e);
  }

  return data;
}

export async function getMovimientosCaja(cajaId, limit = 50, offset = 0) {
  if (!cajaId) return [];
  const db = await getDbConnection();

  // 1. Si hay red, consultar movimientos desde Supabase y cachear en SQLite
  try {
    const net = await NetInfo.fetch();
    if (net.isConnected) {
      const { data, error } = await supabase
        .from('cash_movements')
        .select('id, tipo, descripcion, monto, fecha')
        .eq('caja_id', cajaId)
        .order('fecha', { ascending: false })
        .range(offset, offset + limit - 1);

      if (!error && data) {
        for (const m of data) {
          await saveMovimientoLocal(db, m, cajaId, 'sincronizado');
        }
        return data;
      }
    }
  } catch (err) {
    console.log('getMovimientosCaja: error servidor, usando fallback SQLite:', err);
  }

  // 2. Fallback offline a SQLite local
  try {
    const rows = await getData(
      db,
      `SELECT id, tipo, descripcion, monto, COALESCE(horaDispositivo, fecha) AS fecha, estadoMovil FROM movimientos WHERE (idCaja = ? OR caja_id = ?) ORDER BY COALESCE(horaDispositivo, fecha) DESC LIMIT ? OFFSET ?`,
      [String(cajaId), String(cajaId), limit, offset]
    );
    if (rows && rows.length > 0) return rows;
  } catch {}

  try {
    return (await getData(
      db,
      `SELECT id, tipo, descripcion, monto, COALESCE(horaDispositivo, fecha) AS fecha, estadoMovil FROM movimientos WHERE idCaja = ? ORDER BY COALESCE(horaDispositivo, fecha) DESC LIMIT ? OFFSET ?`,
      [String(cajaId), limit, offset]
    )) || [];
  } catch {
    return [];
  }
}
