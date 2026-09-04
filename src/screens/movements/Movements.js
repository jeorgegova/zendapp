import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, FlatList, ActivityIndicator, Alert, SafeAreaView, Modal, ScrollView } from 'react-native';
import Icon from 'react-native-vector-icons/FontAwesome';
import { useFocusEffect } from '@react-navigation/native';
import { getCajaActual } from '../../services/cajaService';
import { createCashMovement, listMovimientos, getCurrentLocationOrNull } from '../../services/movementsService';
import { FormatMoneyDecimales } from '../../utils/utilities';
import { apple } from '../../theme/appleTheme';

export default function MovementsScreen() {
  const [caja, setCaja] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterTipo, setFilterTipo] = useState('todos');
  const [modalVisible, setModalVisible] = useState(false);
  const [formTipo, setFormTipo] = useState('ingreso');
  const [formDesc, setFormDesc] = useState('');
  const [formMonto, setFormMonto] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const actual = await getCajaActual();
      setCaja(actual);
      setItems((await listMovimientos({ cajaId: actual?.id || null, limit: 50, offset: 0 })) || []);
    } catch (e) { Alert.alert('Error', e.message); } finally { setLoading(false); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const handleSearch = async () => {
    try { setItems((await listMovimientos({ cajaId: caja?.id || null, limit: 50, offset: 0, search })) || []); } catch (e) { Alert.alert('Error', e.message); }
  };
  const handleCreate = async () => {
    const monto = parseFloat(formMonto.replace(',', '.'));
    if (!monto || monto <= 0) return Alert.alert('Error', 'Monto inválido');
    if (!formDesc.trim()) return Alert.alert('Error', 'Descripción requerida');
    if (!caja) return Alert.alert('Error', 'Debes tener caja abierta');
    setSaving(true);
    try {
      const loc = await getCurrentLocationOrNull();
      let desc = formDesc.trim();
      if (loc.lat && loc.lng) desc += ` [${loc.lat.toFixed(5)},${loc.lng.toFixed(5)}]`;
      await createCashMovement({ cajaId: caja.id, tipo: formTipo, descripcion: desc, monto });
      setModalVisible(false); setFormDesc(''); setFormMonto(''); setFormTipo('ingreso'); await load(); Alert.alert('Éxito', `${formTipo === 'ingreso' ? 'Ingreso' : 'Retiro'} registrado`);
    } catch (e) { Alert.alert('Error', e.message); } finally { setSaving(false); }
  };

  const filtered = items.filter(i => filterTipo === 'todos' || i.tipo === filterTipo);
  const Row = ({ item }) => {
    const isIngreso = item.tipo === 'ingreso' || item.tipo === 'pago';
    const color = isIngreso ? apple.colors.success : item.tipo === 'venta' ? apple.colors.warning : apple.colors.danger;
    return (
      <View style={styles.row}>
        <View style={[styles.badge, { backgroundColor: color + '15' }]}><Icon name={isIngreso ? 'plus' : 'minus'} size={11} color={color} /></View>
        <View style={{ flex: 1 }}><Text style={styles.rowTitle}>{item.tipo.toUpperCase()} · {FormatMoneyDecimales(item.monto)}</Text><Text style={styles.rowSub} numberOfLines={1}>{item.descripcion || 'Sin descripción'}</Text><Text style={styles.rowDate}>{new Date(item.fecha).toLocaleString()}</Text></View>
      </View>
    );
  };

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color={apple.colors.blue} /></View>;

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}><Text style={styles.headerTitle}>Movimientos</Text><Text style={styles.headerSub}>{caja ? `Caja ${caja.id.slice(0, 8)}…` : 'Sin caja abierta'}</Text></View>

      <View style={styles.controls}>
        <View style={styles.searchRow}>
          <View style={styles.searchWrap}>
            <Icon name="search" size={13} color={apple.colors.tertiaryLabel} />
            <TextInput style={styles.searchInput} placeholder="Buscar descripción..." placeholderTextColor={apple.colors.tertiaryLabel} value={search} onChangeText={setSearch} onSubmitEditing={handleSearch} returnKeyType="search" />
          </View>
          <TouchableOpacity style={styles.searchBtn} onPress={handleSearch}><Icon name="arrow-right" size={12} color="#fff" /></TouchableOpacity>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, marginTop: 10 }}>
          {['todos', 'ingreso', 'retiro', 'venta', 'pago'].map(t => (
            <TouchableOpacity key={t} onPress={() => setFilterTipo(t)} style={[styles.chip, filterTipo === t && styles.chipActive]}>
              <Text style={[styles.chipText, filterTipo === t && styles.chipTextActive]}>{t}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <FlatList data={filtered} keyExtractor={i => i.id} renderItem={Row} ListEmptyComponent={<View style={styles.empty}><Icon name="inbox" size={28} color={apple.colors.separator} /><Text style={styles.emptyTitle}>Sin movimientos</Text></View>} contentContainerStyle={{ paddingBottom: 90 }} />

      <TouchableOpacity style={[styles.fab, !caja && { backgroundColor: apple.colors.tertiaryLabel }]} onPress={() => caja ? setModalVisible(true) : Alert.alert('Caja cerrada', 'Abre caja en tab Caja para ingresos/retiros.')}>
        <Icon name="plus" size={18} color="#fff" />
      </TouchableOpacity>

      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.overlay}><View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.sheetHeader}><Text style={styles.sheetTitle}>Nuevo movimiento</Text><TouchableOpacity onPress={() => setModalVisible(false)}><Icon name="times" size={18} color={apple.colors.tertiaryLabel} /></TouchableOpacity></View>
          <Text style={styles.label}>Tipo</Text>
          <View style={styles.tipoRow}>
            <TouchableOpacity style={[styles.tipoBtn, formTipo === 'ingreso' && { backgroundColor: apple.colors.success, borderColor: apple.colors.success }]} onPress={() => setFormTipo('ingreso')}><Text style={[styles.tipoText, formTipo === 'ingreso' && { color: '#fff' }]}>Ingreso</Text></TouchableOpacity>
            <TouchableOpacity style={[styles.tipoBtn, formTipo === 'retiro' && { backgroundColor: apple.colors.danger, borderColor: apple.colors.danger }]} onPress={() => setFormTipo('retiro')}><Text style={[styles.tipoText, formTipo === 'retiro' && { color: '#fff' }]}>Retiro</Text></TouchableOpacity>
          </View>
          <Text style={styles.hint}>Venta/pago son automáticos.</Text>
          <Text style={styles.label}>Descripción</Text><TextInput style={styles.input} value={formDesc} onChangeText={setFormDesc} placeholder="Ej. Transporte, consignación" placeholderTextColor={apple.colors.tertiaryLabel} />
          <Text style={styles.label}>Monto</Text><TextInput style={styles.input} value={formMonto} onChangeText={setFormMonto} keyboardType="numeric" placeholder="0.00" placeholderTextColor={apple.colors.tertiaryLabel} />
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}><TouchableOpacity style={styles.cancel} onPress={() => setModalVisible(false)}><Text style={styles.cancelText}>Cancelar</Text></TouchableOpacity><TouchableOpacity style={styles.save} onPress={handleCreate} disabled={saving}>{saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>Guardar</Text>}</TouchableOpacity></View>
        </View></View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: apple.colors.bgGrouped },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { backgroundColor: apple.colors.card, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12, borderBottomWidth: 0.5, borderColor: apple.colors.separator },
  headerTitle: { fontSize: 28, fontWeight: '700', color: apple.colors.label },
  headerSub: { fontSize: 13, color: apple.colors.secondaryLabel, marginTop: 2 },
  controls: {
    backgroundColor: '#FFFFFF',
    margin: 16,
    marginBottom: 10,
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E8EAED',
  },
  searchRow: { flexDirection: 'row', gap: 8 },
  searchWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: apple.colors.fill, borderRadius: apple.radius.s, borderWidth: 1, borderColor: apple.colors.separator, paddingHorizontal: 12, height: 40 },
  searchInput: { flex: 1, fontSize: 15, color: apple.colors.label },
  searchBtn: { backgroundColor: apple.colors.blue, width: 40, height: 40, borderRadius: apple.radius.s, alignItems: 'center', justifyContent: 'center' },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, backgroundColor: apple.colors.card, borderWidth: 1, borderColor: apple.colors.separator },
  chipActive: { backgroundColor: apple.colors.blue, borderColor: apple.colors.blue },
  chipText: { fontSize: 12, fontWeight: '600', color: apple.colors.secondaryLabel, textTransform: 'capitalize' },
  chipTextActive: { color: '#fff' },
  row: { flexDirection: 'row', backgroundColor: apple.colors.card, marginHorizontal: 16, marginTop: 8, padding: 14, borderRadius: apple.radius.m, gap: 12, alignItems: 'center', borderWidth: 1, borderColor: '#E8EAED' },
  badge: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontSize: 13, fontWeight: '600', color: apple.colors.label },
  rowSub: { fontSize: 12, color: apple.colors.secondaryLabel, marginTop: 2 },
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 16,
    backgroundColor: apple.colors.blue,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheet: { backgroundColor: apple.colors.card, borderTopLeftRadius: apple.radius.xl, borderTopRightRadius: apple.radius.xl, padding: 20, paddingBottom: 32 },
  handle: { width: 36, height: 5, borderRadius: 3, backgroundColor: apple.colors.separator, alignSelf: 'center', marginBottom: 16 },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sheetTitle: { fontSize: 17, fontWeight: '700', color: apple.colors.label },
  label: { fontSize: 11, fontWeight: '600', color: apple.colors.secondaryLabel, letterSpacing: 0.5, textTransform: 'uppercase', marginTop: 10, marginBottom: 6 },
  tipoRow: { flexDirection: 'row', gap: 8 },
  tipoBtn: { flex: 1, height: 44, borderRadius: apple.radius.s, borderWidth: 1, borderColor: apple.colors.separator, alignItems: 'center', justifyContent: 'center', backgroundColor: apple.colors.card },
  tipoText: { fontWeight: '700', color: apple.colors.secondaryLabel },
  hint: { fontSize: 11, color: apple.colors.tertiaryLabel, marginTop: 6 },
  input: { backgroundColor: apple.colors.fill, borderRadius: apple.radius.s, borderWidth: 1, borderColor: apple.colors.separator, paddingHorizontal: 14, height: 46, fontSize: 16, color: apple.colors.label },
  cancel: { flex: 1, height: 48, borderRadius: apple.radius.s, backgroundColor: apple.colors.fill, alignItems: 'center', justifyContent: 'center' },
  cancelText: { fontWeight: '600', color: apple.colors.label },
  save: { flex: 1, height: 48, borderRadius: apple.radius.s, backgroundColor: apple.colors.blue, alignItems: 'center', justifyContent: 'center' },
  saveText: { fontWeight: '700', color: '#fff' },
});
