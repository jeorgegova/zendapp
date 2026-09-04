import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, SafeAreaView, FlatList, TextInput, ActivityIndicator, TouchableOpacity, Animated } from 'react-native';
import Icon from 'react-native-vector-icons/FontAwesome';
import ItemPayments from './components/itemPayments';
import { getData, getDbConnection } from '../../database/db';
import { FormatMoneyDecimales } from '../../utils/utilities';
import { apple } from '../../theme/appleTheme';

const StatsCard = ({ pending, processed, pendingAmount, collected, progress }) => (
  <View style={styles.statsCard}>
    <View style={styles.statsRow}>
      <View style={styles.statBox}>
        <Text style={styles.statLabel}>VISITAS</Text>
        <Text style={styles.statValue}>{processed}<Text style={styles.statMuted}> / {pending}</Text></Text>
        <View style={styles.progressMini}><View style={[styles.progressFill, { width: `${progress}%` }]} /></View>
      </View>
      <View style={styles.vSep} />
      <View style={styles.statBox}>
        <Text style={styles.statLabel}>RECAUDO</Text>
        <Text style={styles.statValue} numberOfLines={1}>{FormatMoneyDecimales(collected)}<Text style={styles.statMuted}> / {FormatMoneyDecimales(pendingAmount)}</Text></Text>
        <Text style={styles.statCaption}>{progress}% completado</Text>
      </View>
    </View>
  </View>
);

const mapPaymentType = (id) => ({ 1: 'MENSUAL', 2: 'SEMANAL', 3: 'QUINCENAL' }[id] || '—');
const normalizeClient = (item) => ({
  id: item.id, name: (item.name?.trim() || 'Sin nombre'), address: (item.address?.trim() || 'Sin dirección'),
  amount: Number(item.amount) || 0, status: (item.status || '').toUpperCase().trim(),
  estadoPago: (item.estadoPago || '').toLowerCase().trim(), estadoMovil: (item.status || '').toLowerCase().trim(),
  paymentType: mapPaymentType(item.paymentType), time: item.time || '—', saldo: Number(item.saldo) || 0,
  cuotasPagas: Number(item.cuotasPagas) || 0, saldoVencido: Number(item.saldoVencido) || 0,
  nombreUno: item.nombreUno?.trim() || '', apellidoUno: item.apellidoUno?.trim() || '',
});

const loadClientsFromDB = async () => {
  const db = await getDbConnection();
  const data = await getData(db, `SELECT id, nombreUno || ' ' || COALESCE(apellidoUno, '') AS name, direccion AS address, valorCuota AS amount, estadoMovil AS status, estado AS estadoPago, paymentTermId AS paymentType, strftime('%H:%M', fecha) AS time, saldo, cuotasPagas, saldoVencido, nombreUno, apellidoUno FROM facturas WHERE estadoMovil IS NOT NULL`);
  return data.map(normalizeClient);
};
const calculateStats = async (clients) => {
  const db = await getDbConnection();
  const pagos = await getData(db, `SELECT SUM(valor) as total FROM detallesCaja WHERE tipo = 'pago'`);
  const collected = Number(pagos[0]?.total || 0);
  const processed = clients.filter(c => c.estadoMovil === 'actualizado');
  const pendingAmount = clients.reduce((s, c) => s + c.amount, 0);
  const totalVisits = clients.length;
  const progress = totalVisits > 0 ? Math.round((processed.length / totalVisits) * 100) : 0;
  return { pending: totalVisits, processed: processed.length, pendingAmount, collected, progress };
};

export default function Payments() {
  const [showPending, setShowPending] = useState(true);
  const [searchText, setSearchText] = useState('');
  const [clients, setClients] = useState([]);
  const [stats, setStats] = useState({ pending: 0, processed: 0, pendingAmount: 0, collected: 0, progress: 0 });
  const [loading, setLoading] = useState(true);

  // Animaciones de traslación
  const slideAnim = useRef(new Animated.Value(0)).current; // 0 = pendiente, 1 = tramitados
  const listTranslateX = useRef(new Animated.Value(0)).current;
  const listOpacity = useRef(new Animated.Value(1)).current;

  const handleTabChange = (pending) => {
    if (showPending === pending) return;
    
    // Animar indicador segmentado
    Animated.spring(slideAnim, {
      toValue: pending ? 0 : 1,
      useNativeDriver: false,
      friction: 8,
      tension: 50,
    }).start();

    // Animar transición de lista con traslación suave
    const direction = pending ? 30 : -30;
    Animated.sequence([
      Animated.parallel([
        Animated.timing(listTranslateX, { toValue: direction, duration: 100, useNativeDriver: true }),
        Animated.timing(listOpacity, { toValue: 0, duration: 100, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(listTranslateX, { toValue: 0, duration: 150, useNativeDriver: true }),
        Animated.timing(listOpacity, { toValue: 1, duration: 150, useNativeDriver: true }),
      ]),
    ]).start();

    setShowPending(pending);
  };

  const loadClients = useCallback(async () => {
    setLoading(true);
    try {
      const n = await loadClientsFromDB();
      setClients(n);
      setStats(await calculateStats(n));
    } catch (e) { console.error(e); } finally { setLoading(false); }
  }, []);
  useEffect(() => { loadClients(); }, [loadClients]);

  const filteredClients = useMemo(() => clients.filter(c => (showPending ? (c.estadoMovil === 'pendiente' && c.saldo > 0 && c.estadoPago !== 'cancel') : c.estadoMovil === 'actualizado') && c.name.toLowerCase().includes(searchText.toLowerCase())), [clients, showPending, searchText]);

  // Interpolación de posición para el fondo animado del segment
  const segmentLeft = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '50%'],
  });

  return (
    <SafeAreaView style={styles.root}>
      {/* Header integrado estilo compacto con Visitas y Recaudo al lado derecho */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View style={styles.titleSection}>
            <Text style={styles.largeTitle}>Cartera</Text>
            <Text style={styles.headerSub}>{filteredClients.length} clientes · {showPending ? 'Por visitar' : 'Tramitados'}</Text>
          </View>

          {/* Mini Stats a la derecha del título: Visitas con barra + Recaudo */}
          <View style={styles.headerStats}>
            <View style={styles.statMiniItem}>
              <Text style={styles.statMiniLabel}>VISITAS</Text>
              <Text style={styles.statMiniVal}>{stats.processed}<Text style={styles.statMiniMuted}>/{stats.pending}</Text></Text>
              <View style={styles.visitasBarBg}>
                <View style={[styles.visitasBarFill, { width: `${stats.progress}%` }]} />
              </View>
            </View>
            <View style={styles.statMiniSep} />
            <View style={styles.statMiniItem}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Text style={styles.statMiniLabel}>RECAUDO</Text>
                <View style={styles.percentBadge}>
                  <Text style={styles.percentText}>{stats.progress}%</Text>
                </View>
              </View>
              <Text style={styles.statMiniVal}>
                {FormatMoneyDecimales(stats.collected)}
                <Text style={styles.statMiniMuted}> / {FormatMoneyDecimales(stats.pendingAmount)}</Text>
              </Text>
            </View>
          </View>
        </View>

        {/* Search bar compacta */}
        <View style={styles.searchBar}>
          <Icon name="search" size={13} color={apple.colors.tertiaryLabel} />
          <TextInput
            style={styles.searchInput}
            placeholder="Buscar cliente"
            placeholderTextColor={apple.colors.tertiaryLabel}
            value={searchText}
            onChangeText={setSearchText}
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
          {searchText.length > 0 && (
            <TouchableOpacity onPress={() => setSearchText('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Icon name="times-circle" size={14} color={apple.colors.tertiaryLabel} />
            </TouchableOpacity>
          )}
        </View>

        {/* Segmented control con traslación fluida */}
        <View style={styles.segment}>
          <Animated.View style={[styles.segActiveBg, { left: segmentLeft }]} />
          <TouchableOpacity activeOpacity={0.7} onPress={() => handleTabChange(true)} style={styles.segOpt}>
            <Icon name="clock-o" size={12} color={showPending ? apple.colors.label : apple.colors.secondaryLabel} />
            <Text style={[styles.segText, showPending && styles.segTextActive]}> Por visitar</Text>
            <View style={[styles.countBadge, showPending && styles.countBadgeActive]}>
              <Text style={[styles.countText, showPending && styles.countTextActive]}>{clients.filter(c => c.estadoMovil === 'pendiente' && c.saldo > 0).length}</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity activeOpacity={0.7} onPress={() => handleTabChange(false)} style={styles.segOpt}>
            <Icon name="check-circle" size={12} color={!showPending ? apple.colors.label : apple.colors.secondaryLabel} />
            <Text style={[styles.segText, !showPending && styles.segTextActive]}> Tramitados</Text>
            <View style={[styles.countBadge, !showPending && styles.countBadgeActive]}>
              <Text style={[styles.countText, !showPending && styles.countTextActive]}>{clients.filter(c => c.estadoMovil === 'actualizado').length}</Text>
            </View>
          </TouchableOpacity>
        </View>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={apple.colors.blue} /><Text style={styles.loadingText}>Cargando cartera…</Text></View>
      ) : (
        <Animated.View style={{ flex: 1, transform: [{ translateX: listTranslateX }], opacity: listOpacity }}>
          <FlatList
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingBottom: 16, paddingTop: 6 }}
            data={filteredClients}
            keyExtractor={i => i.id.toString()}
            renderItem={({ item }) => (
              <ItemPayments id={item.id} name={item.name} address={item.address} amount={item.amount} status={item.status} time={item.time} paymentType={item.paymentType} estadoPago={item.estadoPago} saldo={item.saldo} cuotasPagas={item.cuotasPagas} saldoVencido={item.saldoVencido} nombreUno={item.nombreUno} apellidoUno={item.apellidoUno} valorCuota={item.amount} estadoMovil={item.estadoMovil} onPaymentSuccess={loadClients} />
            )}
            ListEmptyComponent={
              <View style={styles.empty}>
                <View style={styles.emptyIcon}><Icon name="search" size={22} color={apple.colors.tertiaryLabel} /></View>
                <Text style={styles.emptyTitle}>Sin resultados</Text>
                <Text style={styles.emptySub}>{searchText ? 'Prueba otro término' : showPending ? 'No hay clientes por visitar' : 'No hay tramitados'}</Text>
              </View>
            }
          />
        </Animated.View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F4F5F7' },
  header: { backgroundColor: '#FFFFFF', paddingHorizontal: 16, paddingTop: 10, paddingBottom: 12, borderBottomWidth: 1, borderColor: '#E8EAED' },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  titleSection: { flex: 1 },
  largeTitle: { fontSize: 26, fontWeight: '800', color: apple.colors.label, letterSpacing: -0.6 },
  headerSub: { fontSize: 12, color: apple.colors.secondaryLabel, marginTop: 1, fontWeight: '500' },
  headerStats: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F0F2F5', borderRadius: 12, paddingVertical: 6, paddingHorizontal: 10, gap: 10 },
  statMiniItem: { alignItems: 'flex-start' },
  statMiniLabel: { fontSize: 9, fontWeight: '700', color: apple.colors.secondaryLabel, letterSpacing: 0.3 },
  statMiniVal: { fontSize: 12, fontWeight: '700', color: apple.colors.label },
  statMiniMuted: { fontSize: 10, fontWeight: '500', color: apple.colors.tertiaryLabel },
  visitasBarBg: { width: 50, height: 3, backgroundColor: '#E2E5EB', borderRadius: 2, overflow: 'hidden', marginTop: 3 },
  visitasBarFill: { height: '100%', backgroundColor: apple.colors.success, borderRadius: 2 },
  percentBadge: { backgroundColor: '#E2E5EB', paddingHorizontal: 4, paddingVertical: 0.5, borderRadius: 4 },
  percentText: { fontSize: 9, fontWeight: '700', color: apple.colors.secondaryLabel },
  statMiniSep: { width: 1, height: 26, backgroundColor: '#D8DCE3' },
  searchBar: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#F0F2F5', borderRadius: 12, paddingHorizontal: 12, height: 36, marginTop: 10 },
  searchInput: { flex: 1, fontSize: 14, color: apple.colors.label, paddingVertical: 0 },
  segment: { flexDirection: 'row', backgroundColor: '#F0F2F5', borderRadius: 12, padding: 3, marginTop: 10, position: 'relative' },
  segActiveBg: {
    position: 'absolute',
    top: 3,
    bottom: 3,
    width: '50%',
    backgroundColor: '#FFFFFF',
    borderRadius: 9,
  },
  segOpt: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 6, zIndex: 1 },
  segText: { fontSize: 12, fontWeight: '600', color: apple.colors.secondaryLabel },
  segTextActive: { color: apple.colors.label },
  countBadge: { backgroundColor: '#E2E5EB', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 999, minWidth: 20, alignItems: 'center' },
  countBadgeActive: { backgroundColor: apple.colors.label },
  countText: { fontSize: 10, fontWeight: '700', color: apple.colors.secondaryLabel },
  countTextActive: { color: '#fff' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  loadingText: { marginTop: 10, color: apple.colors.secondaryLabel, fontSize: 13 },
  empty: { alignItems: 'center', padding: 40, marginTop: 12 },
  emptyIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: apple.colors.fill, borderWidth: 0.5, borderColor: apple.colors.separator, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { marginTop: 12, fontSize: 15, fontWeight: '600', color: apple.colors.label },
  emptySub: { marginTop: 4, fontSize: 13, color: apple.colors.tertiaryLabel, textAlign: 'center' },
});
