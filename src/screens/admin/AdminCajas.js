// src/screens/admin/AdminCajas.js
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
  Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/FontAwesome';
import { apple } from '../../theme/appleTheme';
import { appAlert } from '../../components/AppAlert';
import { useAuth } from '../../context/AuthContext';
import { getAdminCajas, abrirCajasMasivo } from '../../services/adminService';
import { CajaCard } from './components/CajaCard';

export default function AdminCajas() {
  const navigation = useNavigation();
  const { userId, signOut } = useAuth();

  const [cajas, setCajas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [opening, setOpening] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const data = await getAdminCajas();
      setCajas(data);
    } catch (err) {
      appAlert('Error', err.message || 'No se pudieron cargar las cajas');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const handlePressAbrirMasivo = () => {
    Alert.alert(
      'Apertura Masiva de Cajas',
      '¿Deseas abrir las cajas de todos los usuarios activos?\n\nEl saldo inicial se tomará automáticamente del saldo final anterior (o $0 si es su primera caja).',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Abrir Cajas',
          onPress: async () => {
            setOpening(true);
            try {
              const res = await abrirCajasMasivo();
              appAlert('Éxito', `Se abrieron ${res.cajas_abiertas} cajas correctamente`);
              loadData();
            } catch (err) {
              appAlert('Error', err.message);
            } finally {
              setOpening(false);
            }
          },
        },
      ]
    );
  };

  const handleSelectCaja = (caja) => {
    navigation.navigate('AdminCajaDetalle', { caja });
  };

  return (
    <SafeAreaView style={styles.root}>
      {/* Header */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Gestión de Cajas</Text>
          <Text style={styles.headerSubtitle}>
            Supervisión diaria de operaciones
          </Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <TouchableOpacity
            style={styles.headerLogoutBtn}
            onPress={() => {
              Alert.alert('Cerrar Sesión', '¿Deseas salir de Zendapp?', [
                { text: 'Cancelar', style: 'cancel' },
                { text: 'Cerrar Sesión', style: 'destructive', onPress: signOut },
              ]);
            }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Icon name="sign-out" size={16} color={apple.colors.danger} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerBtn} onPress={handlePressAbrirMasivo} disabled={opening}>
            <Icon name="archive" size={14} color="#FFFFFF" />
            <Text style={styles.headerBtnText}>{opening ? 'Abriendo...' : 'Abrir Masivo'}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Lista de Cajas */}
      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={apple.colors.blue} />
        </View>
      ) : (
        <FlatList
          data={cajas}
          keyExtractor={(item) => item.caja_id}
          renderItem={({ item }) => (
            <CajaCard
              caja={item}
              isMyCaja={item.usuario_id === userId}
              onPress={handleSelectCaja}
            />
          )}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={apple.colors.blue} />}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Icon name="archive" size={48} color={apple.colors.tertiaryLabel} />
              <Text style={styles.emptyTitle}>No hay cajas registradas</Text>
              <Text style={styles.emptySubtitle}>Usa el botón "Abrir Masivo" para iniciar el día</Text>
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
    paddingBottom: apple.spacing.s,
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
  headerLogoutBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FFEBEA',
    justifyContent: 'center',
    alignItems: 'center',
    ...apple.shadow.subtle,
  },
  headerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: apple.colors.blue,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: apple.radius.m,
    gap: 6,
    ...apple.shadow.subtle,
  },
  headerBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  listContent: {
    paddingHorizontal: apple.spacing.l,
    paddingTop: apple.spacing.s,
    paddingBottom: apple.spacing.xl,
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
    textAlign: 'center',
  },
});
