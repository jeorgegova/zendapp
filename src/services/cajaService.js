import { supabase } from '../lib/supabase';
import { getDbConnection, getData, insertOrReplaceData } from '../database/db';

export async function getCajaActual() {
  const db = await getDbConnection();
  // 1. Primero intentar leer de la base de datos local SQLite (Offline-First)
  try {
    const localCajas = await getData(db, `SELECT * FROM cajas WHERE estado = 'abierta' ORDER BY fecha_apertura DESC LIMIT 1`);
    if (localCajas && localCajas.length > 0) {
      return localCajas[0];
    }
  } catch {}

  // 2. Si no se encontró local, consultar Supabase y cachear en SQLite
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return null;
    const userId = session.user.id;

    const { data, error } = await supabase
      .from('cajas')
      .select('*')
      .eq('usuario_id', userId)
      .eq('estado', 'abierta')
      .order('fecha_apertura', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    if (data) {
      try {
        await insertOrReplaceData(db, 'cajas', [data]);
      } catch {}
    }
    return data;
  } catch {
    // Si no hay red, fallback a lo que esté en SQLite
    try {
      const fallback = await getData(db, `SELECT * FROM cajas WHERE estado = 'abierta' LIMIT 1`);
      return fallback?.[0] || null;
    } catch {
      return null;
    }
  }
}

export async function getHistorialCajas(limit = 20, offset = 0) {
  const { data: { session } } = await supabase.auth.getSession();
  const userId = session.user.id;
  const { data, error } = await supabase
    .from('cajas')
    .select('id, estado, saldo_inicial, saldo_final, fecha_apertura, fecha_cierre')
    .eq('usuario_id', userId)
    .order('fecha_apertura', { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) throw error;
  return data;
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
  return data;
}

export async function getMovimientosCaja(cajaId, limit = 50, offset = 0) {
  const { data, error } = await supabase
    .from('cash_movements')
    .select('id, tipo, descripcion, monto, fecha')
    .eq('caja_id', cajaId)
    .order('fecha', { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) throw error;
  return data;
}
