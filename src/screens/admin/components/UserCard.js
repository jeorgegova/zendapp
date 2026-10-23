// src/screens/admin/components/UserCard.js
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import Icon from 'react-native-vector-icons/FontAwesome';
import { apple } from '../../../theme/appleTheme';

const formatMoney = (val) => {
  const num = parseFloat(val) || 0;
  return '$' + num.toLocaleString('es-CO');
};

export const UserCard = ({ user, onEdit, onToggle }) => {
  const isAdmin = user.rol === 'admin';
  const isActive = user.activo !== false;

  return (
    <View style={styles.card}>
      {/* Cabecera */}
      <View style={styles.header}>
        <View style={styles.userTitleRow}>
          <View style={[styles.avatarBadge, isAdmin ? styles.avatarAdmin : styles.avatarVendedor]}>
            <Icon name={isAdmin ? 'shield' : 'user'} size={16} color={isAdmin ? '#5856D6' : apple.colors.blue} />
          </View>
          <View style={{ marginLeft: 10, flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={styles.userName} numberOfLines={1}>
                {user.nombre} {user.apellido || ''}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
              <View style={[styles.badge, isAdmin ? styles.badgeAdmin : styles.badgeVendedor]}>
                <Text style={[styles.badgeText, isAdmin ? styles.badgeTextAdmin : styles.badgeTextVendedor]}>
                  {user.rol?.toUpperCase()}
                </Text>
              </View>
              {user.email ? (
                <Text style={styles.userEmail} numberOfLines={1}>
                  {user.email}
                </Text>
              ) : null}
            </View>
          </View>
        </View>

        {/* Indicador de estado */}
        <View style={[styles.statusDot, { backgroundColor: isActive ? apple.colors.success : apple.colors.danger }]} />
      </View>

      {/* Límites y Permisos */}
      <View style={styles.divider} />
      <View style={styles.grid}>
        <View style={styles.gridItem}>
          <Text style={styles.gridLabel}>Max Caja</Text>
          <Text style={styles.gridValue}>{formatMoney(user.dinero_max_caja)}</Text>
        </View>
        <View style={styles.gridItem}>
          <Text style={styles.gridLabel}>Max Venta</Text>
          <Text style={styles.gridValue}>{formatMoney(user.dinero_max_venta)}</Text>
        </View>
        <View style={styles.gridItem}>
          <Text style={styles.gridLabel}>Max Gasto</Text>
          <Text style={styles.gridValue}>{formatMoney(user.dinero_max_gasto)}</Text>
        </View>
        <View style={styles.gridItem}>
          <Text style={styles.gridLabel}>Max Cuotas</Text>
          <Text style={styles.gridValue}>{user.max_cuotas || 30}</Text>
        </View>
      </View>

      {/* Permisos Flags */}
      <View style={styles.flagsRow}>
        <View style={styles.flagItem}>
          <Icon
            name={user.permite_borrar_venta ? 'check-circle' : 'times-circle'}
            size={13}
            color={user.permite_borrar_venta ? apple.colors.success : apple.colors.tertiaryLabel}
          />
          <Text style={[styles.flagText, user.permite_borrar_venta && styles.flagTextActive]}>
            Borrar venta
          </Text>
        </View>
        <View style={styles.flagItem}>
          <Icon
            name={user.permite_modificar_pagos ? 'check-circle' : 'times-circle'}
            size={13}
            color={user.permite_modificar_pagos ? apple.colors.success : apple.colors.tertiaryLabel}
          />
          <Text style={[styles.flagText, user.permite_modificar_pagos && styles.flagTextActive]}>
            Modificar pagos
          </Text>
        </View>
      </View>

      {/* Botones de Acción */}
      <View style={styles.actionsRow}>
        <TouchableOpacity style={styles.btnEdit} onPress={() => onEdit(user)}>
          <Icon name="pencil" size={13} color={apple.colors.blue} />
          <Text style={styles.btnEditText}>Editar</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.btnToggle, isActive ? styles.btnDisable : styles.btnEnable]}
          onPress={() => onToggle(user)}
        >
          <Icon
            name={isActive ? 'ban' : 'check'}
            size={13}
            color={isActive ? apple.colors.danger : apple.colors.success}
          />
          <Text style={[styles.btnToggleText, { color: isActive ? apple.colors.danger : apple.colors.success }]}>
            {isActive ? 'Inhabilitar' : 'Habilitar'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: apple.colors.card,
    borderRadius: apple.radius.m,
    padding: apple.spacing.m,
    marginBottom: apple.spacing.m,
    ...apple.shadow.card,
    ...apple.border.card,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  userTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  avatarBadge: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarAdmin: {
    backgroundColor: '#F0EFFF',
  },
  avatarVendedor: {
    backgroundColor: apple.colors.blueLight,
  },
  userName: {
    fontSize: 16,
    fontWeight: '700',
    color: apple.colors.label,
  },
  userEmail: {
    fontSize: 12,
    color: apple.colors.tertiaryLabel,
    marginLeft: 8,
    flex: 1,
  },
  badge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  badgeAdmin: {
    backgroundColor: '#F0EFFF',
  },
  badgeVendedor: {
    backgroundColor: apple.colors.blueLight,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  badgeTextAdmin: {
    color: '#5856D6',
  },
  badgeTextVendedor: {
    color: apple.colors.blue,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginLeft: 8,
  },
  divider: {
    height: 0.5,
    backgroundColor: apple.colors.separator,
    marginVertical: 12,
  },
  grid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: apple.colors.bgGrouped,
    borderRadius: apple.radius.s,
    padding: 10,
  },
  gridItem: {
    alignItems: 'center',
    flex: 1,
  },
  gridLabel: {
    fontSize: 10,
    color: apple.colors.secondaryLabel,
    fontWeight: '500',
    marginBottom: 2,
  },
  gridValue: {
    fontSize: 12,
    fontWeight: '700',
    color: apple.colors.label,
  },
  flagsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 10,
  },
  flagItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  flagText: {
    fontSize: 12,
    color: apple.colors.tertiaryLabel,
    marginLeft: 5,
  },
  flagTextActive: {
    color: apple.colors.label,
    fontWeight: '500',
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 14,
    gap: 8,
  },
  btnEdit: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: apple.radius.s,
    backgroundColor: apple.colors.blueLight,
  },
  btnEditText: {
    fontSize: 13,
    fontWeight: '600',
    color: apple.colors.blue,
    marginLeft: 5,
  },
  btnToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: apple.radius.s,
  },
  btnDisable: {
    backgroundColor: '#FFEBEA',
  },
  btnEnable: {
    backgroundColor: '#E8F8EE',
  },
  btnToggleText: {
    fontSize: 13,
    fontWeight: '600',
    marginLeft: 5,
  },
});
