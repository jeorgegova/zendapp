import NetInfo from '@react-native-community/netinfo';
import { getDbConnection, getData, updateData } from '../database/db';
import { supabase } from '../lib/supabase';
import { Alert } from 'react-native';
import Toast from 'react-native-toast-message';
import { appAlert } from '../components/AppAlert';

let globalSyncCollection = [];
let idCounter = -1;
let idMapping = new Map();

export const SyncWithSupabase = async (toas = true, callLoading = () => { }) => {
  const state = await NetInfo.fetch();
  console.log('Se ejecuta sincronizacion');

  if (!state.isConnected) {
    toas && Toast.show({ text1: 'Verifica tu conexión a internet' });
    return callLoading(false);
  }

  globalSyncCollection = [];
  idCounter = -1;
  idMapping.clear();

  try {
    const okPay = await SendPay(toas);
    if (!okPay) return callLoading(false);

    const okMov = await SendMovimientos(toas);
    if (!okMov) return callLoading(false);

    const res = await sendCollectedItems(toas);
    return callLoading(res);
  } catch (e) {
    console.log('Sync error', e);
    return callLoading(false);
  }
};

const SendPay = async (toas) => {
  const db = await getDbConnection();
  // pagos pendientes: id<0 o estadoMovil actualizado aún no sincronizado (mantenemos id<0 como flag)
  const pagos = await getData(db, `SELECT * FROM pagos WHERE id < 0 ORDER BY id ASC`);
  if (!pagos || pagos.length === 0) return true;

  for (const p of pagos) {
    const payload = {
      id: p.id, // temporal negativo
      detalle: {
        tipo: p.tipo,
        valor: parseFloat(p.valor),
        hora_dispositivo: p.horaDispositivo,
        latitud: p.latitud,
        longitud: p.longitud,
        idFactura: p.idFactura,
        descripcion: p.descripcion || '',
        secuencia_pago: p.secuencia_pago,
      },
    };
    const originalId = p.id;
    addToSyncCollection(payload, originalId, 'payment');
  }
  return true;
};

const SendMovimientos = async (toas) => {
  const db = await getDbConnection();
  const movs = await getData(db, `SELECT * FROM movimientos WHERE id < 0 ORDER BY horaDispositivo ASC`);
  if (!movs || movs.length === 0) return true;
  for (const m of movs) {
    const payload = {
      id: m.id,
      detalle: {
        tipo: m.tipo,
        valor: parseFloat(m.valor),
        hora_dispositivo: m.horaDispositivo,
        latitud: m.latitud,
        longitud: m.longitud,
        descripcion: m.descripcion || '',
      },
    };
    addToSyncCollection(payload, m.id, 'movimiento');
  }
  return true;
};

const addToSyncCollection = (item, originalId, type) => {
  const tempId = idCounter--;
  idMapping.set(originalId, { originalId, type });
  globalSyncCollection.push(item);
  return tempId;
};

// Envía todo en batch a Supabase Edge Function / RPC
const sendCollectedItems = async (toas) => {
  if (globalSyncCollection.length === 0) {
    toas && Toast.show({ text1: 'Nada para sincronizar' });
    return true;
  }

  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('No autenticado');

    // 1 intento: Edge Function bulk_sync (si existe) sino loop por item
    // Fallback loop
    const results = [];
    for (const item of globalSyncCollection) {
      const mapping = idMapping.get(item.id);
      try {
        if (mapping.type === 'payment') {
          // RPC real: create_payment(p_invoice_id uuid, p_client_id uuid, p_amount numeric, p_payment_date date, p_method text, p_caja_id uuid)
          //  - actualiza invoice.saldo, crea cash_movements + payments + cuotas, todo transaccional
          let clientId = null;
          let cajaId = null;
          try {
            const { data: inv } = await supabase.from('invoice').select('client_id').eq('id', item.detalle.idFactura).single();
            clientId = inv?.client_id || null;
          } catch { }
          try {
            const { data: caja } = await supabase.from('cajas').select('id').eq('usuario_id', session.user.id).eq('estado', 'abierta').order('fecha_apertura', { ascending: false }).limit(1).single();
            cajaId = caja?.id || null;
          } catch { }

          if (!clientId) throw new Error('No se pudo obtener client_id de la factura');
          if (!cajaId) throw new Error('No hay caja abierta para el usuario');

          // nopago no debe crear pago: monto 0, lo marcamos como sincronizado local sin llamar RPC
          if (item.detalle.tipo === 'nopago') {
            // nopago: registrar con amount 0 para conteo, sin movimiento caja (RPC exige >0)
            const { data: pay, error: ePay } = await supabase
              .from('payments')
              .insert([{
                invoice_id: item.detalle.idFactura,
                client_id: clientId,
                amount: 0,
                payment_date: new Date().toISOString().slice(0, 10),
                method: 'nopago',
                cash_movement_id: null,
              }])
              .select()
              .single();
            if (ePay) throw ePay;
            results.push({ idv: item.id, idn: pay.id, ok: true });
            continue;
          }
          if (Number(item.detalle.valor) === 0) {
            results.push({ idv: item.id, idn: item.id, ok: true });
            continue;
          }

          const pMethod = item.detalle.tipo === 'parcial' ? 'parcial' : 'cash';
          const pDate = new Date().toISOString().slice(0, 10);

          const { data, error } = await supabase.rpc('create_payment', {
            p_invoice_id: item.detalle.idFactura,
            p_client_id: clientId,
            p_amount: item.detalle.valor,
            p_payment_date: pDate,
            p_method: pMethod,
            p_caja_id: cajaId,
          });

          if (error) throw error;
          results.push({ idv: item.id, idn: data, ok: true });
        } else if (mapping.type === 'movimiento') {
          const { data: caja } = await supabase.from('cajas').select('id').eq('usuario_id', session.user.id).eq('estado', 'abierta').single();
          if (!caja) continue;
          const { data: mv, error } = await supabase.from('cash_movements').insert([{ caja_id: caja.id, tipo: item.detalle.tipo === 'gasto' ? 'retiro' : item.detalle.tipo, descripcion: item.detalle.descripcion, monto: item.detalle.valor }]).select().single();
          if (error) throw error;
          results.push({ idv: item.id, idn: mv.id, ok: true });
        }
      } catch (err) {
        const msg = err.message || String(err);
        const details = err.details ? ` ${err.details}` : '';
        const hint = err.hint ? ` (${err.hint})` : '';
        const fullMsg = `${msg}${details}${hint}`;
        console.log('sync item error', item.id, fullMsg, err);
        results.push({ idv: item.id, error: fullMsg, raw: err, factura: item.detalle.idFactura, monto: item.detalle.valor });
      }
    }

    const okItems = results.filter(r => r.ok);
    const errItems = results.filter(r => r.error);

    if (okItems.length > 0) {
      await processResponseAndUpdateTables(okItems);
      toas && Toast.show({ text1: `Sincronizados ${okItems.length}/${results.length}` });
    }

    if (errItems.length > 0) {
      for (const er of errItems) {
        const msg = `Factura ${String(er.factura).slice(0, 8)}: ${er.error}`;
        // Reporte visible + log
        Toast.show({ text1: 'Error sync', text2: msg });
        console.log('Sync error detail', er);
        // Caso saldo 0: marcar como error local para no reintentar infinito, guardar motivo
        if (er.error.includes('excede el saldo')) {
          try {
            const db = await getDbConnection();
            // marcar como error_sync para revisión, no reintentar automático
            await db.executeSql(`UPDATE pagos SET estadoMovil = 'error_sync' WHERE id = ?`, [er.idv]);
            // sincronizar saldo local con servidor para evitar desfase futuro
            try {
              const { data: inv } = await supabase.from('invoice').select('saldo').eq('id', er.factura).single();
              if (inv) await db.executeSql(`UPDATE facturas SET saldo = ? WHERE id = ?`, [inv.saldo, er.factura]);
            } catch {}
          } catch {}
        }
      }
      // No limpiar global si hubo errores, pero liberar mapeos de los ok para siguiente ciclo solo reintente errores
      globalSyncCollection = errItems.map(e => ({ id: e.idv, detalle: { idFactura: e.factura, valor: e.monto }, _error: e.error }));
      // reconstruir idMapping solo para errores
      const newMap = new Map();
      for (const er of errItems) {
        const old = idMapping.get(er.idv);
        if (old) newMap.set(er.idv, old);
      }
      idMapping = newMap;
      if (okItems.length === 0) return false;
    } else {
      globalSyncCollection = [];
      idMapping.clear();
      idCounter = -1;
    }

    return errItems.length === 0;
  } catch (e) {
    console.log('sendCollectedItems error', e);
    Toast.show({ text1: 'Sync error', text2: e.message || String(e) });
    return false;
  }
};

const processResponseAndUpdateTables = async (response) => {
  const db = await getDbConnection();
  for (const item of response) {
    const mapping = idMapping.get(item.idv);
    if (!mapping) continue;
    if (mapping.type === 'payment') {
      try {
        await db.executeSql(`UPDATE pagos SET estadoMovil = 'sincronizado' WHERE id = ?`, [item.idv]);
      } catch {
        await updateData(db, 'pagos', { id: item.idv, estadoMovil: 'sincronizado' });
      }
      try {
        await db.executeSql(`UPDATE detallesCaja SET estado = 'sincronizado' WHERE id = ?`, [item.idv]);
      } catch {}
      // guardar id remoto para referencia si existe columna sync_id
      try { await db.executeSql(`UPDATE pagos SET sync_id = ? WHERE id = ?`, [item.idn, item.idv]); } catch {}
    } else if (mapping.type === 'movimiento') {
      try {
        await db.executeSql(`UPDATE movimientos SET estadoMovil = 'sincronizado' WHERE id = ?`, [item.idv]);
      } catch {}
    }
  }
};
