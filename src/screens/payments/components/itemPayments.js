import React, { useState, useCallback, memo, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ActivityIndicator, Animated } from 'react-native';
import Modal from 'react-native-modal';
import Icon from 'react-native-vector-icons/FontAwesome';
import Toast from 'react-native-toast-message';
import Geolocation from 'react-native-geolocation-service';
import { getDbConnection, updateData, insertTables, getData } from '../../../database/db';
import { IdInsertion, getDateOdooMilisec, getDate, Capitalize, FormatMoneyDecimales } from '../../../utils/utilities';
import { apple } from '../../../theme/appleTheme';

const getStatusColor = (tipo) => ({ pago: apple.colors.success, 'no pago': apple.colors.danger, parcial: apple.colors.warning, pendiente: apple.colors.separator }[ (tipo||'').toLowerCase().trim()] || apple.colors.separator);
const getStatusBg = (tipo) => ({ pago: '#E8F5E9', 'no pago': '#FFEBEE', parcial: '#FFF8E1', pendiente: apple.colors.fill }[ (tipo||'').toLowerCase().trim()] || apple.colors.fill);

const getCurrentLocation = () => new Promise((res, rej) => Geolocation.getCurrentPosition(res, rej, { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }));
const buildPaymentData = async ({ tipo, valor, idFactura, nombre, secuencia }) => {
  const pos = await getCurrentLocation();
  const idInsert = await IdInsertion();
  const currentDate = getDateOdooMilisec();
  return {
    pago: { id: idInsert, latitud: pos.coords.latitude, longitud: pos.coords.longitude, tipo, valor, horaDispositivo: currentDate, idFactura, valorFactura: valor, descripcion: '', estadoMovil: 'actualizado', nombre: Capitalize(nombre), secuencia_pago: secuencia, idCaja: 1 },
    detalle: { id: idInsert, facturaId: idFactura, valor, fecha: getDate(), descripcion: '', tipo, hora_dispositivo: currentDate, nombre: Capitalize(nombre), [`${tipo === 'nopago' ? 'nopago' : 'pago'}_factura_venta_id`]: idFactura, editable: 'true' },
  };
};
const getAndIncrementConsecutivo = async (db) => {
  const r = await getData(db, 'SELECT valor FROM consecutivoTramitado WHERE id = 1');
  if (!r.length) throw new Error('No existe consecutivoTramitado');
  const next = parseInt(r[0].valor || 0) + 1;
  await updateData(db, 'consecutivoTramitado', { id: 1, valor: next });
  return next;
};
const updateFacturaWithConsecutivo = async (db, id, updates, c) => updateData(db, 'facturas', { ...updates, id, consecutivoTramitado: c });
const getUltimoTramite = async (db, idFactura) => {
  const r = await getData(db, `SELECT tipo, valor FROM pagos WHERE idFactura = '${idFactura}' ORDER BY id DESC LIMIT 1`);
  if (!r.length) return { tipo: null, valorPagado: 0 };
  const v = Number(r[0].valor) || 0;
  if (r[0].tipo === 'nopago') return { tipo: 'NO PAGO', valorPagado: v };
  if (r[0].tipo === 'parcial') return { tipo: 'PARCIAL', valorPagado: v };
  if (r[0].tipo === 'pago') return { tipo: v === 0 ? 'NO PAGO' : 'PAGO', valorPagado: v };
  return { tipo: 'DESCONOCIDO', valorPagado: v };
};

const ItemPayments = memo(({ id, name, address, amount, status, paymentType, estadoPago, saldo, cuotasPagas, saldoVencido, nombreUno, valorCuota, onPaymentSuccess, estadoMovil }) => {
  const [modalParcial, setModalParcial] = useState(false);
  const [modalNoPago, setModalNoPago] = useState(false);
  const [valorParcial, setValorParcial] = useState('');
  const [loading, setLoading] = useState(false);
  const [tipoTramitado, setTipoTramitado] = useState(null);
  const [valorPagado, setValorPagado] = useState(0);
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (estadoMovil === 'actualizado') (async () => {
      try { const db = await getDbConnection(); const { tipo, valorPagado } = await getUltimoTramite(db, id); setTipoTramitado(tipo); setValorPagado(valorPagado); } catch {}
    })(); else { setTipoTramitado(null); setValorPagado(0); }
  }, [estadoMovil, id]);

  const pressIn = () => Animated.spring(scale, { toValue: 0.98, useNativeDriver: true, speed: 30 }).start();
  const pressOut = () => Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 30 }).start();

  const executePaymentAction = useCallback(async (tipo, valorPago) => {
    setLoading(true);
    const db = await getDbConnection();
    try {
      const c = await getAndIncrementConsecutivo(db);
      const { pago, detalle } = await buildPaymentData({ tipo, valor: valorPago, idFactura: id, nombre: nombreUno, secuencia: c });
      const ns = tipo === 'nopago' ? saldo : Math.max(saldo - valorPago, 0);
      const nsv = tipo === 'nopago' ? (saldoVencido || 0) : Math.max((saldoVencido || 0) - valorPago, 0);
      const ncp = tipo === 'nopago' ? cuotasPagas : cuotasPagas + 1;
      await updateFacturaWithConsecutivo(db, id, { estadoMovil: 'actualizado', saldo: ns, cuotasPagas: ncp, saldoVencido: nsv }, c);
      await Promise.all([insertTables(db, 'pagos', [pago]), insertTables(db, 'detallesCaja', [detalle])]);
      Toast.show({ text1: tipo === 'pago' ? 'Pago realizado' : tipo === 'nopago' ? 'No pago registrado' : 'Pago parcial realizado' });
      onPaymentSuccess?.();
      if (tipo === 'parcial') { setModalParcial(false); setValorParcial(''); } else if (tipo === 'nopago') setModalNoPago(false);
    } catch (e) { Toast.show({ text1: 'Error al procesar' }); } finally { setLoading(false); }
  }, [id, saldo, cuotasPagas, saldoVencido, nombreUno, onPaymentSuccess]);

  const textoChip = estadoMovil === 'actualizado' && tipoTramitado ? tipoTramitado : paymentType;
  const valorAMostrar = estadoMovil === 'actualizado' ? valorPagado : amount;
  const isPending = status === 'PENDIENTE';
  return (
    <Animated.View style={{ transform: [{ scale }], marginHorizontal: 14, marginBottom: 8 }}>
      <TouchableOpacity activeOpacity={0.9} onPressIn={pressIn} onPressOut={pressOut} style={styles.card}>
        <View style={styles.content}>
          {/* Fila 1: Nombre + Chip de Modalidad + Estado */}
          <View style={styles.topRow}>
            <View style={styles.nameContainer}>
              <Text style={styles.name} numberOfLines={1}>{name}</Text>
              <Text style={styles.addr} numberOfLines={1}>{address}</Text>
            </View>
            <View style={styles.statusGroup}>
              <View style={[styles.chip, { backgroundColor: getStatusBg(textoChip) }]}>
                <Text style={[styles.chipText, { color: getStatusColor(textoChip) === '#fff' ? apple.colors.secondaryLabel : getStatusColor(textoChip) }]}>{textoChip}</Text>
              </View>
              <Text style={[styles.status, isPending && { color: apple.colors.warning }]}>{status}</Text>
            </View>
          </View>

          {/* Fila 2: Cuota / Valor + Saldo en línea */}
          <View style={styles.infoRow}>
            <View style={styles.amountBox}>
              <Text style={styles.amountLabel}>CUOTA</Text>
              <Text style={styles.amount}>{FormatMoneyDecimales(valorAMostrar)}</Text>
            </View>
            {saldo > 0 && (
              <View style={styles.saldoBox}>
                <Text style={styles.saldoLabel}>SALDO PENDIENTE</Text>
                <Text style={styles.saldo}>{FormatMoneyDecimales(saldo)}</Text>
              </View>
            )}
          </View>

          {/* Fila 3: Botones de acción compactos */}
          {isPending && (
            <View style={styles.actions}>
              <TouchableOpacity style={[styles.actionBtn, styles.actionSuccess]} onPress={() => executePaymentAction('pago', Math.min(valorCuota, saldo))} disabled={loading}>
                {loading ? <ActivityIndicator size="small" color="#fff" /> : <><Icon name="check" size={13} color="#fff" /><Text style={styles.actionText}> Pagar</Text></>}
              </TouchableOpacity>
              <TouchableOpacity style={[styles.actionBtn, styles.actionDanger]} onPress={() => setModalNoPago(true)}>
                <Icon name="times" size={13} color="#fff" /><Text style={styles.actionText}> No pago</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.actionBtn, styles.actionWarning]} onPress={() => setModalParcial(true)}>
                <Icon name="adjust" size={13} color="#fff" /><Text style={styles.actionText}> Parcial</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </TouchableOpacity>

      <Modal isVisible={modalParcial} onBackdropPress={() => setModalParcial(false)} animationIn="slideInUp" animationOut="slideOutDown" backdropOpacity={0.4}>
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <Text style={styles.sheetTitle}>Pago parcial</Text>
          <Text style={styles.sheetSub}>{name} · Saldo {FormatMoneyDecimales(saldo)}</Text>
          <TextInput placeholder="0.00" keyboardType="numeric" style={styles.sheetInput} value={valorParcial} onChangeText={setValorParcial} placeholderTextColor={apple.colors.tertiaryLabel} />
          <TouchableOpacity style={styles.sheetPrimary} onPress={() => { const v = parseFloat(valorParcial); if (isNaN(v) || v <= 0 || v > saldo) return Toast.show({ text1: 'Valor inválido' }); executePaymentAction('parcial', v); }} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.sheetPrimaryText}>Confirmar pago</Text>}
          </TouchableOpacity>
        </View>
      </Modal>

      <Modal isVisible={modalNoPago} onBackdropPress={() => setModalNoPago(false)} backdropOpacity={0.4}>
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <Text style={styles.sheetTitle}>¿Confirmar no pago?</Text>
          <Text style={styles.sheetSub}>Se registrará visita sin recaudo.</Text>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
            <TouchableOpacity style={[styles.sheetBtn, { backgroundColor: apple.colors.fill }]} onPress={() => setModalNoPago(false)}><Text style={{ fontWeight: '600', color: apple.colors.label }}>Cancelar</Text></TouchableOpacity>
            <TouchableOpacity style={[styles.sheetBtn, { backgroundColor: apple.colors.danger }]} onPress={() => executePaymentAction('nopago', 0)}>{loading ? <ActivityIndicator color="#fff" /> : <Text style={{ fontWeight: '600', color: '#fff' }}>Confirmar</Text>}</TouchableOpacity>
          </View>
        </View>
      </Modal>
    </Animated.View>
  );
}, (a,b)=> a.id===b.id && a.status===b.status && a.saldo===b.saldo && a.estadoMovil===b.estadoMovil);

export default ItemPayments;

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E8EAED',
  },
  content: { padding: 12 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 },
  nameContainer: { flex: 1 },
  name: { fontSize: 16, fontWeight: '700', color: apple.colors.label, letterSpacing: -0.3 },
  addr: { fontSize: 12, color: apple.colors.secondaryLabel, marginTop: 1 },
  statusGroup: { alignItems: 'flex-end', gap: 2 },
  chip: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  chipText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.3 },
  status: { fontSize: 10, fontWeight: '700', color: apple.colors.tertiaryLabel, letterSpacing: 0.3 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#F8F9FB', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, marginTop: 8 },
  amountBox: { flexDirection: 'column' },
  amountLabel: { fontSize: 9, fontWeight: '700', color: apple.colors.secondaryLabel, letterSpacing: 0.3 },
  amount: { fontSize: 16, fontWeight: '800', color: apple.colors.success, letterSpacing: -0.3 },
  saldoBox: { flexDirection: 'column', alignItems: 'flex-end' },
  saldoLabel: { fontSize: 9, fontWeight: '700', color: apple.colors.tertiaryLabel, letterSpacing: 0.3 },
  saldo: { fontSize: 13, fontWeight: '700', color: apple.colors.label },
  actions: { flexDirection: 'row', gap: 6, marginTop: 8 },
  actionBtn: { flex: 1, flexDirection: 'row', height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  actionSuccess: { backgroundColor: apple.colors.success },
  actionDanger: { backgroundColor: apple.colors.danger },
  actionWarning: { backgroundColor: apple.colors.warning },
  actionText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  sheet: { backgroundColor: apple.colors.card, borderRadius: 28, padding: 20 },
  handle: { width: 36, height: 5, borderRadius: 3, backgroundColor: apple.colors.separator, alignSelf: 'center', marginBottom: 16 },
  sheetTitle: { fontSize: 17, fontWeight: '700', color: apple.colors.label, textAlign: 'center' },
  sheetSub: { fontSize: 13, color: apple.colors.secondaryLabel, textAlign: 'center', marginTop: 4 },
  sheetInput: { backgroundColor: apple.colors.fill, borderRadius: apple.radius.s, borderWidth: 1, borderColor: apple.colors.separator, padding: 14, marginTop: 16, fontSize: 17, color: apple.colors.label, textAlign: 'center' },
  sheetPrimary: { backgroundColor: apple.colors.blue, borderRadius: apple.radius.s, height: 48, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  sheetPrimaryText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  sheetBtn: { flex: 1, height: 46, borderRadius: apple.radius.s, alignItems: 'center', justifyContent: 'center' },
});
