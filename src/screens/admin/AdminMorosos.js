// src/screens/admin/AdminMorosos.js
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/FontAwesome';
import { apple } from '../../theme/appleTheme';
import { appAlert } from '../../components/AppAlert';
import { useAuth } from '../../context/AuthContext';
import { getAdminMorosos, castigarCartera } from '../../services/adminService';

const formatMoney = (val) => {
  const num = parseFloat(val) || 0;
  return '$' + num.toLocaleString('es-CO');
};

const formatDate = (isoStr) => {
  if (!isoStr) return 'Sin pagos';
  const parts = isoStr.split('-');
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return isoStr;
};

export default function AdminMorosos() {
  const navigation = useNavigation();
  const { signOut } = useAuth();
  const [items, setItems] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const data = await getAdminMorosos(50);
      setItems(data);
    } catch (err) {
      appAlert('Error', err.message || 'No se pudieron cargar los morosos');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (!search.trim()) {
      setFiltered(items);
    } else {
      const q = search.toLowerCase();
      setFiltered(
        items.filter(
          (i) =>
            i.nombre_cliente?.toLowerCase().includes(q) ||
            i.apellido_cliente?.toLowerCase().includes(q) ||
            i.nombre_vendedor?.toLowerCase().includes(q)
        )
      );
    }
  }, [search, items]);

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const handleCastigar = (item) => {
    Alert.alert(
      'Castigar Cartera',
      `¿Deseas castigar el crédito de ${item.nombre_cliente}? Se suspenderán visitas y se bloquearán futuros créditos.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Castigar',
          style: 'destructive',
          onPress: async () => {
            try {
              await castigarCartera(item.invoice_id);
              appAlert('Éxito', 'Crédito castigado');
              loadData();
            } catch (err) {
              appAlert('Error', err.message);
            }
          },
        },
      ]
    );
  };

  const handleOpenCredit = (item) => {
    navigation.navigate('CreditDetail', { invoiceId: item.invoice_id });
  };

  const totalVencido = items.reduce((acc, curr) => acc + (parseFloat(curr.saldo_vencido) || 0), 0);

  return (
    <SafeAreaView style={styles.root}>
      {/* Header */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Cartera Morosa</Text>
          <Text style={styles.headerSubtitle}>
            Top 50 clientes con mayor mora
          </Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={styles.badgeTop}>
            <Text style={styles.badgeTopText}>{items.length} en mora</Text>
          </View>
          <TouchableOpacity
            onPress={() => {
              Alert.alert('Cerrar Sesión', '¿Deseas cerrar la sesión de administrador?', [
                { text: 'Cancelar', style: 'cancel' },
                { text: 'Salir', style: 'destructive', onPress: signOut },
              ]);
            }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={{ padding: 6 }}
          >
            <Icon name="sign-out" size={20} color={apple.colors.secondaryLabel} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Banner Total Vencido */}
      <View style={styles.banner}>
        <View style={styles.bannerIcon}>
          <Icon name="exclamation-triangle" size={18} color="#FFFFFF" />
        </View>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={styles.bannerLabel}>Total Vencido en Mora</Text>
          <Text style={styles.bannerVal}>{formatMoney(totalVencido)}</Text>
        </View>
      </View>

      {/* Buscador */}
      <View style={styles.searchContainer}>
        <Icon name="search" size={14} color={apple.colors.tertiaryLabel} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Buscar por cliente o vendedor..."
          placeholderTextColor={apple.colors.tertiaryLabel}
          value={search}
          onChangeText={setSearch}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Icon name="times-circle" size={14} color={apple.colors.tertiaryLabel} />
          </TouchableOpacity>
        )}
      </View>

      {/* Lista de Morosos */}
      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={apple.colors.blue} />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.invoice_id}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.clientName} numberOfLines={1}>
                    {item.nombre_cliente} {item.apellido_cliente || ''}
                  </Text>
                  <Text style={styles.vendedorText}>
                    Vendedor: <Text style={{ fontWeight: '600', color: apple.colors.label }}>{item.nombre_vendedor}</Text>
                  </Text>
                </View>
                <View style={styles.moraWrap}>
                  <Text style={styles.moraVal}>{formatMoney(item.saldo_vencido)}</Text>
                  <Text style={styles.moraLabel}>Mora Vencida</Text>
                </View>
              </View>

              <View style={styles.divider} />

              <View style={styles.grid}>
                <View style={styles.gridItem}>
                  <Text style={styles.gridLabel}>Saldo Total</Text>
                  <Text style={styles.gridVal}>{formatMoney(item.saldo)}</Text>
                </View>
                <View style={styles.gridItem}>
                  <Text style={styles.gridLabel}>Cuotas Vencidas</Text>
                  <Text style={[styles.gridVal, { color: apple.colors.danger }]}>
                    {item.cuotas_vencidas} de {item.cuotas_totales}
                  </Text>
                </View>
                <View style={styles.gridItem}>
                  <Text style={styles.gridLabel}>Último Pago</Text>
                  <Text style={styles.gridVal}>{formatDate(item.fecha_ultimo_pago)}</Text>
                </View>
              </View>

              {/* Botones */}
              <View style={styles.cardFooter}>
                <TouchableOpacity
                  style={styles.btnCastigar}
                  onPress={() => handleCastigar(item)}
                >
                  <Icon name="ban" size={12} color={apple.colors.danger} />
                  <Text style={styles.btnCastigarText}>Castigar Cartera</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.btnVer}
                  onPress={() => handleOpenCredit(item)}
                >
                  <Text style={styles.btnVerText}>Ver Crédito</Text>
                  <Icon name="arrow-right" size={12} color={apple.colors.blue} style={{ marginLeft: 4 }} />
                </TouchableOpacity>
              </View>
            </View>
          )}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={apple.colors.blue} />}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Icon name="check-circle" size={48} color={apple.colors.success} />
              <Text style={styles.emptyTitle}>Excelente: sin cartera morosa</Text>
              <Text style={styles.emptySubtitle}>No se registran créditos con cuotas vencidas</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: apple.colors.bg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: apple.spacing.l,
    paddingTop: apple.spacing.m,
    paddingBottom: apple.spacing.xs,
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: apple.colors.label,
    letterSpacing: -0.5,
  },
  headerSubtitle: {
    fontSize: 13,
    color: apple.colors.secondaryLabel,
    marginTop: 2,
  },
  badgeTop: {
    backgroundColor: '#FFEBEA',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: apple.radius.pill,
  },
  badgeTopText: {
    fontSize: 12,
    fontWeight: '700',
    color: apple.colors.danger,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#D70015',
    borderRadius: apple.radius.m,
    marginHorizontal: apple.spacing.l,
    marginVertical: apple.spacing.m,
    padding: apple.spacing.m,
    ...apple.shadow.elevated,
  },
  bannerIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.25)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  bannerLabel: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.8)',
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  bannerVal: {
    fontSize: 20,
    fontWeight: '800',
    color: '#FFFFFF',
    marginTop: 2,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: apple.colors.card,
    borderRadius: apple.radius.s,
    marginHorizontal: apple.spacing.l,
    marginBottom: apple.spacing.m,
    paddingHorizontal: 12,
    height: 40,
    ...apple.shadow.subtle,
    borderWidth: 0.5,
    borderColor: apple.colors.separator,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: apple.colors.label,
  },
  listContent: {
    paddingHorizontal: apple.spacing.l,
    paddingBottom: apple.spacing.xl,
  },
  card: {
    backgroundColor: apple.colors.card,
    borderRadius: apple.radius.m,
    padding: apple.spacing.m,
    marginBottom: apple.spacing.m,
    ...apple.shadow.card,
    ...apple.border.card,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  clientName: {
    fontSize: 15,
    fontWeight: '700',
    color: apple.colors.label,
  },
  vendedorText: {
    fontSize: 12,
    color: apple.colors.secondaryLabel,
    marginTop: 2,
  },
  moraWrap: {
    alignItems: 'flex-end',
  },
  moraVal: {
    fontSize: 16,
    fontWeight: '800',
    color: apple.colors.danger,
  },
  moraLabel: {
    fontSize: 10,
    color: apple.colors.tertiaryLabel,
  },
  divider: {
    height: 0.5,
    backgroundColor: apple.colors.separator,
    marginVertical: 10,
  },
  grid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: apple.colors.bgGrouped,
    borderRadius: apple.radius.s,
    padding: 8,
  },
  gridItem: {
    flex: 1,
    alignItems: 'center',
  },
  gridLabel: {
    fontSize: 10,
    color: apple.colors.secondaryLabel,
    marginBottom: 2,
  },
  gridVal: {
    fontSize: 12,
    fontWeight: '700',
    color: apple.colors.label,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
  },
  btnCastigar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: '#FFEBEA',
  },
  btnCastigarText: {
    fontSize: 11,
    fontWeight: '700',
    color: apple.colors.danger,
    marginLeft: 4,
  },
  btnVer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 5,
    paddingHorizontal: 8,
  },
  btnVerText: {
    fontSize: 13,
    fontWeight: '600',
    color: apple.colors.blue,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: apple.colors.secondaryLabel,
    marginTop: 14,
  },
  emptySubtitle: {
    fontSize: 13,
    color: apple.colors.tertiaryLabel,
    marginTop: 4,
  },
});
