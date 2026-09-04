import * as React from 'react';
import { View, ActivityIndicator } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Icon from 'react-native-vector-icons/FontAwesome';

import LoginScreen from './LoginScreen';
import Payments from './payments/Payments';
import CrearCliente from './createClient/CrearCliente';
import CajaScreen from './caja/Caja';
import MovementsScreen from './movements/Movements';
import { useAuth } from '../context/AuthContext';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

export const menuConfig = {
  vendedor: [
    { key: 'payments', title: 'Pagos', route: 'Payments', icon: 'money', permissions: ['vendedor', 'admin'] },
    { key: 'create_sale', title: 'Nueva Venta', route: 'CreateClient', icon: 'user-plus', permissions: ['vendedor', 'admin'] },
    { key: 'movements', title: 'Movimientos', route: 'Movements', icon: 'exchange', permissions: ['vendedor', 'admin'] },
    { key: 'caja', title: 'Caja', route: 'Caja', icon: 'shopping-cart', permissions: ['vendedor', 'admin'] },
  ],
  admin: [
    { key: 'payments', title: 'Pagos', route: 'Payments', icon: 'money', permissions: ['admin', 'vendedor'] },
    { key: 'create_sale', title: 'Nueva Venta', route: 'CreateClient', icon: 'user-plus', permissions: ['admin', 'vendedor'] },
    { key: 'movements', title: 'Movimientos', route: 'Movements', icon: 'exchange', permissions: ['admin', 'vendedor'] },
    { key: 'caja', title: 'Caja', route: 'Caja', icon: 'shopping-cart', permissions: ['admin', 'vendedor'] },
  ],
  cliente: [
    { key: 'payments', title: 'Mis Pagos', route: 'Payments', icon: 'money', permissions: ['cliente'] },
    { key: 'caja', title: 'Estado', route: 'Caja', icon: 'shopping-cart', permissions: ['cliente'] },
  ],
};

const routeComponents = {
  CreateClient: CrearCliente,
  Payments: Payments,
  Movements: MovementsScreen,
  Caja: CajaScreen,
};

function MainTabs() {
  const { rol } = useAuth();
  const perfil = rol || 'vendedor';
  const options = menuConfig[perfil] || menuConfig.vendedor;

  return (
    <Tab.Navigator
      screenOptions={{
        tabBarStyle: {
          backgroundColor: '#FFFFFF',
          borderTopWidth: 1,
          borderTopColor: '#E8EAED',
          height: 64,
          paddingTop: 6,
          paddingBottom: 8,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600', letterSpacing: 0.1, marginTop: 2 },
        tabBarActiveTintColor: '#007AFF',
        tabBarInactiveTintColor: '#8E8E93',
        tabBarItemStyle: { justifyContent: 'center', alignItems: 'center' },
        headerShown: false,
      }}
    >
      {options.map(item => (
        <Tab.Screen
          key={item.route}
          name={item.route}
          component={routeComponents[item.route]}
          options={{
            tabBarIcon: ({ color, focused }) => (
              <View style={{ alignItems: 'center', justifyContent: 'center', width: 36, height: 28 }}>
                <Icon name={item.icon} size={22} color={color} />
              </View>
            ),
            tabBarLabel: item.title,
          }}
        />
      ))}
    </Tab.Navigator>
  );
}

function RootNavigator() {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#007bff" />
      </View>
    );
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {session ? (
        <Stack.Screen name="Main" component={MainTabs} />
      ) : (
        <Stack.Screen name="Login" component={LoginScreen} />
      )}
    </Stack.Navigator>
  );
}

export default function Navigation() {
  return (
    <NavigationContainer>
      <RootNavigator />
    </NavigationContainer>
  );
} 