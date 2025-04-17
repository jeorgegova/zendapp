import React, { useState } from 'react';
import { View, Text, Button, StyleSheet, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons'; 
// O puedes usar otros sets como FontAwesome, Ionicons, etc.


const HomeScreen = (props) => {
  console.log("Props recibidos en HomeScreen:", props);
  const user = props.route.params?.user;
  console.log("Usuario recibido en HomeScreen:", user);
  const navigation = useNavigation();
  const [perfil, setPerfil] = useState('seller');

  const menuOptions = {
    seller: [
      { title: 'Crear Cliente', route: 'CreateClient', icon: 'account-search' },
      /* { title: 'Movimientos', route: 'Movements', icon: 'swap-horizontal' },
      { title: 'Caja', route: 'Caja', icon: 'cash-register' },
      { title: 'Pagos', route: 'Pagos', icon: 'credit-card-outline' }, */
    ],
    admin: [
      { title: 'Abrir Caja', route: 'AbrirCaja', icon: 'lock-open-outline' },
      { title: 'Registrar Cliente', route: 'NuevoCliente', icon: 'account-multiple-plus' },
      { title: 'Ver Facturas', route: 'Facturas', icon: 'file-document-outline' },
    ],
  };


  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Pantalla Home</Text>
        <Text style={styles.subtitle}>Bienvenido(a), {user.full_name}</Text>
      </View>

      <View style={styles.footer}>
        {menuOptions[perfil]?.map((item, index) => (
          <View key={index} style={styles.menuItem}>
            <Icon
              name={item.icon}
              size={28}
              color="#333"
              onPress={() => navigation.navigate(item.route)}
            />
            <Text style={styles.menuLabel}>{item.title}</Text>
          </View>
        ))}
      </View>

    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'space-between',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 24,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderColor: '#ccc',
    backgroundColor: '#fff',
  },
  menuItem: {
    alignItems: 'center',
  },
  menuLabel: {
    fontSize: 12,
    marginTop: 4,
  },
  footerButton: {
    paddingHorizontal: 10,
  },
  footerButtonText: {
    fontSize: 14,
    color: '#007bff',
  },
});

export default HomeScreen;
