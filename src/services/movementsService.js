import { supabase } from '../lib/supabase';
import { Platform, PermissionsAndroid, Alert } from 'react-native';
import Geolocation from 'react-native-geolocation-service';
import { request, PERMISSIONS, RESULTS } from 'react-native-permissions';

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

  // verificar caja abierta pertenece al usuario
  const { data: { session } } = await supabase.auth.getSession();
  const userId = session?.user?.id;
  const { data: caja } = await supabase.from('cajas').select('id, usuario_id, estado').eq('id', cajaId).single();
  if (!caja) throw new Error('Caja no existe');
  if (caja.usuario_id !== userId) throw new Error('Caja no te pertenece');
  if (caja.estado !== 'abierta') throw new Error('Caja cerrada, no se puede operar');

  const { data, error } = await supabase
    .from('cash_movements')
    .insert([{ caja_id: cajaId, tipo, descripcion: descripcion?.trim() || null, monto: val }])
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function listMovimientos({ cajaId, limit = 30, offset = 0, search = '' }) {
  let q = supabase.from('cash_movements').select('id, tipo, descripcion, monto, fecha, caja_id').order('fecha', { ascending: false }).range(offset, offset + limit - 1);
  if (cajaId) q = q.eq('caja_id', cajaId);
  if (search) q = q.ilike('descripcion', `%${search}%`);
  const { data, error } = await q;
  if (error) throw error;
  return data;
}
