// src/screens/admin/AdminCarteraDetalle.js
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
import { useRoute, useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/FontAwesome';
import { apple } from '../../theme/appleTheme';
import { appAlert } from '../../components/AppAlert';
import { getCarteraDetail, castigarCartera } from '../../services/adminService';

const formatMoney = (val) => {
  const num = parseFloat(val) || 0;
  return '$' + num.toLocaleString('es-CO');
};

export default function AdminCarteraDetalle() {
  const route = useRoute();
  const navigation = useNavigation();
  const { user } = route.params || {};

  const [items, setItems] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    if (!user?.usuario_id && !user?.id) return;
    const userId = user.usuario_id || user.id;
    try {
      const data = await getCarteraDetail(userId);
      setItems(data);
    } catch (err) {
      appAlert('Error', err.message || 'No se pudo cargar el detalle');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

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
            i.documento?.toLowerCase().includes(q)
        )
      );
    }
  }, [search, items]);

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const handleCastigar = (invoice) => {
    Alert.alert(
      'Castigar Cartera',
      `¿Estás seguro de castigar el crédito de ${invoice.nombre_cliente}? Se bloquearán futuros créditos y saldrá de la ruta de cobro.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Castigar',
          style: 'destructive',
          onPress: async () => {
            try {
              await castigarCartera(invoice.invoice_id);
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

  const handleOpenCredit = (invoice) => {
    navigation.navigate('CreditDetail', { invoiceId: invoice.invoice_id });
  };

  return (
    <SafeAreaView style={styles.root}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Icon name="chevron-left" size={16} color={apple.colors.blue} />
          <Text style={styles.backText}>Cartera</Text>
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {user?.nombre} {user?.apellido || ''}
          </Text>
          <Text style={styles.headerSubtitle}>
            {items.length} clientes activos
          </Text>
        </View>
      </View>

      {/* Buscador */}
      <View style={styles.searchContainer}>
        <Icon name="search" size={14} color={apple.colors.tertiaryLabel} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Buscar cliente o documento..."
          placeholderTextColor={apple.colors.tertiaryLabel}
          value={search}
          onChangeText={setSearch}
          clearButtonMode="while-editing"
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Icon name="times-circle" size={14} color={apple.colors.tertiaryLabel} />
          </TouchableOpacity>
        )}
      </View>

      {/* Lista de Créditos */}
      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={apple.colors.blue} />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.invoice_id}
          renderItem={({ item }) => {
            const hasVencido = parseFloat(item.saldo_vencido) > 0;
            return (
              <TouchableOpacity
                style={styles.card}
                activeOpacity={0.8}
                onPress={() => handleOpenCredit(item)}
              >
                <View style={styles.cardHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.clientName} numberOfLines={1}>
                      {item.nombre_cliente} {item.apellido_cliente || ''}
                    </Text>
                    <Text style={styles.clientDoc}>
                      Doc: {item.documento || 'S/D'} · Tel: {item.telefono || 'S/T'}
                    </Text>
                  </View>
                  <View style={styles.saldoWrap}>
                    <Text style={styles.saldoVal}>{formatMoney(item.saldo)}</Text>
                    <Text style={styles.saldoLabel}>Saldo Actual</Text>
                  </View>
                </View>

                <View style={styles.divider} />

                <View style={styles.detailGrid}>
                  <View style={styles.gridCol}>
                    <Text style={styles.gridLabel}>Monto Inicial</Text>
                    <Text style={styles.gridVal}>{formatMoney(item.saldo_inicial)}</Text>
                  </View>
                  <View style={styles.gridCol}>
                    <Text style={styles.gridLabel}>Saldo Vencido</Text>
                    <Text style={[styles.gridVal, hasVencido && { color: apple.colors.danger }]}>
                      {formatMoney(item.saldo_vencido)}
                    </Text>
                  </View>
                  <View style={styles.gridCol}>
                    <Text style={styles.gridLabel}>Cuotas</Text>
                    <Text style={styles.gridVal}>
                      {item.cuota_actual}/{item.cuotas_totales} ({item.cuotas_restantes} rest.)
                    </Text>
                  </View>
                </View>

                {/* Acciones */}
                <View style={styles.cardFooter}>
                  {hasVencido ? (
                    <TouchableOpacity
                      style={styles.btnCastigar}
                      onPress={() => handleCastigar(item)}
                    >
                      <Icon name="ban" size={12} color={apple.colors.danger} />
                      <Text style={styles.btnCastigarText}>Castigar Cartera</Text>
                    </TouchableOpacity>
                  ) : <View />}

                  <TouchableOpacity
                    style={styles.btnVer}
                    onPress={() => handleOpenCredit(item)}
                  >
                    <Text style={styles.btnVerText}>Ver Detalle</Text>
                    <Icon name="arrow-right" size={12} color={apple.colors.blue} style={{ marginLeft: 4 }} />
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            );
          }}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={apple.colors.blue} />}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Icon name="inbox" size={48} color={apple.colors.tertiaryLabel} />
              <Text style={styles.emptyTitle}>Sin créditos</Text>
              <Text style={styles.emptySubtitle}>Este vendedor no tiene créditos con saldo pendiente</Text>
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
    alignItems: 'center',
    paddingHorizontal: apple.spacing.l,
    paddingTop: apple.spacing.m,
    paddingBottom: apple.spacing.s,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingRight: 10,
  },
  backText: {
    fontSize: 16,
    color: apple.colors.blue,
    marginLeft: 4,
    fontWeight: '500',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: apple.colors.label,
  },
  headerSubtitle: {
    fontSize: 12,
    color: apple.colors.secondaryLabel,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: apple.colors.card,
    borderRadius: apple.radius.s,
    marginHorizontal: apple.spacing.l,
    marginVertical: apple.spacing.s,
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
    paddingTop: apple.spacing.s,
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
  clientDoc: {
    fontSize: 12,
    color: apple.colors.secondaryLabel,
    marginTop: 2,
  },
  saldoWrap: {
    alignItems: 'flex-end',
  },
  saldoVal: {
    fontSize: 16,
    fontWeight: '800',
    color: apple.colors.blue,
  },
  saldoLabel: {
    fontSize: 10,
    color: apple.colors.tertiaryLabel,
  },
  divider: {
    height: 0.5,
    backgroundColor: apple.colors.separator,
    marginVertical: 10,
  },
  detailGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: apple.colors.bgGrouped,
    borderRadius: apple.radius.s,
    padding: 8,
  },
  gridCol: {
    flex: 1,
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
    paddingVertical: 4,
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
