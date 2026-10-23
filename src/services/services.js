/**
 * services.js - Capa de servicios de Supabase para Zendapp
 *
 * Auditoria Fase 2:
 * - Eliminado codigo muerto (createPay, createClientInvoice stub)
 * - Corregidos nombres de columnas: monto_inicial->saldo_inicial, monto_final->saldo_final
 * - Eliminada referencia a tabla Odoo legacy 'cash_register'
 * - saveInvoice: eliminada referencia a tabla legacy 'detallescaja'
 */
import { updateData, insertOrReplaceData, getDbConnection, getData, insertTables } from '../database/db';
import { supabase } from '../lib/supabase';

const SUPABASE_URL = 'https://gwpwntdwogxzmtegaaom.supabase.co';

export const AuthService = async (db, email, password) => {
  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      return { success: false, message: error.message || 'Usuario o contrasena incorrectos' };
    }
    const { access_token } = data.session;
    const userId = data.user.id;
    await Promise.all([
      updateData(db, 'parametrizacion', { id: 2, valor: access_token }),
      updateData(db, 'parametrizacion', { id: 5, valor: userId }),
    ]);
    const response = await fetch(`${SUPABASE_URL}/functions/v1/get-user-profile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${access_token}` },
      body: JSON.stringify({ id: userId }),
    });
    if (!response.ok) {
      const errorResult = await response.json().catch(() => ({}));
      return { success: false, message: errorResult.error || 'Error al obtener el perfil' };
    }
    const result = await response.json();
    const { profile, concepts, caja, movimientos } = result;
    if (profile) {
      await Promise.all([
        updateData(db, 'parametrizacion', { id: 6, valor: profile.rol }),
        updateData(db, 'parametrizacion', { id: 7, valor: profile.nombre }),
        updateData(db, 'parametrizacion', { id: 8, valor: profile.superior_id }),
      ]);
    }
    await Promise.all([
      concepts?.length ? insertOrReplaceData(db, 'concepts', concepts) : Promise.resolve(),
      caja ? insertOrReplaceData(db, 'cajas', [caja]) : Promise.resolve(),
      movimientos?.length ? insertOrReplaceData(db, 'movimientos', movimientos) : Promise.resolve(),
    ]);
    const invoicesOk = await getInvoice(userId, access_token);
    console.log('Facturas cargadas:', invoicesOk);
    return { success: true, user: data.user };
  } catch (err) {
    console.error('Error en AuthService:', err);
    return { success: false, message: err.message || 'Error desconocido' };
  }
};

export const getInvoice = async (userId, access_token) => {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/RequestInvoce`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${access_token}` },
    body: JSON.stringify({ vendedorId: userId }),
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Error al obtener facturas: ${response.status} - ${errorText}`);
  }
  const result = await response.json();
  return saveInvoice(result.data || []);
};

export const saveInvoice = async (invoices) => {
  if (!invoices || invoices.length === 0) return true;
  const db = await getDbConnection();
  const tableContent = invoices.map(element => {
    let pagosStr = '[]';
    let ultimoPago = null;
    if (Array.isArray(element.pagos)) {
      pagosStr = JSON.stringify(element.pagos);
      ultimoPago = element.pagos[element.pagos.length - 1]?.payment_date || null;
    } else if (typeof element.pagos === 'string') {
      pagosStr = element.pagos;
      try {
        const parsed = JSON.parse(element.pagos);
        if (Array.isArray(parsed) && parsed.length > 0) {
          ultimoPago = parsed[parsed.length - 1]?.payment_date || null;
        }
      } catch {}
    }

    return {
      id: String(element.id),
      apellidoUno: element.apellidoCliente || null,
      apellidoDos: null,
      celular: element.telefonocliente || null,
      cuotasPagas: Number(element.cuotasPagas) || 0,
      cuotasVencidas: Number(element.cuotasVencidas) || 0,
      detalles: element.detalles ? (typeof element.detalles === 'string' ? element.detalles : JSON.stringify([element.detalles])) : '[]',
      direccion: element.direccion || null,
      barrio: null,
      estado: element.estado || 'pendiente',
      estadoUsuario: element.estadoUsuario || null,
      facturaWriteDate: element.facturaWriteDate || null,
      latitud: element.latitud || null,
      longitud: element.longitud || null,
      nombreUno: element.nombreCliente || null,
      renovado: 'false',
      nombreUsuario: element.nombreUsuario || null,
      pagos: pagosStr,
      partnerId: element.partnerId || null,
      paymentTermId: element.paymentTermId || null,
      saldo: Number(element.saldo) || 0,
      saldoVencido: Number(element.saldoVencido) || 0,
      usuarioId: element.usuarioId || null,
      valorCuota: Number(element.valorCuota) || 0,
      valorInicial: Number(element.valorInicial) || 0,
      estadoMovil: 'pendiente',
      fecha_vencimiento: element.fecha_vencimiento || null,
      fecha: element.fecha || null,
      alias: element.aliasCliente || null,
      documento: element.documentoCliente || null,
      num_cuotas: element.num_cuotas != null ? String(element.num_cuotas) : null,
      ultimo_pago: ultimoPago,
      consecutivoTramitado: 0,
    };
  });

  try {
    const cols = Object.keys(tableContent[0]);
    const placeholders = cols.map(() => '?').join(',');
    const sql = `INSERT OR REPLACE INTO facturas (${cols.join(',')}) VALUES (${placeholders})`;
    for (const item of tableContent) {
      await db.executeSql(sql, Object.values(item));
    }
    console.log(`Guardadas ${tableContent.length} facturas en SQLite`);
    return true;
  } catch (err) {
    console.error('Error en saveInvoice:', err);
    return false;
  }
};

