// src/screens/admin/AdminReportes.js
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
  RefreshControl,
  Share,
  Alert,
} from 'react-native';
import Icon from 'react-native-vector-icons/FontAwesome';
import { apple } from '../../theme/appleTheme';
import { appAlert } from '../../components/AppAlert';
import LogoutConfirmModal from '../../components/LogoutConfirmModal';
import { useAuth } from '../../context/AuthContext';
import { getReporteConsolidado } from '../../services/adminService';

const formatMoney = (val) => {
  const num = parseFloat(val) || 0;
  return '$' + num.toLocaleString('es-CO');
};

const getTodayIso = () => {
  const d = new Date();
  return d.toISOString().split('T')[0];
};

const getFirstDayOfMonthIso = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split('T')[0];
};

export default function AdminReportes() {
  const { signOut } = useAuth();
  const [fechaIni, setFechaIni] = useState(getFirstDayOfMonthIso());
  const [fechaFin, setFechaFin] = useState(getTodayIso());
  const [tipo, setTipo] = useState('consolidado'); // 'consolidado', 'gasto', 'movimiento'
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showLogout, setShowLogout] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const res = await getReporteConsolidado(fechaIni, fechaFin);
      setData(res);
    } catch (err) {
      appAlert('Error', err.message || 'No se pudo generar el reporte');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [fechaIni, fechaFin]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const handleExport = async (user) => {
    const reportText = `
📊 REPORTE DE GESTIÓN ZENDA
=================================
Vendedor: ${user.nombre} ${user.apellido || ''} (${user.rol?.toUpperCase()})
Periodo: ${fechaIni} hasta ${fechaFin}
Tipo: ${tipo.toUpperCase()}
---------------------------------
💰 Recaudado:  ${formatMoney(user.total_recaudado)}
🛒 Ventas:      ${formatMoney(user.total_ventas)}
🏷️ Gastos:      ${formatMoney(user.total_gastos)}
📥 Ingresos:    ${formatMoney(user.total_ingresos)}
📤 Retiros:     ${formatMoney(user.total_retiros)}
🚫 No Pagos:    ${user.total_nopagos} clientes
💼 Cartera Hoy: ${formatMoney(user.saldo_cartera_actual)}
=================================
Generado el: ${new Date().toLocaleString('es-CO')}
`;

    try {
      await Share.share({
        title: `Reporte ${user.nombre} (${fechaIni} - ${fechaFin})`,
        message: reportText,
      });
    } catch (err) {
      appAlert('Error', err.message);
    }
  };

  // Totales generales
  const totalRecaudado = data.reduce((acc, curr) => acc + (parseFloat(curr.total_recaudado) || 0), 0);
  const totalVentas = data.reduce((acc, curr) => acc + (parseFloat(curr.total_ventas) || 0), 0);
  const totalGastos = data.reduce((acc, curr) => acc + (parseFloat(curr.total_gastos) || 0), 0);

  return (
    <SafeAreaView style={styles.root}>
      {/* Header */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Reportes</Text>
          <Text style={styles.headerSubtitle}>
            Consolidado por periodo y vendedor
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => setShowLogout(true)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={{ padding: 6 }}
        >
          <Icon name="sign-out" size={20} color={apple.colors.secondaryLabel} />
        </TouchableOpacity>
      </View>

      {/* Selector de Tipo */}
      <View style={styles.typeSelector}>
        {[
          { key: 'consolidado', label: 'Consolidado' },
          { key: 'gasto', label: 'Gastos' },
          { key: 'movimiento', label: 'Movimientos' },
        ].map((t) => (
          <TouchableOpacity
            key={t.key}
            style={[styles.typeBtn, tipo === t.key && styles.typeBtnActive]}
            onPress={() => setTipo(t.key)}
          >
            <Text style={[styles.typeBtnText, tipo === t.key && styles.typeBtnTextActive]}>
              {t.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Rango de Fechas */}
      <View style={styles.dateBar}>
        <Icon name="calendar" size={14} color={apple.colors.secondaryLabel} />
        <Text style={styles.dateText}>
          {fechaIni} al {fechaFin}
        </Text>
      </View>

      {/* Resumen Global */}
      <View style={styles.summaryCard}>
        <View style={styles.summaryCol}>
          <Text style={styles.summaryLabel}>Recaudado</Text>
          <Text style={[styles.summaryVal, { color: apple.colors.success }]}>
            {formatMoney(totalRecaudado)}
          </Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryCol}>
          <Text style={styles.summaryLabel}>Ventas</Text>
          <Text style={[styles.summaryVal, { color: apple.colors.blue }]}>
            {formatMoney(totalVentas)}
          </Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryCol}>
          <Text style={styles.summaryLabel}>Gastos</Text>
          <Text style={[styles.summaryVal, { color: apple.colors.danger }]}>
            {formatMoney(totalGastos)}
          </Text>
        </View>
      </View>

      {/* Lista de Vendedores */}
      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={apple.colors.blue} />
        </View>
      ) : (
        <FlatList
          data={data}
          keyExtractor={(item) => item.usuario_id}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <View>
                  <Text style={styles.userName}>
                    {item.nombre} {item.apellido || ''}
                  </Text>
                  <Text style={styles.userRole}>{item.rol?.toUpperCase()}</Text>
                </View>
                <TouchableOpacity
                  style={styles.btnExport}
                  onPress={() => handleExport(item)}
                >
                  <Icon name="file-pdf-o" size={13} color={apple.colors.blue} />
                  <Text style={styles.btnExportText}>Exportar</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.divider} />

              <View style={styles.grid}>
                <View style={styles.gridItem}>
                  <Text style={styles.gridLabel}>Recaudado</Text>
                  <Text style={[styles.gridVal, { color: apple.colors.success }]}>
                    {formatMoney(item.total_recaudado)}
                  </Text>
                </View>
                <View style={styles.gridItem}>
                  <Text style={styles.gridLabel}>Ventas</Text>
                  <Text style={styles.gridVal}>{formatMoney(item.total_ventas)}</Text>
                </View>
                <View style={styles.gridItem}>
                  <Text style={styles.gridLabel}>Gastos</Text>
                  <Text style={[styles.gridVal, { color: apple.colors.danger }]}>
                    {formatMoney(item.total_gastos)}
                  </Text>
                </View>
              </View>

              <View style={[styles.grid, { marginTop: 6 }]}>
                <View style={styles.gridItem}>
                  <Text style={styles.gridLabel}>Ingresos</Text>
                  <Text style={styles.gridVal}>{formatMoney(item.total_ingresos)}</Text>
                </View>
                <View style={styles.gridItem}>
                  <Text style={styles.gridLabel}>Retiros</Text>
                  <Text style={styles.gridVal}>{formatMoney(item.total_retiros)}</Text>
                </View>
                <View style={styles.gridItem}>
                  <Text style={styles.gridLabel}>No Pagos</Text>
                  <Text style={styles.gridVal}>{item.total_nopagos}</Text>
                </View>
              </View>
            </View>
          )}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={apple.colors.blue} />}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Icon name="bar-chart" size={48} color={apple.colors.tertiaryLabel} />
              <Text style={styles.emptyTitle}>Sin datos</Text>
              <Text style={styles.emptySubtitle}>No hay información para el rango de fechas seleccionado</Text>
            </View>
          }
        />
      )}
      <LogoutConfirmModal
        visible={showLogout}
        onClose={() => setShowLogout(false)}
        onConfirm={signOut}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: apple.colors.bg,
  },
  header: {
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
  typeSelector: {
    flexDirection: 'row',
    marginHorizontal: apple.spacing.l,
    marginVertical: apple.spacing.s,
    backgroundColor: apple.colors.bgGrouped,
    borderRadius: apple.radius.s,
    padding: 3,
  },
  typeBtn: {
    flex: 1,
    paddingVertical: 7,
    alignItems: 'center',
    borderRadius: 7,
  },
  typeBtnActive: {
    backgroundColor: apple.colors.card,
    ...apple.shadow.subtle,
  },
  typeBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: apple.colors.secondaryLabel,
  },
  typeBtnTextActive: {
    color: apple.colors.label,
    fontWeight: '700',
  },
  dateBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: apple.spacing.l,
    marginBottom: apple.spacing.s,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: apple.colors.card,
    borderRadius: apple.radius.s,
    gap: 8,
    borderWidth: 0.5,
    borderColor: apple.colors.separator,
  },
  dateText: {
    fontSize: 13,
    fontWeight: '600',
    color: apple.colors.label,
  },
  summaryCard: {
    flexDirection: 'row',
    backgroundColor: apple.colors.card,
    borderRadius: apple.radius.m,
    marginHorizontal: apple.spacing.l,
    marginBottom: apple.spacing.m,
    padding: apple.spacing.m,
    ...apple.shadow.subtle,
  },
  summaryCol: {
    flex: 1,
    alignItems: 'center',
  },
  summaryDivider: {
    width: 0.5,
    backgroundColor: apple.colors.separator,
  },
  summaryLabel: {
    fontSize: 10,
    color: apple.colors.secondaryLabel,
    marginBottom: 2,
  },
  summaryVal: {
    fontSize: 13,
    fontWeight: '800',
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
    alignItems: 'center',
  },
  userName: {
    fontSize: 15,
    fontWeight: '700',
    color: apple.colors.label,
  },
  userRole: {
    fontSize: 10,
    fontWeight: '700',
    color: apple.colors.secondaryLabel,
    marginTop: 1,
  },
  btnExport: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: apple.radius.s,
    backgroundColor: apple.colors.blueLight,
    gap: 5,
  },
  btnExportText: {
    fontSize: 12,
    fontWeight: '700',
    color: apple.colors.blue,
  },
  divider: {
    height: 0.5,
    backgroundColor: apple.colors.separator,
    marginVertical: 10,
  },
  grid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  gridItem: {
    flex: 1,
    alignItems: 'center',
  },
  gridLabel: {
    fontSize: 10,
    color: apple.colors.secondaryLabel,
    marginBottom: 1,
  },
  gridVal: {
    fontSize: 12,
    fontWeight: '700',
    color: apple.colors.label,
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
