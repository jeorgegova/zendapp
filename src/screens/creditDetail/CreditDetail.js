import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity, ActivityIndicator, FlatList, Linking, Platform, Alert } from 'react-native';
import Icon from 'react-native-vector-icons/FontAwesome';
import { supabase } from '../../lib/supabase';
import { FormatMoneyDecimales } from '../../utils/utilities';
import { apple } from '../../theme/appleTheme';
import { AppleCard } from '../../components/AppleCard';

function StatusBadge({ estado }) {
  const map = {
    pagada: { bg: '#E8F5E9', color: apple.colors.success, label: 'PAGADA' },
    abonada: { bg: '#FFF8E1', color: apple.colors.warning, label: 'ABONADA' },
    pendiente: { bg: '#F2F2F7', color: apple.colors.secondaryLabel, label: 'PENDIENTE' },
  };
  const s = map[(estado || '').toLowerCase()] || map.pendiente;
  return <View style={[styles.badge, { backgroundColor: s.bg }]}><Text style={[styles.badgeText, { color: s.color }]}>{s.label}</Text></View>;
}

export default function CreditDetail({ route, navigation }) {
  const { invoiceId, clientName, address, telefono, latitud, longitud, saldo: saldoInicial } = route.params || {};
  const [loading, setLoading] = useState(true);
  const [invoice, setInvoice] = useState(null);
  const [client, setClient] = useState(null);
  const [cuotas, setCuotas] = useState([]);
  const [pagos, setPagos] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: inv } = await supabase.from('invoice').select('id, amount, saldo, status, created_at, plazo_id, interes_id, client_id, usuario_id').eq('id', invoiceId).single();
      setInvoice(inv);
      if (inv?.client_id) {
        const { data: cli } = await supabase.from('clients').select('nombre, apellido, alias, telefono, direccion, documento').eq('id', inv.client_id).single();
        setClient(cli);
      }
      const { data: cs } = await supabase.from('cuotas').select('id, numero, fecha_vencimiento, monto, estado, monto_pagado').eq('invoice_id', invoiceId).order('numero', { ascending: true });
      setCuotas(cs || []);
      const { data: ps } = await supabase.from('payments').select('id, amount, payment_date, method, created_at').eq('invoice_id', invoiceId).order('payment_date', { ascending: false });
      setPagos(ps || []);
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'No se pudo cargar el detalle');
    } finally { setLoading(false); }
  }, [invoiceId]);

  useEffect(() => { load(); }, [load]);

  const hasCoords = latitud != null && longitud != null && Number(latitud) !== 0 && Number(longitud) !== 0;
  const openMap = () => {
    if (!hasCoords) return Alert.alert('Sin ubicación', 'No hay coordenadas de venta');
    const lat = Number(latitud), lng = Number(longitud);
    const url = Platform.select({ ios: `http://maps.apple.com/?q=${lat},${lng}`, android: `geo:${lat},${lng}?q=${lat},${lng}` });
    Linking.openURL(url).catch(() => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`));
  };

  const totalPagado = pagos.reduce((a, p) => a + Number(p.amount || 0), 0);

  if (loading) return <SafeAreaView style={styles.root}><View style={styles.center}><ActivityIndicator size="large" color={apple.colors.blue} /><Text style={styles.loadingText}>Cargando detalle…</Text></View></SafeAreaView>;

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}><Icon name="chevron-left" size={16} color={apple.colors.blue} /><Text style={styles.backText}>Cartera</Text></TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>Detalle crédito</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }} showsVerticalScrollIndicator={false}>
        {/* Resumen cliente */}
        <AppleCard bordered={false} shadow={false} style={{ padding: 14, borderWidth: 0 }}>
          <View style={styles.clientHeader}>
            <View style={styles.avatar}><Icon name="user" size={18} color="#fff" /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.clientName}>{client ? `${client.nombre || ''} ${client.apellido || ''}`.trim() : clientName || 'Cliente'}</Text>
              <Text style={styles.clientSub} numberOfLines={1}>{client?.direccion || address || 'Sin dirección'} {client?.telefono ? `· ${client.telefono}` : telefono ? `· ${telefono}` : ''}</Text>
            </View>
            <TouchableOpacity onPress={openMap} style={[styles.gpsBtn, !hasCoords && { opacity: 0.4 }]}><Icon name="map-marker" size={14} color={hasCoords ? '#000' : apple.colors.tertiaryLabel} /></TouchableOpacity>
          </View>

          <View style={styles.summaryRow}>
            <View style={styles.summaryBox}><Text style={styles.summaryLabel}>PRÉSTAMO</Text><Text style={styles.summaryVal}>{invoice ? FormatMoneyDecimales(invoice.amount) : '—'}</Text></View>
            <View style={styles.summaryBox}><Text style={styles.summaryLabel}>SALDO</Text><Text style={[styles.summaryVal, { color: (invoice?.saldo ?? saldoInicial) > 0 ? apple.colors.danger : apple.colors.success }]}>{FormatMoneyDecimales(invoice?.saldo ?? saldoInicial ?? 0)}</Text></View>
            <View style={styles.summaryBox}><Text style={styles.summaryLabel}>ESTADO</Text><Text style={[styles.summaryVal, { fontSize: 12, color: (invoice?.status === 'pagado' ? apple.colors.success : apple.colors.warning) }]}>{(invoice?.status || 'pendiente').toUpperCase()}</Text></View>
          </View>

          {hasCoords && (
            <TouchableOpacity onPress={openMap} style={styles.mapPreview}>
              <Icon name="map" size={14} color={apple.colors.blue} /><Text style={styles.mapText}>Ver ubicación de venta {Number(latitud).toFixed(4)}, {Number(longitud).toFixed(4)}</Text><Icon name="external-link" size={12} color={apple.colors.blue} />
            </TouchableOpacity>
          )}

          <View style={styles.clientMeta}>
            <Text style={styles.metaText}>Doc: {client?.documento || '—'} · Alias: {client?.alias || '—'} · Cuotas: {cuotas.length} · Pagos: {pagos.length}</Text>
          </View>
        </AppleCard>

        {/* Tabla cuotas */}
        <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>CUOTAS</Text><Text style={styles.sectionCount}>{cuotas.length}</Text></View>
        <AppleCard bordered={false} shadow={false} style={{ padding: 0, overflow: 'hidden', borderWidth: 0 }}>
          <View style={styles.tableHead}>
            <Text style={[styles.th, { flex: 0.6 }]}>#</Text>
            <Text style={[styles.th, { flex: 1.4 }]}>VENCIMIENTO</Text>
            <Text style={[styles.th, { flex: 1.2, textAlign: 'right' }]}>MONTO</Text>
            <Text style={[styles.th, { flex: 1.2, textAlign: 'center' }]}>ESTADO</Text>
          </View>
          {cuotas.length === 0 ? <Text style={styles.emptyTable}>Sin cuotas registradas</Text> : (
            <FlatList data={cuotas} scrollEnabled={false} keyExtractor={i => i.id} renderItem={({ item }) => (
              <View style={styles.tr}>
                <Text style={[styles.td, { flex: 0.6, fontWeight: '700' }]}>{item.numero ?? '—'}</Text>
                <Text style={[styles.td, { flex: 1.4 }]}>{item.fecha_vencimiento ? new Date(item.fecha_vencimiento).toLocaleDateString() : '—'}</Text>
                <Text style={[styles.td, { flex: 1.2, textAlign: 'right', fontWeight: '600' }]}>{FormatMoneyDecimales(item.monto)}</Text>
                <View style={{ flex: 1.2, alignItems: 'center' }}><StatusBadge estado={item.estado} /></View>
              </View>
            )} ItemSeparatorComponent={() => <View style={styles.sep} />} />
          )}
        </AppleCard>

        {/* Tabla pagos */}
        <View style={[styles.sectionHeader, { marginTop: 16 }]}><Text style={styles.sectionTitle}>PAGOS</Text><Text style={styles.sectionCount}>{pagos.length} · {FormatMoneyDecimales(totalPagado)}</Text></View>
        <AppleCard bordered={false} shadow={false} style={{ padding: 0, overflow: 'hidden', borderWidth: 0 }}>
          <View style={styles.tableHead}>
            <Text style={[styles.th, { flex: 1 }]}>FECHA</Text>
            <Text style={[styles.th, { flex: 1, textAlign: 'right' }]}>MONTO</Text>
            <Text style={[styles.th, { flex: 0.8, textAlign: 'center' }]}>MÉTODO</Text>
          </View>
          {pagos.length === 0 ? <Text style={styles.emptyTable}>Sin pagos aún</Text> : (
            <FlatList data={pagos} scrollEnabled={false} keyExtractor={i => i.id} renderItem={({ item }) => (
              <View style={styles.tr}>
                <Text style={[styles.td, { flex: 1 }]}>{item.payment_date ? new Date(item.payment_date).toLocaleDateString() : new Date(item.created_at).toLocaleDateString()}</Text>
                <Text style={[styles.td, { flex: 1, textAlign: 'right', fontWeight: '700', color: apple.colors.success }]}>{FormatMoneyDecimales(item.amount)}</Text>
                <Text style={[styles.td, { flex: 0.8, textAlign: 'center' }]}>{(item.method || '—').toUpperCase()}</Text>
              </View>
            )} ItemSeparatorComponent={() => <View style={styles.sep} />} />
          )}
        </AppleCard>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: apple.colors.bgGrouped },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 8, color: apple.colors.secondaryLabel },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10, backgroundColor: apple.colors.card, borderBottomWidth: 0.5, borderColor: apple.colors.separator },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  backText: { color: apple.colors.blue, fontSize: 15 },
  headerTitle: { fontSize: 15, fontWeight: '600', color: apple.colors.label, flex: 1, textAlign: 'center' },
  clientHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: apple.colors.blue, alignItems: 'center', justifyContent: 'center' },
  clientName: { fontSize: 16, fontWeight: '700', color: apple.colors.label },
  clientSub: { fontSize: 12, color: apple.colors.secondaryLabel, marginTop: 1 },
  gpsBtn: { width: 32, height: 32, borderRadius: 16, borderWidth: 1, borderColor: '#000', alignItems: 'center', justifyContent: 'center', backgroundColor: 'transparent' },
  summaryRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  summaryBox: { flex: 1, backgroundColor: apple.colors.fill, borderRadius: 10, padding: 10, alignItems: 'center' },
  summaryLabel: { fontSize: 10, fontWeight: '700', color: apple.colors.secondaryLabel, letterSpacing: 0.5 },
  summaryVal: { fontSize: 13, fontWeight: '800', color: apple.colors.label, marginTop: 3 },
  mapPreview: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, backgroundColor: '#EFF6FF', borderWidth: 1, borderColor: '#DBEAFE', paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10 },
  mapText: { flex: 1, fontSize: 12, fontWeight: '600', color: apple.colors.blue },
  clientMeta: { marginTop: 8 },
  metaText: { fontSize: 11, color: apple.colors.tertiaryLabel },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, marginBottom: 6, paddingHorizontal: 4 },
  sectionTitle: { fontSize: 12, fontWeight: '700', color: apple.colors.secondaryLabel, letterSpacing: 0.5 },
  sectionCount: { fontSize: 11, color: apple.colors.tertiaryLabel, backgroundColor: apple.colors.fill, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999 },
  tableHead: { flexDirection: 'row', backgroundColor: apple.colors.fill, paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 0.5, borderColor: apple.colors.separator },
  th: { fontSize: 10, fontWeight: '700', color: apple.colors.secondaryLabel, letterSpacing: 0.5 },
  tr: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10 },
  td: { fontSize: 13, color: apple.colors.label },
  sep: { height: 0.5, backgroundColor: apple.colors.separator, marginLeft: 12 },
  emptyTable: { textAlign: 'center', padding: 16, color: apple.colors.tertiaryLabel, fontSize: 13 },
  badge: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 999 },
  badgeText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.3 },
});
