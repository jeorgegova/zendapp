// src/screens/admin/AdminUsuarios.js
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
  BackHandler,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/FontAwesome';
import { apple } from '../../theme/appleTheme';
import { appAlert } from '../../components/AppAlert';
import { useAuth } from '../../context/AuthContext';
import {
  getSubordinates,
  createAdminUser,
  updateAdminUser,
  toggleAdminUser,
} from '../../services/adminService';
import { UserCard } from './components/UserCard';
import { UserModal } from './components/UserModal';

export default function AdminUsuarios() {
  const [users, setUsers] = useState([]);
  const [filteredUsers, setFilteredUsers] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const { signOut } = useAuth();

  const handleLogout = useCallback(() => {
    Alert.alert(
      'Cerrar Sesión',
      '¿Estás seguro de que deseas cerrar sesión en Zendapp?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Cerrar Sesión',
          style: 'destructive',
          onPress: async () => {
            try {
              await signOut();
            } catch (err) {
              appAlert('Error', err.message);
            }
          },
        },
      ]
    );
  }, [signOut]);

  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        handleLogout();
        return true;
      });
      return () => sub.remove();
    }, [handleLogout])
  );

  const loadUsers = useCallback(async () => {
    try {
      const data = await getSubordinates();
      setUsers(data);
    } catch (err) {
      appAlert('Error', err.message || 'No se pudieron cargar los usuarios');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  useEffect(() => {
    if (!search.trim()) {
      setFilteredUsers(users);
    } else {
      const q = search.toLowerCase();
      setFilteredUsers(
        users.filter(
          (u) =>
            u.nombre?.toLowerCase().includes(q) ||
            u.apellido?.toLowerCase().includes(q) ||
            u.email?.toLowerCase().includes(q)
        )
      );
    }
  }, [search, users]);

  const onRefresh = () => {
    setRefreshing(true);
    loadUsers();
  };

  const handleCreate = () => {
    setEditingUser(null);
    setModalVisible(true);
  };

  const handleEdit = (user) => {
    setEditingUser(user);
    setModalVisible(true);
  };

  const handleToggle = async (user) => {
    try {
      const res = await toggleAdminUser(user.id);
      appAlert(
        'Actualizado',
        `Usuario ${res.activo ? 'habilitado' : 'inhabilitado'} correctamente`
      );
      loadUsers();
    } catch (err) {
      appAlert('Error', err.message);
    }
  };

  const handleSaveUser = async (formData) => {
    try {
      if (editingUser) {
        await updateAdminUser(editingUser.id, formData);
        appAlert('Éxito', 'Usuario actualizado correctamente');
      } else {
        await createAdminUser(formData);
        appAlert('Éxito', 'Usuario creado exitosamente');
      }
      loadUsers();
    } catch (err) {
      console.log("eeeerror", err);

      appAlert('Error', err.message);
    }
  };

  const vendedoresCount = users.filter((u) => u.rol === 'vendedor').length;
  const adminsCount = users.filter((u) => u.rol === 'admin').length;

  return (
    <SafeAreaView style={styles.root}>
      {/* Header */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Usuarios</Text>
          <Text style={styles.headerSubtitle}>
            {vendedoresCount} {vendedoresCount === 1 ? 'vendedor' : 'vendedores'} · {adminsCount} {adminsCount === 1 ? 'admin' : 'admins'}
          </Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.headerLogoutBtn}
            onPress={handleLogout}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Icon name="sign-out" size={17} color={apple.colors.danger} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerBtn} onPress={handleCreate}>
            <Icon name="plus" size={16} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Buscador */}
      <View style={styles.searchContainer}>
        <Icon name="search" size={14} color={apple.colors.tertiaryLabel} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Buscar por nombre o correo..."
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

      {/* Lista */}
      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={apple.colors.blue} />
        </View>
      ) : (
        <FlatList
          data={filteredUsers}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <UserCard user={item} onEdit={handleEdit} onToggle={handleToggle} />
          )}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={apple.colors.blue} />}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Icon name="users" size={48} color={apple.colors.tertiaryLabel} />
              <Text style={styles.emptyTitle}>No hay usuarios</Text>
              <Text style={styles.emptySubtitle}>
                {search ? 'No se encontraron coincidencias' : 'Crea tu primer vendedor con el botón +'}
              </Text>
            </View>
          }
        />
      )}

      {/* Modal Crear / Editar */}
      <UserModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        onSave={handleSaveUser}
        editingUser={editingUser}
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
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerLogoutBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#FFEBEA',
    justifyContent: 'center',
    alignItems: 'center',
    ...apple.shadow.subtle,
  },
  headerBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: apple.colors.blue,
    justifyContent: 'center',
    alignItems: 'center',
    ...apple.shadow.subtle,
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
