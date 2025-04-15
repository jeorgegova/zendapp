import React from 'react';
import { View, Text, Button } from 'react-native';

class LoginScreen extends React.Component {
  render() {
    const { navigation } = this.props;
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: 24, marginBottom: 16 }}>Pantalla Login</Text>
        <Button title="Volver a Home" onPress={() => navigation.navigate('Home')} />
      </View>
    );
  }
}

export default LoginScreen; 